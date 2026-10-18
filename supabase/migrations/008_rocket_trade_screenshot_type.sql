-- Rocket/summary screenshots are evidence, not close lifecycle events.
alter type public.screenshot_type add value if not exists 'ROCKET_TRADE';
