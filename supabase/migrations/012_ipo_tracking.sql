-- IPO tracking. ADDITIVE ONLY: creates two new tables; no existing table, column,
-- constraint, policy or row is modified. Safe to re-run (idempotent).
-- Conventions follow 001: user_id -> auth.users, RLS "for all to authenticated", set_updated_at trigger.
-- All monetary columns are in INR (rupees). Unknown values stay NULL; nothing is defaulted or assumed.

create table if not exists public.ipo_trades (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,

  company_name text not null check (length(btrim(company_name)) > 0),
  symbol text,
  exchange text,
  ipo_type text check (ipo_type is null or ipo_type in ('MAINBOARD', 'SME')),

  -- Application / mandate
  mandate_type text check (mandate_type is null or mandate_type in ('ASBA', 'UPI')),
  bid_type text check (bid_type is null or bid_type in ('CUTOFF', 'LIMIT')),
  application_number text,
  dp_id text,
  client_id text,
  hold_account_masked text,

  -- Issue schedule and pricing
  open_date date,
  close_date date,
  price_band_low numeric(14,2) check (price_band_low is null or price_band_low > 0),
  price_band_high numeric(14,2) check (price_band_high is null or price_band_high > 0),
  cutoff_price numeric(14,2) check (cutoff_price is null or cutoff_price > 0),
  applied_price numeric(14,2) check (applied_price is null or applied_price > 0),
  issue_price numeric(14,2) check (issue_price is null or issue_price > 0), -- final price shares were allotted at
  lot_size integer check (lot_size is null or lot_size > 0),
  lots integer check (lots is null or lots > 0),
  quantity integer check (quantity is null or quantity > 0),
  application_amount numeric(16,2) check (application_amount is null or application_amount >= 0),
  blocked_amount numeric(16,2) check (blocked_amount is null or blocked_amount >= 0),

  -- Lifecycle
  status text not null default 'APPLIED'
    check (status in ('APPLIED', 'ALLOTTED', 'PARTIALLY_ALLOTTED', 'NOT_ALLOTTED', 'LISTED')),
  allotment_date date,
  allotted_quantity integer check (allotted_quantity is null or allotted_quantity >= 0),
  refund_amount numeric(16,2) check (refund_amount is null or refund_amount >= 0),
  listing_date date,
  listing_price numeric(14,2) check (listing_price is null or listing_price > 0),

  -- Price tracking (never auto-filled; always carries its timestamp and source)
  current_price numeric(14,2) check (current_price is null or current_price > 0),
  current_price_at timestamptz,
  current_price_source text check (current_price_source is null or current_price_source in ('MANUAL', 'SCREENSHOT', 'PROVIDER')),

  -- Exit (realized)
  exit_price numeric(14,2) check (exit_price is null or exit_price > 0),
  exit_quantity integer check (exit_quantity is null or exit_quantity > 0),
  exit_date date,
  exit_charges numeric(14,2) check (exit_charges is null or exit_charges >= 0),

  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint ipo_trades_dates_order check (open_date is null or close_date is null or close_date >= open_date),
  constraint ipo_trades_band_order check (price_band_low is null or price_band_high is null or price_band_high >= price_band_low),
  constraint ipo_trades_price_requires_timestamp check (current_price is null or (current_price_at is not null and current_price_source is not null))
);

-- One application number per user (an application number identifies a single bid).
create unique index if not exists ipo_trades_user_application_unique_idx
  on public.ipo_trades (user_id, application_number) where application_number is not null;
create index if not exists ipo_trades_user_status_idx on public.ipo_trades (user_id, status);
create index if not exists ipo_trades_user_close_date_idx on public.ipo_trades (user_id, close_date desc);
create index if not exists ipo_trades_user_created_at_idx on public.ipo_trades (user_id, created_at desc);

-- Raw OCR is preserved verbatim for debugging, together with what the user finally confirmed.
create table if not exists public.ipo_extractions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  ipo_trade_id uuid references public.ipo_trades(id) on delete set null,
  kind text not null check (kind in ('APPLICATION', 'ALLOTMENT', 'PRICE', 'UNKNOWN')),
  status text not null default 'EXTRACTED' check (status in ('EXTRACTED', 'CONFIRMED', 'REJECTED')),
  original_name text,
  sha256 text,
  raw_text text not null default '',
  ocr_confidence numeric(5,4) check (ocr_confidence is null or (ocr_confidence >= 0 and ocr_confidence <= 1)),
  parsed jsonb not null default '{}'::jsonb,
  confirmed jsonb,
  created_at timestamptz not null default now()
);

create index if not exists ipo_extractions_user_created_idx on public.ipo_extractions (user_id, created_at desc);
create index if not exists ipo_extractions_ipo_idx on public.ipo_extractions (ipo_trade_id);
create unique index if not exists ipo_extractions_user_sha_kind_idx
  on public.ipo_extractions (user_id, sha256, kind) where sha256 is not null;

drop trigger if exists ipo_trades_set_updated_at on public.ipo_trades;
create trigger ipo_trades_set_updated_at before update on public.ipo_trades
  for each row execute function public.set_updated_at();

alter table public.ipo_trades enable row level security;
alter table public.ipo_extractions enable row level security;

drop policy if exists "Users manage their ipo trades" on public.ipo_trades;
create policy "Users manage their ipo trades" on public.ipo_trades for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "Users manage their ipo extractions" on public.ipo_extractions;
create policy "Users manage their ipo extractions" on public.ipo_extractions for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- Publish changes so other open devices (website / Android) revalidate, as in 006.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'ipo_trades') then
      alter publication supabase_realtime add table public.ipo_trades;
    end if;
  end if;
end $$;
