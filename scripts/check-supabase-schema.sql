-- Check 1: Does trade_status enum include LIQUIDATED?
-- Run in Supabase SQL Editor
SELECT enumlabel 
FROM pg_enum 
WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname = 'trade_status');

-- Check 2: List all constraints on trades table
SELECT constraint_name, constraint_type 
FROM information_schema.table_constraints 
WHERE table_name = 'trades';

-- Check 3: Get the definition of trades_status_check constraint
SELECT pg_get_constraintdef(oid) 
FROM pg_constraint 
WHERE conname = 'trades_status_check';

-- Check 4: Get the definition of trades_close_reason_check constraint
SELECT pg_get_constraintdef(oid) 
FROM pg_constraint 
WHERE conname = 'trades_close_reason_check';

-- Check 5: List all trades with their current status values
SELECT status, COUNT(*) as count
FROM public.trades 
GROUP BY status;

-- Check 6: Look for any trades with status values not in the enum
SELECT DISTINCT status 
FROM public.trades 
WHERE status NOT IN ('OPEN', 'CLOSED', 'LIQUIDATED');

-- Check 7: Verify the exact trades being mentioned by the user
SELECT id, symbol, direction, status, close_reason 
FROM public.trades 
WHERE symbol LIKE 'RECALL%' 
ORDER BY created_at DESC 
LIMIT 5;
