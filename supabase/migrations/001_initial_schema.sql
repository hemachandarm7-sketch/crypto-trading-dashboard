create extension if not exists pgcrypto;

do $$ begin create type public.trade_direction as enum ('LONG', 'SHORT'); exception when duplicate_object then null; end $$;
do $$ begin create type public.trade_status as enum ('OPEN', 'CLOSED'); exception when duplicate_object then null; end $$;
do $$ begin create type public.trade_close_reason as enum ('TP_HIT', 'SL_HIT', 'MANUAL_CLOSE', 'UNKNOWN'); exception when duplicate_object then null; end $$;
do $$ begin create type public.screenshot_type as enum ('OPEN_TRANSACTION', 'CLOSE_TRANSACTION', 'PNL', 'POSITION_DETAILS', 'UNKNOWN'); exception when duplicate_object then null; end $$;
do $$ begin create type public.screenshot_extraction_status as enum ('UPLOADED', 'PROCESSING', 'EXTRACTED', 'MATCHED', 'COMPLETED', 'FAILED'); exception when duplicate_object then null; end $$;
do $$ begin create type public.trade_event_type as enum ('OPEN', 'CLOSE', 'PNL', 'POSITION_DETAILS'); exception when duplicate_object then null; end $$;

create table if not exists public.trades (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  trade_code text,
  symbol text not null,
  exchange text,
  market_type text,
  direction public.trade_direction not null,
  leverage numeric(12,4) check (leverage is null or leverage > 0),
  quantity numeric(30,12) check (quantity is null or quantity >= 0),
  size numeric(30,12) check (size is null or size >= 0),
  margin numeric(30,12) check (margin is null or margin >= 0),
  avg_entry numeric(30,12),
  ltp numeric(30,12),
  liquidation_price numeric(30,12),
  take_profit numeric(30,12),
  stop_loss numeric(30,12),
  open_time timestamptz,
  close_time timestamptz,
  holding_duration_seconds bigint check (holding_duration_seconds is null or holding_duration_seconds >= 0),
  holding_duration_display text,
  close_price numeric(30,12),
  pnl_amount numeric(30,12),
  pnl_percentage numeric(18,8),
  status public.trade_status not null default 'OPEN',
  close_reason public.trade_close_reason,
  setup text,
  notes text,
  exchange_position_id text,
  open_transaction_id text,
  close_transaction_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint trades_close_reason_check check (status = 'CLOSED' or close_reason is null)
);

-- CREATE TABLE IF NOT EXISTS does not update a table left by an earlier/partial
-- setup. Add columns used by this application before defining indexes/policies.
-- Nullable additions preserve any existing rows; new app writes supply user_id.
alter table public.trades
  add column if not exists user_id uuid references auth.users(id) on delete cascade,
  add column if not exists trade_code text,
  add column if not exists symbol text,
  add column if not exists exchange text,
  add column if not exists market_type text,
  add column if not exists direction public.trade_direction,
  add column if not exists leverage numeric(12,4),
  add column if not exists quantity numeric(30,12),
  add column if not exists size numeric(30,12),
  add column if not exists margin numeric(30,12),
  add column if not exists avg_entry numeric(30,12),
  add column if not exists ltp numeric(30,12),
  add column if not exists liquidation_price numeric(30,12),
  add column if not exists take_profit numeric(30,12),
  add column if not exists stop_loss numeric(30,12),
  add column if not exists open_time timestamptz,
  add column if not exists close_time timestamptz,
  add column if not exists holding_duration_seconds bigint,
  add column if not exists holding_duration_display text,
  add column if not exists close_price numeric(30,12),
  add column if not exists pnl_amount numeric(30,12),
  add column if not exists pnl_percentage numeric(18,8),
  add column if not exists status public.trade_status default 'OPEN',
  add column if not exists close_reason public.trade_close_reason,
  add column if not exists setup text,
  add column if not exists notes text,
  add column if not exists exchange_position_id text,
  add column if not exists open_transaction_id text,
  add column if not exists close_transaction_id text,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create table if not exists public.screenshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  trade_id uuid references public.trades(id) on delete set null,
  storage_path text not null unique,
  screenshot_type public.screenshot_type not null default 'UNKNOWN',
  uploaded_at timestamptz not null default now(),
  extracted_at timestamptz,
  extraction_status public.screenshot_extraction_status not null default 'UPLOADED',
  extraction_raw_data jsonb,
  extraction_confidence numeric(5,4) check (extraction_confidence is null or extraction_confidence between 0 and 1),
  sha256 text not null,
  original_name text not null,
  content_type text not null check (content_type in ('image/png', 'image/jpeg', 'image/webp')),
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 10485760),
  created_at timestamptz not null default now(),
  unique (user_id, sha256)
);

alter table public.screenshots
  add column if not exists user_id uuid references auth.users(id) on delete cascade,
  add column if not exists trade_id uuid references public.trades(id) on delete set null,
  add column if not exists storage_path text,
  add column if not exists screenshot_type public.screenshot_type not null default 'UNKNOWN',
  add column if not exists uploaded_at timestamptz not null default now(),
  add column if not exists extracted_at timestamptz,
  add column if not exists extraction_status public.screenshot_extraction_status not null default 'UPLOADED',
  add column if not exists extraction_raw_data jsonb,
  add column if not exists extraction_confidence numeric(5,4),
  add column if not exists sha256 text,
  add column if not exists original_name text,
  add column if not exists content_type text,
  add column if not exists size_bytes bigint,
  add column if not exists created_at timestamptz not null default now();

create table if not exists public.trade_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  trade_id uuid references public.trades(id) on delete set null,
  event_type public.trade_event_type not null,
  event_time timestamptz,
  price numeric(30,12),
  percentage numeric(18,8),
  raw_data jsonb not null default '{}'::jsonb,
  screenshot_id uuid references public.screenshots(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (user_id, screenshot_id, event_type)
);

alter table public.trade_events
  add column if not exists user_id uuid references auth.users(id) on delete cascade,
  add column if not exists trade_id uuid references public.trades(id) on delete set null,
  add column if not exists event_type public.trade_event_type,
  add column if not exists event_time timestamptz,
  add column if not exists price numeric(30,12),
  add column if not exists percentage numeric(18,8),
  add column if not exists raw_data jsonb not null default '{}'::jsonb,
  add column if not exists screenshot_id uuid references public.screenshots(id) on delete set null,
  add column if not exists created_at timestamptz not null default now();

create table if not exists public.user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  default_leverage numeric(12,4) not null default 3 check (default_leverage > 0),
  default_exchange text not null default 'Binance',
  default_market text not null default 'Perpetual',
  currency text not null default 'USDT',
  theme text not null default 'dark' check (theme in ('dark', 'light')),
  default_range text not null default '30 Days',
  analytics_view text not null default 'Equity curve',
  updated_at timestamptz not null default now()
);

alter table public.user_settings
  add column if not exists user_id uuid references auth.users(id) on delete cascade,
  add column if not exists default_leverage numeric(12,4) not null default 3,
  add column if not exists default_exchange text not null default 'Binance',
  add column if not exists default_market text not null default 'Perpetual',
  add column if not exists currency text not null default 'USDT',
  add column if not exists theme text not null default 'dark',
  add column if not exists default_range text not null default '30 Days',
  add column if not exists analytics_view text not null default 'Equity curve',
  add column if not exists updated_at timestamptz not null default now();

create index if not exists trades_user_symbol_idx on public.trades (user_id, symbol);
create index if not exists trades_user_status_idx on public.trades (user_id, status);
create index if not exists trades_user_open_time_idx on public.trades (user_id, open_time desc);
create index if not exists trades_user_close_time_idx on public.trades (user_id, close_time desc);
create index if not exists trades_user_created_at_idx on public.trades (user_id, created_at desc);
create index if not exists trades_position_match_idx on public.trades (user_id, exchange_position_id) where exchange_position_id is not null;
create unique index if not exists trades_open_txn_unique_idx on public.trades (user_id, open_transaction_id) where open_transaction_id is not null;
create unique index if not exists trades_close_txn_unique_idx on public.trades (user_id, close_transaction_id) where close_transaction_id is not null;
create index if not exists screenshots_user_created_at_idx on public.screenshots (user_id, created_at desc);
create index if not exists screenshots_trade_id_idx on public.screenshots (trade_id);
create index if not exists screenshots_user_status_idx on public.screenshots (user_id, extraction_status);
create index if not exists trade_events_trade_id_idx on public.trade_events (trade_id, event_time);
create index if not exists trade_events_screenshot_id_idx on public.trade_events (screenshot_id);

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end $$;
drop trigger if exists trades_set_updated_at on public.trades;
create trigger trades_set_updated_at before update on public.trades for each row execute function public.set_updated_at();
drop trigger if exists settings_set_updated_at on public.user_settings;
create trigger settings_set_updated_at before update on public.user_settings for each row execute function public.set_updated_at();

alter table public.trades enable row level security;
alter table public.screenshots enable row level security;
alter table public.trade_events enable row level security;
alter table public.user_settings enable row level security;

drop policy if exists "Users manage their trades" on public.trades;
create policy "Users manage their trades" on public.trades for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "Users manage their screenshots" on public.screenshots;
create policy "Users manage their screenshots" on public.screenshots for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "Users manage their trade events" on public.trade_events;
create policy "Users manage their trade events" on public.trade_events for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "Users manage their settings" on public.user_settings;
create policy "Users manage their settings" on public.user_settings for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('trade-screenshots', 'trade-screenshots', false, 10485760, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = 10485760, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Users upload their trade screenshots" on storage.objects;
create policy "Users upload their trade screenshots" on storage.objects for insert to authenticated with check (bucket_id = 'trade-screenshots' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "Users read their trade screenshots" on storage.objects;
create policy "Users read their trade screenshots" on storage.objects for select to authenticated using (bucket_id = 'trade-screenshots' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "Users delete their trade screenshots" on storage.objects;
create policy "Users delete their trade screenshots" on storage.objects for delete to authenticated using (bucket_id = 'trade-screenshots' and (storage.foldername(name))[1] = (select auth.uid())::text);
