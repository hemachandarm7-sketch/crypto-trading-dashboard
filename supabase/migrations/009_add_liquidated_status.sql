-- Add LIQUIDATED as a status option (not just a close reason)
-- This migration adds LIQUIDATED to the trade_status enum

DO $$
BEGIN
  -- Add LIQUIDATED to trade_status enum
  ALTER TYPE public.trade_status ADD VALUE 'LIQUIDATED';
EXCEPTION WHEN DUPLICATE_OBJECT THEN NULL;
END $$;

-- Note: Remove LIQUIDATED from trade_close_reason if it was previously added
-- Execute in Supabase SQL Editor if needed:
-- ALTER TYPE public.trade_close_reason DROP VALUE 'LIQUIDATED';
-- (This might fail if trades already use that value)
