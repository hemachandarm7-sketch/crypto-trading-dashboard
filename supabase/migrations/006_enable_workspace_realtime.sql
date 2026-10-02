-- Additive only: publish workspace table changes so already-open clients can revalidate.
-- Existing rows, table constraints and row-level security are unchanged.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'trades'
    ) then
      alter publication supabase_realtime add table public.trades;
    end if;
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'trade_events'
    ) then
      alter publication supabase_realtime add table public.trade_events;
    end if;
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'screenshots'
    ) then
      alter publication supabase_realtime add table public.screenshots;
    end if;
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'user_settings'
    ) then
      alter publication supabase_realtime add table public.user_settings;
    end if;
  end if;
end $$;
