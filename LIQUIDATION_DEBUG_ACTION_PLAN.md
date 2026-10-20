# LIQUIDATION Status Update - Debugging Action Plan

## Current Status
- **OCR Classification**: ✅ Working correctly (LIQUIDATION type detected)
- **Code Logic**: ✅ Status value correctly set to 'LIQUIDATED'
- **Payload Construction**: ✅ All constraints would be satisfied
- **Database Schema**: ❓ Unknown - needs verification
- **Live Error**: ❌ `violates check constraint 'trades_status_check'`

## Root Cause Analysis

The error message explicitly mentions `trades_status_check`, which is defined in migration 010:
```sql
ADD CONSTRAINT trades_status_check CHECK (
  status IN ('OPEN', 'CLOSED', 'LIQUIDATED')
)
```

If this constraint is failing with status='LIQUIDATED', it means **one of these must be true**:

### Scenario 1: Migrations Haven't Been Applied ⚠️
- Migration 009 (`009_add_liquidated_status.sql`) not run
- Migration 010 (`010_fix_liquidated_status_constraint.sql`) not run
- User's Supabase instance is using old schema

**Evidence**: Error message mentions `trades_status_check` (which only exists in migration 010)

### Scenario 2: Enum Type Doesn't Include LIQUIDATED ⚠️
- `trade_status` enum created in migration 001 with only `'OPEN'` and `'CLOSED'`
- Migration 009 tried to add LIQUIDATED but failed silently
- Sending status='LIQUIDATED' fails at enum validation, not at constraint

**Evidence**: Would see different error: "invalid input value for enum trade_status"

### Scenario 3: Status Not Being Sent in Payload ❌
- Least likely - we explicitly construct liquidationPatch with status
- Would see `status` field missing from logs

**Evidence**: [UPDATE TRADE] logs would show status not in payload

### Scenario 4: Status Becoming Invalid Somewhere 🔍
- Status variable converted to null/undefined before Supabase call
- Status field filtered out by toTradeRow logic
- JavaScript type coercion issue

**Evidence**: [UPDATE TRADE] logs would show null/undefined status

---

## Immediate Actions

### Step 1: Verify Database Schema
Open your Supabase SQL Editor and run:

```sql
-- Check if trade_status enum includes LIQUIDATED
SELECT enumlabel FROM pg_enum 
WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname = 'trade_status')
ORDER BY enumsortorder;
```

**Expected output:**
```
 enumlabel
-----------
 OPEN
 CLOSED
 LIQUIDATED
```

If you only see OPEN and CLOSED, the enum is missing LIQUIDATED and needs migration 009.

### Step 2: Verify Constraints
```sql
-- Check trades_status_check constraint definition
SELECT pg_get_constraintdef(oid) FROM pg_constraint 
WHERE conname = 'trades_status_check';

-- Check trades_close_reason_check constraint definition  
SELECT pg_get_constraintdef(oid) FROM pg_constraint 
WHERE conname = 'trades_close_reason_check';
```

**Expected output for trades_status_check:**
```
CHECK (status IN ('OPEN'::text, 'CLOSED'::text, 'LIQUIDATED'::text))
```

If you only see `trades_close_reason_check`, then migration 010 hasn't been applied.

### Step 3: Collect Browser Console Logs
1. Open Browser DevTools (F12)
2. Go to Console tab
3. Upload the LIQUIDATION screenshot again  
4. Try to Confirm Trade
5. Look for these log patterns:
   - `[MATCHED_TRADE_BRANCH]` - should show the matched trade found
   - `[LIQUIDATION BRANCH]` - should show entering liquidation update
   - `[LIQUIDATION_BRANCH_ENTRY]` - should show trade update beginning
   - `[UPDATE TRADE] Input patch:` - should show status: 'LIQUIDATED'
   - `[UPDATE TRADE] Converted payload:` - should show status: 'LIQUIDATED'
   - `[UPDATE TRADE] SUPABASE ERROR:` - the actual error details

6. **Share ALL three of these logs** with the exact status values shown

---

## If Migration 009/010 Haven't Been Applied

Run these in Supabase SQL Editor in order:

```sql
-- First, add LIQUIDATED to the enum
DO $$
BEGIN
  ALTER TYPE public.trade_status ADD VALUE 'LIQUIDATED';
EXCEPTION WHEN DUPLICATE_OBJECT THEN NULL;
END $$;

-- Then, update the constraints
DO $$
BEGIN
  ALTER TABLE public.trades
  DROP CONSTRAINT IF EXISTS trades_close_reason_check;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

ALTER TABLE public.trades
ADD CONSTRAINT trades_close_reason_check CHECK (
  status IN ('CLOSED', 'LIQUIDATED') OR close_reason IS NULL
);

DO $$
BEGIN
  ALTER TABLE public.trades
  ADD CONSTRAINT trades_status_check CHECK (
    status IN ('OPEN', 'CLOSED', 'LIQUIDATED')
  );
EXCEPTION WHEN DUPLICATE_OBJECT THEN NULL;
END $$;
```

Then try the LIQUIDATION save again.

---

## Files Changed in This Session

- `src/services/tradeRepository.ts` - Enhanced logging in updateTrade()
- `src/services/screenshotExtractionService.ts` - Added matched trade flow logging
- `src/services/liquidation_status_update_test.test.ts` - Unit tests for status handling
- `src/services/liquidation_payload_test.test.ts` - Payload construction verification
- `src/services/constraint_simulation.test.ts` - Constraint violation analysis
- `scripts/check-supabase-schema.sql` - SQL diagnostic queries

---

## Next Steps

1. **Run the SQL diagnostic queries** in Supabase to verify schema
2. **Check browser console logs** from the failed save attempt
3. **Share the logs** showing:
   - Whether matched trade was found
   - What status values are being sent
   - The exact Supabase error message
4. **If migrations haven't run**: Apply migrations 009 and 010 manually
5. **If migrations have run**: Use console logs to identify the exact failure point

---

## Test Results Summary

All code-level tests pass:
- ✅ Status value type is string 'LIQUIDATED'
- ✅ Payload construction is correct
- ✅ All field constraints would be satisfied
- ✅ toTradeRow correctly includes status field
- ✅ Build compiles without errors

The issue is **either in the database schema (migrations not applied) or in something that console logs will reveal**.
