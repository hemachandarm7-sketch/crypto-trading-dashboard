-- Older trading tables may require a separate base-coin column in addition
-- to the canonical pair stored in symbol (for example, RARE/USDT -> RARE).
alter table public.trades
  add column if not exists coin text;

-- coin is supplied by the application for new rows, but make it optional for
-- records where the screenshot or manual entry did not identify a base coin.
alter table public.trades
  alter column coin drop not null;
