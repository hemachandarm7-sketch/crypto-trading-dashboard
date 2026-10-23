# Post-Deployment Health Check & Monitoring

**Purpose:** Verify everything works correctly after deploying the LIQUIDATION fix.

**Time Estimate:** 20 minutes

---

## Phase 1: Immediate Post-Deployment (5 minutes)

### 1a. Verify Code Deployed

**Check Vercel Dashboard:**
1. Go to https://vercel.com
2. Select project: crypto-trading-dashboard
3. Check latest deployment status
4. Confirm build succeeded ✅

Expected: "Deployment Status: Ready" in green

### 1b. Verify Application Loads

1. Go to live site: https://crypto-trading-dashboard-steel.vercel.app/
2. Open browser console (F12)
3. Check for JavaScript errors
4. Verify no red errors in console

Expected: 
- Page loads without JavaScript errors
- No 404 errors
- No authentication errors

### 1c. Check Environment Variables

Expected environment variables are set:
- VITE_SUPABASE_URL ✅
- VITE_SUPABASE_ANON_KEY ✅
- All others as configured ✅

### 1d. Verify Database Connection

In browser console, run:
```javascript
// This will test the Supabase connection
console.log('Testing Supabase connection...');
```

Expected:
- No connection errors in console
- Page fully loads and responds

---

## Phase 2: Database State Verification (5 minutes)

### 2a. Check Position Column in Database

Go to Supabase SQL Editor and run:

```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'trades' AND column_name = 'position'
ORDER BY ordinal_position;
```

Expected Result:
| column_name | data_type | is_nullable |
|-------------|-----------|-------------|
| position | text | YES |

**Status:** ✅ Column exists with correct type

### 2b. Verify Constraint Exists

```sql
SELECT constraint_name, constraint_type
FROM information_schema.table_constraints
WHERE table_name = 'trades' AND constraint_name LIKE '%position%'
ORDER BY constraint_name;
```

Expected Result:
| constraint_name | constraint_type |
|-----------------|-----------------|
| trades_position_check | CHECK |

**Status:** ✅ Constraint exists and is enforceable

### 2c. Check Data Integrity

```sql
SELECT 
  COUNT(*) as total_trades,
  SUM(CASE WHEN position IS NULL THEN 1 ELSE 0 END) as null_count,
  SUM(CASE WHEN position NOT IN ('LONG', 'SHORT') THEN 1 ELSE 0 END) as invalid_count
FROM public.trades;
```

Expected Result:
- `total_trades`: > 0
- `null_count`: 0
- `invalid_count`: 0

**Status:** ✅ All position values are valid

### 2d. Check a Sample Trade

```sql
SELECT 
  id, symbol, direction, position, status, created_at
FROM public.trades
LIMIT 5;
```

Expected Result:
- All rows should have `position` = 'LONG' or 'SHORT'
- Position should match direction
- No NULL position values

**Status:** ✅ Sample data looks correct

---

## Phase 3: Feature Testing (10 minutes)

### 3a. Test LIQUIDATION Screenshot Upload

1. **Clear Browser Cache**
   - F12 → Application → Clear Storage
   - Refresh page

2. **Find an Open Trade**
   - Dashboard should show trades
   - Select a LONG or SHORT open trade
   - Note the trade ID and symbol

3. **Upload LIQUIDATION Screenshot**
   - Click "Upload Screenshot"
   - Select a LIQUIDATION image
   - Let it auto-match (don't manually select)
   - Confirm extraction details look correct

4. **Confirm Trade**
   - Click "Confirm Trade"
   - Watch for success notification
   - Expected: Trade should close

### 3b. Check Success Indicators

**Browser Console Should Show:**
```
[LIQUIDATION_MATCH] {found: true, matchedId: ?, symbol: ?, direction: LONG}
[LIQUIDATION BRANCH] Entering LIQUIDATION update...
[PRE_UPDATE_VALIDATION] {statusValue: LIQUIDATED, isValidStatus: true}
[UPDATE TRADE] Success
```

**No Errors Should Appear:**
- ❌ 400 Bad Request
- ❌ 23514 constraint error
- ❌ Database validation error
- ❌ Network error

### 3c. Verify Database State

Run this query to confirm the trade was updated:

```sql
SELECT 
  id, symbol, direction, status, position, 
  close_reason, close_time, close_price
FROM public.trades
WHERE status = 'LIQUIDATED'
ORDER BY updated_at DESC
LIMIT 1;
```

Expected Result:
| Field | Expected |
|-------|----------|
| status | LIQUIDATED |
| position | LONG or SHORT |
| close_reason | LIQUIDATION_CLEARANCE or similar |
| close_time | Recent timestamp |
| close_price | Valid number |

**Status:** ✅ Trade correctly marked as LIQUIDATED

### 3d. Test Multiple LIQUIDATION Scenarios

Repeat 3a-3c with:
- [ ] Different symbols (2-3 different coins)
- [ ] Both LONG and SHORT directions
- [ ] Different time periods (old vs new trades)

All should succeed without errors.

---

## Phase 4: Analytics Verification (5 minutes)

### 4a. Check Direction Performance

1. Go to Analytics dashboard
2. Look for "Direction Performance" or similar
3. Verify LONG and SHORT show values
4. Check that values include liquidation losses

Expected:
- LONG: Shows some trades + some losses from liquidations
- SHORT: Shows some trades + some losses from liquidations
- Both should have PNL values (positive or negative)

### 4b. Check Coin Performance

1. Go to Analytics dashboard
2. Look for "Coin Performance" section
3. Verify all coins that had liquidations are listed
4. Check that liquidation losses are reflected

Expected:
- Coins with liquidations should show negative PNL
- Coins without should show correct PNL
- All coins should have trade count > 0

### 4c. Check Equity Curve

1. Go to Analytics dashboard
2. Look for "Equity Curve" or "Balance Over Time"
3. Verify the curve shows liquidation events as dips
4. Check that values are continuous (no gaps)

Expected:
- Curve should dip when liquidations occur
- Should recover if new profitable trades made
- No discontinuities or gaps

---

## Phase 5: Error Monitoring (5 minutes)

### 5a. Check Sentry/Error Tracking (if configured)

1. Go to error tracking dashboard (Sentry, LogRocket, etc.)
2. Look for any new errors in past hour
3. Filter by recent deployments

Expected:
- ✅ No new 400 Bad Request errors
- ✅ No new 23514 constraint errors
- ✅ No new validation errors

### 5b. Check Browser Console Errors

On the live application:
1. F12 → Console tab
2. Look for any error messages
3. Perform a LIQUIDATION upload again
4. Watch console for any errors

Expected:
- ✅ No red error messages
- ✅ No validation warnings
- ✅ Successful transaction logs only

### 5c. Monitor Network Requests

On the live application:
1. F12 → Network tab
2. Clear network log
3. Perform a LIQUIDATION upload and confirm
4. Look at network tab for requests

Expected:
- ✅ PATCH request succeeds (200 or 204)
- ✅ No 400 errors
- ✅ No CORS errors
- ✅ Response contains updated trade

### 5d. Check Database Logs (if available)

In Supabase Dashboard:
1. Go to Logs → Database
2. Filter recent activity
3. Look for any errors or warnings

Expected:
- ✅ No constraint violation errors
- ✅ No authentication errors
- ✅ No permission errors

---

## Health Check Results Template

Use this to document your findings:

```
╔════════════════════════════════════════════════════════════════╗
║            LIQUIDATION FIX - POST-DEPLOYMENT HEALTH CHECK      ║
╚════════════════════════════════════════════════════════════════╝

PHASE 1: Immediate Post-Deployment
├─ Code deployed:                    ✅ / ❌
├─ Application loads:                ✅ / ❌
├─ No JavaScript errors:             ✅ / ❌
└─ Database connection working:      ✅ / ❌

PHASE 2: Database State
├─ Position column exists:           ✅ / ❌
├─ trades_position_check constraint: ✅ / ❌
├─ All positions valid:              ✅ / ❌
└─ Sample trades have position:      ✅ / ❌

PHASE 3: Feature Testing
├─ LIQUIDATION upload succeeds:      ✅ / ❌
├─ Trade closes successfully:        ✅ / ❌
├─ Status = LIQUIDATED:              ✅ / ❌
├─ Position field set correctly:     ✅ / ❌
├─ Multiple symbols tested:          ✅ / ❌
└─ Both LONG/SHORT directions:       ✅ / ❌

PHASE 4: Analytics
├─ Direction performance updated:    ✅ / ❌
├─ Coin performance includes liquid: ✅ / ❌
├─ Equity curve shows liquidations:  ✅ / ❌
└─ No stale cache issues:            ✅ / ❌

PHASE 5: Error Monitoring
├─ No constraint violation errors:   ✅ / ❌
├─ No 400 Bad Request errors:        ✅ / ❌
├─ No JavaScript console errors:     ✅ / ❌
├─ Network requests all succeed:     ✅ / ❌
└─ Database logs show no errors:     ✅ / ❌

OVERALL STATUS:  ✅ HEALTHY / ❌ ISSUES FOUND

Issues Found (if any):
1. [Description]
2. [Description]

Recommendations:
1. [Action if issues]
```

---

## Performance Baseline Checks

### Response Time

Test LIQUIDATION confirmation response time:

```bash
# From browser console while performing LIQUIDATION:
performance.measure('liquidation_confirm', 
  'navigationStart', 
  'PerformanceMeasure.liquidationEnd'
);

performance.getEntriesByType('measure').pop().duration;
// Should be < 2000ms (2 seconds)
```

Expected: < 2 seconds for complete LIQUIDATION confirmation

### Database Query Time

In Supabase, check query performance:

```sql
EXPLAIN ANALYZE
SELECT * FROM public.trades
WHERE symbol = 'RECALL/USDT' AND status = 'OPEN'
LIMIT 1;
```

Expected: < 100ms for simple queries

---

## Rollback Decision Tree

If you find issues, use this to decide whether to rollback:

```
Issue Found?
├─ NO → Continue monitoring (go to "Ongoing Monitoring")
│
└─ YES:
   ├─ 400 Bad Request on LIQUIDATION?
   │  └─ YES: ROLLBACK (position field issue)
   │
   ├─ Constraint violation errors?
   │  └─ YES: ROLLBACK (database migration issue)
   │
   ├─ Analytics showing wrong data?
   │  └─ Likely: Cache issue, NOT a rollback trigger
   │     Fix: Clear browser cache, restart app
   │
   ├─ Performance degradation > 50%?
   │  └─ YES: ROLLBACK (performance regression)
   │
   └─ Other errors?
      └─ Evaluate severity:
         - Critical (users can't trade): ROLLBACK
         - Major (features broken): ROLLBACK
         - Minor (visual glitch): Don't rollback
```

---

## Ongoing Monitoring (Post-Health Check)

### Daily Checks (First Week)
- [ ] Monitor error rates (target: < 0.1%)
- [ ] Check LIQUIDATION uploads daily (at least 2-3)
- [ ] Verify analytics accuracy
- [ ] Monitor database performance

### Weekly Checks (Weeks 2-4)
- [ ] Review error logs for patterns
- [ ] Confirm LIQUIDATION feature reliability
- [ ] Test with larger trade volumes
- [ ] Performance trend analysis

### Monthly Checks (Month 2+)
- [ ] Comprehensive feature test
- [ ] Performance analysis
- [ ] User feedback incorporation
- [ ] Documentation updates if needed

---

## Success Criteria

**Deployment is successful when:**

✅ All 5 phases of health checks pass  
✅ LIQUIDATION screenshots upload without 400 errors  
✅ Trades close correctly with LIQUIDATED status  
✅ Position field is set for all liquidated trades  
✅ Analytics include liquidation losses  
✅ No constraint violation errors  
✅ No regression in performance  
✅ Error rates < 0.1%  

---

## Support Contacts

If issues arise:

| Issue | Contact | Escalation |
|-------|---------|-----------|
| LIQUIDATION failing | Backend team | Product lead |
| Database errors | Database admin | Platform engineer |
| Analytics wrong | Analytics team | Data engineer |
| Performance issues | DevOps | Infrastructure lead |
| Unexpected errors | Sentry/monitoring | On-call engineer |

---

## Quick Reference Commands

### Check Deployment Status
```bash
# Vercel status
curl -s https://vercel.com/api/v0/user/projects | jq '.' | grep crypto-trading

# Live site health
curl -I https://crypto-trading-dashboard-steel.vercel.app/
```

### Check Database Status
```sql
-- Quick health check
SELECT 
  table_name,
  EXTRACT(EPOCH FROM NOW() - (SELECT max(modified) FROM pg_stat_user_tables WHERE relname=table_name)) as seconds_since_update
FROM information_schema.tables
WHERE table_schema = 'public'
LIMIT 5;
```

### Clear Application Cache (if needed)
```javascript
// In browser console:
localStorage.clear();
sessionStorage.clear();
location.reload(true);
```

---

## Checklist for Sign-Off

Before declaring deployment successful:

- [ ] All 5 health check phases completed
- [ ] No critical issues found
- [ ] LIQUIDATION feature tested end-to-end
- [ ] Database state verified
- [ ] Analytics updated correctly
- [ ] Error monitoring configured
- [ ] Rollback procedure ready (just in case)
- [ ] Team notified of successful deployment
- [ ] Monitoring alerts active
- [ ] Documentation updated with actual results

---

**Last Updated:** October 23, 2026  
**Status:** Ready for post-deployment execution

See [POST_DEPLOYMENT_HEALTH_CHECK.md](./POST_DEPLOYMENT_HEALTH_CHECK.md) for the complete health check guide.
