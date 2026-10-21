-- CRITICAL DIAGNOSTICS FOR LIQUIDATION CONSTRAINT ERROR
-- Run ALL of these in Supabase SQL Editor and share EXACT results

-- 1. GET ACTUAL COLUMN DEFINITION
SELECT 
  column_name,
  data_type,
  is_nullable,
  column_default,
  domain_name
FROM information_schema.columns
WHERE table_name = 'trades' AND column_name = 'status';

-- 2. GET ALL CONSTRAINTS ON trades TABLE
SELECT 
  constraint_name,
  constraint_type,
  table_name
FROM information_schema.table_constraints
WHERE table_name = 'trades'
ORDER BY constraint_name;

-- 3. GET EXACT TEXT OF trades_status_check CONSTRAINT
SELECT pg_get_constraintdef(oid) as constraint_definition
FROM pg_constraint 
WHERE conname = 'trades_status_check';

-- 4. GET EXACT TEXT OF trades_close_reason_check CONSTRAINT
SELECT pg_get_constraintdef(oid) as constraint_definition
FROM pg_constraint 
WHERE conname = 'trades_close_reason_check';

-- 5. LIST ALL CHECK CONSTRAINTS ON trades
SELECT 
  constraint_name,
  pg_get_constraintdef(oid) as constraint_definition
FROM pg_constraint 
WHERE contype = 'c' AND conrelid = 'public.trades'::regclass;

-- 6. SHOW TRADE_STATUS ENUM VALUES
SELECT enumlabel, enumsortorder
FROM pg_enum
WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname = 'trade_status')
ORDER BY enumsortorder;

-- 7. COUNT TRADES BY STATUS
SELECT status, COUNT(*) as count
FROM public.trades
GROUP BY status
ORDER BY status;

-- 8. GET ANY TRADES WITH INVALID STATUS VALUES
SELECT id, status, symbol, direction
FROM public.trades
WHERE status NOT IN ('OPEN', 'CLOSED', 'LIQUIDATED')
LIMIT 10;

-- 9. CHECK IF THERE ARE ANY TRIGGERS ON trades TABLE
SELECT 
  trigger_name,
  event_object_table,
  action_statement
FROM information_schema.triggers
WHERE event_object_table = 'trades';

-- 10. FIND THE SPECIFIC RECALL/USDT TRADE
SELECT 
  id,
  symbol,
  direction,
  status,
  avg_entry,
  pnl_amount,
  close_price,
  open_time,
  close_time
FROM public.trades
WHERE symbol LIKE '%RECALL%'
ORDER BY created_at DESC
LIMIT 5;

-- 11. GET THE COLUMN TYPES FOR ALL COLUMNS
SELECT 
  column_name,
  data_type,
  column_default,
  is_nullable
FROM information_schema.columns
WHERE table_name = 'trades'
ORDER BY ordinal_position;
