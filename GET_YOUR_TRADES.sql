-- RUN THESE TO FIND YOUR ACTUAL TRADES

-- First, get YOUR user_id
SELECT 
  user_id,
  COUNT(*) as trade_count
FROM public.trades
GROUP BY user_id
ORDER BY COUNT(*) DESC
LIMIT 5;

-- Then, find RECALL/USDT with YOUR user_id (replace USER_ID below)
SELECT 
  id,
  user_id,
  symbol,
  direction,
  status,
  open_time,
  close_time
FROM public.trades
WHERE user_id = 'YOUR_USER_ID_FROM_ABOVE'  -- Replace this
  AND symbol = 'RECALL/USDT'
ORDER BY created_at DESC
LIMIT 10;

-- Get ALL your trades
SELECT 
  id,
  symbol,
  direction,
  status,
  created_at
FROM public.trades
WHERE user_id = 'YOUR_USER_ID_FROM_ABOVE'  -- Replace this
ORDER BY created_at DESC
LIMIT 20;
