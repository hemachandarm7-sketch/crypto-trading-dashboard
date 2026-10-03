-- Partial screenshot-confirmed trades may not yet include a visible direction.
-- Preserve the LONG/SHORT enum constraint when a direction is known, but allow NULL
-- until a later screenshot or user correction supplies it.
alter table public.trades alter column direction drop not null;
