-- Older trade_events tables may retain a CHECK constraint that omits the
-- POSITION_DETAILS lifecycle event used by the current application.
alter table public.trade_events
  drop constraint if exists trade_events_event_type_check;

-- NOT VALID preserves any historical legacy event values while enforcing the
-- current event contract for all new or updated rows.
alter table public.trade_events
  add constraint trade_events_event_type_check
  check (event_type::text in ('OPEN', 'CLOSE', 'PNL', 'POSITION_DETAILS'))
  not valid;
