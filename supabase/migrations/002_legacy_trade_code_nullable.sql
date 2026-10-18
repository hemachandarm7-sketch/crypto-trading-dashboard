-- Some previously configured Supabase databases have a legacy trade_code
-- column that is NOT NULL, even though trades are now identified by UUID.
-- Keep the legacy column for backward compatibility, but do not require it
-- for writes from the current application.
alter table public.trades
  add column if not exists trade_code text;

alter table public.trades
  alter column trade_code drop not null;

comment on column public.trades.trade_code is
  'Legacy optional identifier; current application trade identity is the UUID primary key.';
