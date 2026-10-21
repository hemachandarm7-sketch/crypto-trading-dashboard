# LIQUIDATION Constraint Error - Exact Debugging Steps

## STOP: Do Not Speculate

I have stopped making speculative fixes. I need REAL DATA from your environment.

The error message alone (23514 - check constraint violation) is not enough. I need to know:

1. **Is it UPDATE or INSERT?** (which operation is failing)
2. **What exact value violates the constraint?** (the actual status value)
3. **What is the actual database constraint?** (what's really in your live database)
4. **Does the matched trade lookup work?** (is the trade being found)

---

## PART 1: Database Schema Inspection (5 minutes)

**Go to Supabase Dashboard → SQL Editor**

Run EACH of these queries one at a time. **Copy the EXACT output for each.**

### Query 1: Status Column Definition
```sql
SELECT 
  column_name,
  data_type,
  is_nullable,
  column_default,
  domain_name
FROM information_schema.columns
WHERE table_name = 'trades' AND column_name = 'status';
```
**Expected**: Should show if column is actually `text` or `trade_status` enum type

### Query 2: All Check Constraints
```sql
SELECT 
  constraint_name,
  pg_get_constraintdef(oid) as definition
FROM pg_constraint 
WHERE contype = 'c' AND conrelid = 'public.trades'::regclass
ORDER BY constraint_name;
```
**Expected**: Show the EXACT text of `trades_status_check` constraint

### Query 3: Triggers on Trades Table
```sql
SELECT 
  trigger_name,
  event_object_table,
  action_statement,
  action_timing,
  event_manipulation
FROM information_schema.triggers
WHERE event_object_table = 'trades'
ORDER BY trigger_name;
```
**Expected**: Show any triggers that might modify the status field

### Query 4: Current Status Values in Database
```sql
SELECT status, COUNT(*) as count
FROM public.trades
GROUP BY status
ORDER BY status;
```
**Expected**: Show how many trades have each status

### Query 5: Find the Specific RECALL/USDT Trade
```sql
SELECT 
  id,
  user_id,
  symbol,
  direction,
  status,
  open_time,
  close_time
FROM public.trades
WHERE symbol = 'RECALL/USDT'
ORDER BY created_at DESC
LIMIT 10;
```
**Expected**: Show the OPEN RECALL/USDT trade that should be updated

---

## PART 2: Run Liquidation Confirmation (2 minutes)

**Deploy latest code from GitHub** (commit 99fa52e)

1. Open Browser DevTools: **F12**
2. Go to **Console tab**
3. **Clear the console** (clear all previous logs)
4. Upload a LIQUIDATION screenshot for RECALL/USDT
5. **Do NOT manually select the trade** (test auto-matching)
6. Click "Confirm Trade"
7. **Wait for the error**

---

## PART 3: Collect Console Logs (2 minutes)

In the browser console, look for THESE SPECIFIC LOGS in order:

### Log Group 1: Initial Matching
```
[MATCHED_TRADE_BRANCH] {screenshotType, matchedId, matchedStatus, isLiquidation}
```
**What to look for**: Is matchedId shown? Is it null?

### Log Group 2: Trade Matching Specifically for LIQUIDATION
```
[LIQUIDATION_MATCH] {found: true/false, matchedId, symbol, direction}
```
**What to look for**: Does it say `found: true` or `found: false`?

### Log Group 3: Which Path Taken
**ONE of these TWO will appear:**

**If UPDATE path (GOOD):**
```
[LIQUIDATION BRANCH] Entering LIQUIDATION update for existing trade
  {matchedTradeId, matchedStatus, symbol}

[UPDATE TRADE] Input patch:
  patchStatus: LIQUIDATED
  patch: {...}

[UPDATE TRADE] Converted payload:
  payloadStatus: LIQUIDATED
  payload: {...}

[UPDATE_PAYLOAD_DETAILED] {payloadFields: [...]}
```

**If INSERT path (BAD - trade not matched):**
```
[CRITICAL] INSERT PATH TAKEN (NOT UPDATE)
  {screenshotType, symbol, reason: "No matched trade found..."}

[INSERT_PAYLOAD_ALL_FIELDS] {fields: [...]}

[INSERT_TRADE] SUPABASE ERROR - 23514 CONSTRAINT:
  {errorCode, constraint, details, hint, statusFromPayload, allFields}
```

### Log Group 4: The Error
```
[UPDATE TRADE] SUPABASE ERROR: {...}
OR
[INSERT_TRADE] SUPABASE ERROR - 23514 CONSTRAINT: {...}
```

**Copy the ENTIRE error object** - especially:
- `errorCode` (should be "23514")
- `constraint` (should be "trades_status_check")
- `statusFromPayload` or `statusFromPayload`
- `details`
- `hint`
- `allFields`

---

## PART 4: Right-Click Export Console (1 minute)

1. Right-click in the Console
2. Select "Save as..." 
3. Save as `console-logs.txt`
4. Or, **manually copy-paste the ENTIRE sequence of logs from [MATCHED_TRADE_BRANCH] through the final [ERROR]**

---

## What To Send Me

Send EXACTLY these items:

**1. Database schema queries output** (all 5 queries from Part 1)
   - Column definition
   - Exact constraint text
   - Any triggers
   - Status value counts
   - The RECALL/USDT trade

**2. Browser console logs** (the full sequence from Part 3)
   - Whether matched trade was found
   - Which path (UPDATE or INSERT) was taken
   - Full error details including statusFromPayload and all constraint info

**3. One screenshot showing:**
   - The trade selection dropdown showing "RECALL/USDT · LONG · OPEN"
   - That you did NOT manually select it

---

## What I Will Do With This Data

1. Compare the actual database constraints vs repository migrations
2. Identify if UPDATE or INSERT is being attempted
3. Find the exact status value being sent (and check for whitespace/encoding)
4. Identify if trade matching is working
5. Find the actual root cause based on REAL DATA, not speculation

---

## Critical Notes

- **Do not fix anything manually** - I need to see the actual error
- **Do not assume the migrations were applied** - the database might differ
- **Character codes matter** - whitespace in the status value would fail the constraint
- **The operation type matters** - INSERT vs UPDATE are different failures
- **Trade matching matters** - if the matched trade isn't found, we INSERT (which may fail)

---

## Timeline

Once you provide this data:
1. I will analyze the actual database constraint vs code
2. I will identify the exact invalid value being sent
3. I will identify which operation (UPDATE/INSERT) and path is actually failing
4. I will implement ONE targeted fix based on REAL DATA
5. We will test and verify

**Do not attempt any more fixes. Just gather and send the data above.**
