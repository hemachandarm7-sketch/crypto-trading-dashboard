-- Ensure position column exists and trades_position_check constraint is in place
-- This migration documents a legacy column that must be maintained for data integrity
-- The position column mirrors the direction column for trades_position_check constraint

-- Add position column if it doesn't exist
ALTER TABLE public.trades
ADD COLUMN IF NOT EXISTS position text;

-- Add the constraint if it doesn't exist
DO $$
BEGIN
  -- Try to add the constraint
  ALTER TABLE public.trades
  ADD CONSTRAINT trades_position_check CHECK (
    position IS NULL OR position IN ('LONG', 'SHORT')
  );
EXCEPTION WHEN DUPLICATE_OBJECT THEN
  -- Constraint already exists, do nothing
  NULL;
END $$;

-- Fix any existing NULL or invalid position values by syncing with direction
-- This is a data migration that handles existing rows
UPDATE public.trades
SET position = direction
WHERE position IS NULL OR position NOT IN ('LONG', 'SHORT')
  AND direction IN ('LONG', 'SHORT');

-- Log the results
DO $$
DECLARE
  v_fixed_count INT;
BEGIN
  SELECT COUNT(*) INTO v_fixed_count
  FROM public.trades
  WHERE position IS NULL OR position NOT IN ('LONG', 'SHORT');
  
  RAISE NOTICE 'trades_position_check: % rows still have invalid position after sync', v_fixed_count;
END $$;
