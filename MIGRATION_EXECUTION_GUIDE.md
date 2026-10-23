# MIGRATION EXECUTION GUIDE — Session 21+

## Critical Database Fix: Apply Migration 011

**Status:** Code is ready ✅ | Database migration PENDING ⏳

**What's Fixed:** The `position` column constraint violation that caused `400 Bad Request` on LIQUIDATION confirmation.

---

## Quick Summary

### The Problem
The live Supabase database has a `trades_position_check` constraint that requires the `position` column to be either 'LONG', 'SHORT', or NULL. When the app sends a PATCH without including the `position` field, Postgres re-validates the entire row, and if that row has an invalid `position` value, it returns **400 Bad Request**.

### The Solution (Code)
- ✅ **Commit f6f304d** updated the TypeScript types and database mapping to include `position`
- ✅ All code paths now set `position = direction ?? null`
- ✅ **Commit 7644a00** added comprehensive tests (4/4 passing)

### The Solution (Database)
- ⏳ **Migration 011** must be applied to:
  1. Ensure the `position` column exists
  2. Ensure the `trades_position_check` constraint exists
  3. Sync any invalid/NULL position values with direction

---

## Step 1: Access Supabase SQL Editor

### 1a. Log In
1. Go to [https://supabase.com](https://supabase.com)
2. Sign in to your account
3. Select the project: **apxlfnommafhiogvwtek** (ORBIT Trading Dashboard)

### 1b. Open SQL Editor
1. Click **SQL Editor** (left sidebar)
2. Click **New Query**

---

## Step 2: Apply the Migration

### 2a. Copy-Paste the Migration
Copy the following SQL and paste it into the SQL Editor:

```sql
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
```

### 2b. Execute the Query
1. Click the **Run** button (or press `Ctrl+Enter`)
2. Wait for the query to complete
3. You should see:
   - ✅ "Query successful" (green checkmark)
   - 📝 A notice message showing how many rows were fixed

---

## Step 3: Verify the Migration Applied Correctly

### 3a. Check Position Column Exists
Run this query in the SQL Editor:

```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'trades' AND column_name = 'position'
ORDER BY ordinal_position;
```

**Expected result:**
| column_name | data_type | is_nullable |
|-------------|-----------|-------------|
| position | text | YES |

### 3b. Check Constraint Exists
Run this query:

```sql
SELECT constraint_name, constraint_type
FROM information_schema.table_constraints
WHERE table_name = 'trades'
ORDER BY constraint_name;
```

**Expected result:** Should include `trades_position_check`

### 3c. Verify Data Integrity
Run this query to check how many rows were fixed:

```sql
SELECT 
  COUNT(*) as total_trades,
  SUM(CASE WHEN position IS NULL THEN 1 ELSE 0 END) as null_position_count,
  SUM(CASE WHEN position NOT IN ('LONG', 'SHORT') THEN 1 ELSE 0 END) as invalid_position_count,
  SUM(CASE WHEN position = direction THEN 1 ELSE 0 END) as synced_count
FROM public.trades;
```

**Expected result:**
- `total_trades`: your total number of trades
- `null_position_count`: 0 (all synced)
- `invalid_position_count`: 0 (all synced)
- `synced_count`: all trades where position was synced from direction

---

## Step 4: Deploy Code to Production

The code is already in the `main` branch (commit `7644a00`). If you haven't deployed it yet:

### For Vercel Deployment
```bash
cd crypto-trading-dashboard
git push origin main
# Vercel will auto-deploy
# Or manually trigger deploy from Vercel dashboard
```

---

## Step 5: Test the LIQUIDATION Fix

### 5a. Clear Browser Cache
1. Open the trading dashboard
2. Press `F12` (DevTools)
3. Go to **Application** tab
4. Click **Clear site data** (or **Clear Storage**)
5. Close DevTools

### 5b. Test LIQUIDATION Confirmation

1. **Find a LONG or SHORT open trade** in the UI
2. **Upload a LIQUIDATION screenshot** for that trade
3. **Let it auto-match** (don't manually select the trade)
4. **Click "Confirm Trade"**
5. **Expected outcome:** ✅ Trade closes with status LIQUIDATED

### 5c. Verify in Database

Run this query to confirm the trade was updated:

```sql
SELECT 
  id, symbol, direction, status, 
  position, created_at, close_time, close_reason
FROM public.trades
WHERE status = 'LIQUIDATED'
ORDER BY updated_at DESC
LIMIT 5;
```

**Expected result:**
- `status` = LIQUIDATED
- `position` = LONG or SHORT (matches direction)
- `close_reason` = LIQUIDATION_CLEARANCE or similar
- `close_time` = timestamp when closed

---

## Troubleshooting

### Issue: "constraint_violation" or "23514" error

This means the migration didn't apply correctly or the position values weren't synced.

**Solution:**
1. Run the verification queries from Step 3
2. Check the exact values causing the issue:
   ```sql
   SELECT id, direction, position
   FROM public.trades
   WHERE position IS NULL OR position NOT IN ('LONG', 'SHORT')
   LIMIT 10;
   ```
3. Manually fix them:
   ```sql
   UPDATE public.trades
   SET position = 'LONG'
   WHERE position IS NULL AND direction = 'LONG';
   ```

### Issue: "duplicate_object" error

This means the constraint already exists (which is fine). The migration handles this with `EXCEPTION WHEN DUPLICATE_OBJECT THEN NULL;`

**Solution:** Just run the rest of the migration manually:
```sql
UPDATE public.trades
SET position = direction
WHERE position IS NULL OR position NOT IN ('LONG', 'SHORT')
  AND direction IN ('LONG', 'SHORT');
```

### Issue: LIQUIDATION confirmation still fails with 400 error

1. Check the browser console (F12 → Console)
2. Look for the log `[PRE_UPDATE_VALIDATION]` - it should show `isValidStatus: true`
3. If it shows false, the status value might be corrupted
4. Run this query:
   ```sql
   SELECT DISTINCT status
   FROM public.trades
   ORDER BY status;
   ```
5. All values should be: OPEN, CLOSED, or LIQUIDATED (no whitespace, no other values)

---

## Post-Migration Checklist

- [ ] Migration 011 applied to Supabase ✅
- [ ] Verification queries confirm column and constraint exist ✅
- [ ] Data integrity check shows all positions synced ✅
- [ ] Code deployed to production ✅
- [ ] LIQUIDATION screenshot tested and confirmed to close trade ✅
- [ ] Database query confirms trade has `status = LIQUIDATED` ✅
- [ ] Browser cache cleared and re-tested ✅

---

## Next Steps (After Migration)

Once the migration is applied and tested:

1. **Fix Analytics Issues** (Sessions 22+)
   - `buildDirectionPerformance()` should include LIQUIDATED trades
   - `buildCoinPerformance()` should include LIQUIDATED trades
   - Currently they filter to `status === 'CLOSED'` only

2. **Test the Full LIQUIDATION Flow End-to-End**
   - Extract LIQUIDATION screenshot
   - Confirm trade
   - Verify status is LIQUIDATED
   - Verify position field is set correctly
   - Verify analytics show the liquidation loss

3. **Deploy to Production & Monitor**
   - Monitor for any 23514 constraint errors
   - Monitor for LIQUIDATION confirmation failures

---

## Database Credentials (For Reference)

- **Project URL:** https://apxlfnommafhiogvwtek.supabase.co
- **Project Name:** ORBIT Trading Dashboard
- **Database:** PostgreSQL (managed by Supabase)
- **Table:** public.trades

⚠️ **Keep these credentials secure!** Do not share in logs or screenshots.

---

## Questions?

Refer to:
- **Full diagnosis:** See `/home/claude/crypto-trading-dashboard/LIQUIDATION_FIX_FINAL_REPORT.md`
- **Test results:** See test file `src/services/liquidation_with_position_fix_test.test.ts`
- **Code changes:** See commits `f6f304d` and `7644a00`
