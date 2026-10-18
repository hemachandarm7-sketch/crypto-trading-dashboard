-- Reconcile the legacy fields reported by existing Supabase projects.
-- The app's canonical trade identifier is trades.id (UUID), coin is derived
-- from symbol, and direction is stored in trades.direction. These old fields
-- are retained for compatibility but cannot be mandatory for new app writes.
alter table public.trades
  add column if not exists trade_code text,
  add column if not exists coin text;

do $$
declare
  legacy_column text;
begin
  foreach legacy_column in array array['trade_code', 'coin', 'side'] loop
    if exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'trades'
        and column_name = legacy_column
    ) then
      execute format('alter table public.trades alter column %I drop not null', legacy_column);
    end if;
  end loop;
end $$;
