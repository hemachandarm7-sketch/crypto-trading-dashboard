-- Fix trades_close_reason_check constraint to allow LIQUIDATED status
-- Previous constraint only allowed CLOSED to have close_reason set
-- New constraint allows CLOSED and LIQUIDATED to have close_reason set

DO $$
BEGIN
  -- Try to drop existing constraint if it exists
  ALTER TABLE public.trades
  DROP CONSTRAINT IF EXISTS trades_close_reason_check;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- Add the corrected constraint that allows both CLOSED and LIQUIDATED
ALTER TABLE public.trades
ADD CONSTRAINT trades_close_reason_check CHECK (
  status IN ('CLOSED', 'LIQUIDATED') OR close_reason IS NULL
);

-- Add status constraint if it doesn't already exist
-- (though the enum type provides the primary validation)
DO $$
BEGIN
  ALTER TABLE public.trades
  ADD CONSTRAINT trades_status_check CHECK (
    status IN ('OPEN', 'CLOSED', 'LIQUIDATED')
  );
EXCEPTION WHEN DUPLICATE_OBJECT THEN
  NULL;
END $$;
