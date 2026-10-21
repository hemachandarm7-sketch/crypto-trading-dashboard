# Deployment and Diagnostic Execution Checklist

**Status:** Code is committed, pushed to GitHub, and ready for deployment.
**Latest Commit:** `cb3bf1e` - Add exact step-by-step debugging instructions

---

## PART 1: Deployment (Automatic via Vercel)

### ✓ Code Status
- [x] Code committed to GitHub
- [x] All commits pushed (cb3bf1e is latest)
- [x] Build successful (2284 modules, 0 errors)
- [x] Diagnostic logging added

### Deploy to Production
**If using Vercel:**
1. Go to https://vercel.com (your dashboard)
2. Select your project (crypto-trading-dashboard)
3. Deployments should auto-trigger from GitHub push
4. Wait for deployment to complete (5-10 minutes)
5. Check "Deployments" tab for status: **READY**

**If using different platform:**
Follow your normal deployment process - the code is ready.

### Verify Deployment
1. Go to your live app URL
2. Open DevTools: F12
3. Go to Application → Storage → Cookies
4. Look for any "deployed" or version indicator
5. Hard refresh: Ctrl+Shift+R (Windows) or Cmd+Shift+R (Mac)

---

## PART 2: Prepare Supabase for Diagnostics

### Open Supabase Dashboard
1. Go to https://app.supabase.com
2. Select your project
3. Go to **SQL Editor**
4. **Keep this open** - you'll need it for 5 queries

---

## PART 3: Execute Diagnostic Workflow

### Step 1: Run SQL Query 1 - Status Column Definition
In Supabase SQL Editor, run:
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
**Copy the result.** Note especially: `data_type` and `domain_name`

### Step 2: Run SQL Query 2 - Check Constraints
```sql
SELECT 
  constraint_name,
  pg_get_constraintdef(oid) as definition
FROM pg_constraint 
WHERE contype = 'c' AND conrelid = 'public.trades'::regclass
ORDER BY constraint_name;
```
**Copy the EXACT constraint definition** for `trades_status_check`

### Step 3: Run SQL Query 3 - Database Triggers
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
**Copy the result.** Note: any triggers that might modify `status`?

### Step 4: Run SQL Query 4 - Current Status Values
```sql
SELECT status, COUNT(*) as count
FROM public.trades
GROUP BY status
ORDER BY status;
```
**Copy the result.** This shows what status values actually exist.

### Step 5: Run SQL Query 5 - Find RECALL/USDT Trade
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
**Copy the result.** Confirm the OPEN RECALL/USDT LONG trade exists.

---

## PART 4: Reproduce the Error

### Step 1: Clear Browser Console
1. Open your app (should be deployed now)
2. Open DevTools: F12
3. Go to **Console** tab
4. Click the circle-slash icon to **clear all logs**

### Step 2: Upload LIQUIDATION Screenshot
1. Go to **Trade → Upload Screenshot**
2. Select a **LIQUIDATION screenshot** for RECALL/USDT
3. OCR should extract:
   - Screenshot Type: **LIQUIDATION**
   - Symbol: **RECALL/USDT**
   - Direction: **LONG**
   - PnL Amount: **negative value**

### Step 3: DO NOT Select Trade Manually
**Important:** In the dropdown "Associate trade":
- **DO NOT** click and select "RECALL/USDT · LONG · OPEN"
- Leave it as default: "Auto-match; create new if no strong match"
- This tests whether the auto-matching code works

### Step 4: Click "Confirm Trade"
1. Click the blue "Confirm / Create Trade" button
2. **Wait for error** (it should fail with the constraint error)
3. **DO NOT REFRESH** - we need the logs to stay in console

---

## PART 5: Collect Console Logs

### What You'll See
The console will show logs in this order (or some subset):

1. **Initial matching** - look for:
   ```
   [MATCHED_TRADE_BRANCH]
   [LIQUIDATION_MATCH]
   ```
   Note: Does it say `found: true` or `found: false`?

2. **Path decision** - look for ONE of:
   ```
   [LIQUIDATION BRANCH] Entering LIQUIDATION update...
   OR
   [CRITICAL] INSERT PATH TAKEN (NOT UPDATE)
   ```

3. **Payload details** - look for:
   ```
   [UPDATE TRADE] Converted payload:
   OR
   [INSERT_PAYLOAD_ALL_FIELDS]
   ```

4. **The error** - look for:
   ```
   [UPDATE TRADE] SUPABASE ERROR:
   OR
   [INSERT_TRADE] SUPABASE ERROR - 23514 CONSTRAINT:
   ```

### Copy the Logs
**Method 1 (Easiest):**
1. Right-click in console
2. Select **"Save as..."**
3. Save as `console-logs-liquidation.txt`

**Method 2 (Manual):**
1. Select from first `[MATCHED_TRADE_BRANCH]` log
2. Scroll down to the final error
3. Right-click → Copy
4. Paste into a text file

**What to include:**
- ALL logs from `[MATCHED_TRADE_BRANCH]` to the final error
- The complete error object with all fields
- Status value and all field values

---

## PART 6: Send the Data

Prepare a message with:

### 1. Database Schema (copy from SQL queries above)
```
Query 1 - Status Column:
[paste result]

Query 2 - Check Constraints:
[paste result]

Query 3 - Database Triggers:
[paste result]

Query 4 - Status Value Counts:
[paste result]

Query 5 - RECALL/USDT Trade:
[paste result]
```

### 2. Console Logs
```
[paste entire console output from step above]
```

### 3. Deployment Confirmation
- [x] Code deployed to live URL
- [x] Hard refresh performed (Cmd+Shift+R)
- [x] Diagnostic logging is active

---

## Checklist for Execution

**Deployment Phase:**
- [ ] Verify Vercel deployment completed (or your platform)
- [ ] Hard refresh live app
- [ ] Open DevTools to confirm new code is loaded

**SQL Diagnostics Phase:**
- [ ] Query 1 executed and copied
- [ ] Query 2 executed and copied (constraint definition)
- [ ] Query 3 executed and copied (triggers)
- [ ] Query 4 executed and copied (status counts)
- [ ] Query 5 executed and copied (RECALL/USDT trade found)

**Error Reproduction Phase:**
- [ ] Console cleared
- [ ] LIQUIDATION screenshot uploaded
- [ ] Trade NOT manually selected (left as auto-match)
- [ ] Confirm Trade button clicked
- [ ] Error occurred (constraint error expected)

**Data Collection Phase:**
- [ ] Console logs saved to file
- [ ] All database queries copied
- [ ] Console logs reviewed for key patterns
- [ ] Ready to send diagnostic data

---

## Critical Details to Verify

Before sending data, verify:

1. **Trade matching status:**
   - Does console show `[LIQUIDATION_MATCH] found: true` or `found: false`?
   
2. **Operation type:**
   - Does it say UPDATE path or INSERT path?
   
3. **Status value:**
   - What exact value is shown in `statusFromPayload`?
   - Are there character codes shown? Any non-printable characters?

4. **Constraint definition:**
   - Query 2 should show exact text of `trades_status_check`
   - Is it checking for 'LIQUIDATED'?

5. **Database triggers:**
   - Query 3: Are there any triggers that modify status?

---

## Timeline

1. **Deployment:** 5-10 minutes (automatic via Vercel)
2. **SQL Queries:** 2-3 minutes (5 quick queries)
3. **Error Reproduction:** 2-3 minutes (upload screenshot, click confirm)
4. **Log Collection:** 1-2 minutes (save console logs)
5. **Data Preparation:** 2-3 minutes (copy and format results)

**Total time:** ~15 minutes

Once you send the diagnostic data, I will:
1. Compare actual database vs repository code
2. Identify exact invalid value being sent
3. Identify if UPDATE or INSERT is failing
4. Implement ONE targeted fix
5. You test and verify

---

## Do NOT

- ❌ Do not make any code changes
- ❌ Do not modify the migrations
- ❌ Do not manually update the database
- ❌ Do not refresh the page (you'll lose console logs)
- ❌ Do not try to fix anything - just gather data

---

**Go to STEP_BY_STEP_DEBUGGING.md for more detailed explanations of each step.**
