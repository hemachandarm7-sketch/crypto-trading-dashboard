# Emergency Rollback Procedure

**Purpose:** Instructions for rolling back the deployment if critical issues arise.

**Status:** Use only if deployment causes production issues

**Time Estimate:** 15-30 minutes for complete rollback

---

## When To Rollback

Use this decision matrix:

| Issue | Severity | Action |
|-------|----------|--------|
| 400 Bad Request on LIQUIDATION | **CRITICAL** | **ROLLBACK IMMEDIATELY** |
| 23514 constraint violation errors | **CRITICAL** | **ROLLBACK IMMEDIATELY** |
| Analytics showing wrong data | Low | Don't rollback (cache issue) |
| Performance degradation > 50% | High | Evaluate, then rollback if needed |
| Some trades not saving | **CRITICAL** | **ROLLBACK IMMEDIATELY** |
| Position field NULL for new trades | **CRITICAL** | **ROLLBACK IMMEDIATELY** |
| Database connection issues | High | Investigate, may need rollback |

---

## Rollback Decision Checklist

Before initiating rollback, confirm:

- [ ] Issue is reproducible (happens consistently, not intermittent)
- [ ] Issue is caused by this deployment (not pre-existing)
- [ ] Issue affects critical features (trade closing, uploads)
- [ ] Issue cannot be fixed with simple cache clear
- [ ] Rollback has been approved by team lead

If **all items checked**, proceed with rollback.

---

## Complete Rollback (Code + Database)

### Option A: Full Rollback (Most Conservative)

Use this if you're uncertain which part caused the issue.

#### Step 1: Rollback Code (5 minutes)

```bash
cd /home/claude/crypto-trading-dashboard

# Check current commit
git log --oneline -1
# Should show one of the session 21 commits

# Identify the commit BEFORE session 21
# Session 21 commits start with: f6f304d (CRITICAL FIX)
# Previous commit should be: 26efcba (Add final deployment and testing instructions)

# Rollback to commit BEFORE session 21
git revert --no-edit HEAD~4  # Reverts last 4 commits
# OR
git reset --hard 26efcba  # Go back to this commit

# Verify you're at the right commit
git log --oneline -1
# Should show: 26efcba (Add final deployment...)

# Force push to main (WARNING: this overwrites history)
git push --force-with-lease origin main
```

**Wait for Vercel to redeploy** (5 minutes)

#### Step 2: Verify Code Rollback

```bash
# Check that old code is running
curl -s https://crypto-trading-dashboard-steel.vercel.app/ | grep -i "position"
# Should NOT find position field references

# Check deployment status
# Go to: https://vercel.com/dashboard/crypto-trading-dashboard
# Confirm "Deployment Status: Ready" ✅
```

#### Step 3: Rollback Database (5 minutes)

Go to Supabase SQL Editor and run:

```sql
-- Remove the position column (rollback migration 011)
ALTER TABLE public.trades DROP COLUMN IF EXISTS position CASCADE;

-- Verify column is gone
SELECT column_name FROM information_schema.columns
WHERE table_name = 'trades' AND column_name = 'position';
-- Should return: (no rows)
```

#### Step 4: Verify Database Rollback

```sql
-- Confirm no position column
SELECT column_name FROM information_schema.columns
WHERE table_name = 'trades' AND column_name = 'position';
-- Expected: (0 rows)

-- Confirm trades still exist
SELECT COUNT(*) FROM public.trades;
-- Expected: Same count as before

-- Confirm all trades are intact
SELECT id, symbol, direction, status FROM public.trades LIMIT 5;
-- Expected: All trades present with original structure
```

#### Step 5: Verify Application Works

1. Go to https://crypto-trading-dashboard-steel.vercel.app/
2. Refresh browser cache (F12 → Application → Clear Storage)
3. Test basic functionality:
   - Dashboard loads ✅
   - Trades display ✅
   - Can upload screenshots ✅
4. Verify no errors in console (F12)

---

## Partial Rollback (Code Only)

Use this if the issue is only in code, not database:

### If LIQUIDATION Feature Is Broken

```bash
cd /home/claude/crypto-trading-dashboard

# Rollback only the code changes
git revert --no-edit aeb1d28  # Revert "Add final session 21 summary"
git revert --no-edit db0aa45  # Revert "Add comprehensive session 21 docs"
git revert --no-edit 220bde9  # Revert "Fix analytics"
git revert --no-edit 7644a00  # Revert "Add test suite"
git revert --no-edit f6f304d  # Revert "CRITICAL FIX"

# Verify you're back to commit before session 21
git log --oneline -1
# Should show: 26efcba

git push origin main
```

**Wait for Vercel to redeploy** (5 minutes)

---

## Partial Rollback (Database Only)

Use this if code is fine but database migration caused issues:

```sql
-- Remove the position column and constraint
ALTER TABLE public.trades DROP CONSTRAINT IF EXISTS trades_position_check;
ALTER TABLE public.trades DROP COLUMN IF EXISTS position CASCADE;

-- Verify
SELECT column_name FROM information_schema.columns
WHERE table_name = 'trades' AND column_name = 'position';
-- Should return: (0 rows)
```

Application code will continue to work (position field is optional in code).

---

## Rollback Timeline

| Phase | Time | Action |
|-------|------|--------|
| Decision & approval | 5 min | Confirm issue, get approval |
| Code rollback | 5 min | Git revert/reset |
| Vercel redeploy | 5 min | Wait for deployment |
| Database rollback | 5 min | SQL to remove column |
| Verification | 5 min | Test application |
| **Total** | **~25 min** | Back to stable state |

---

## What Gets Rolled Back

### Code Rollback Removes
- ✅ Position field from Trade interface
- ✅ Analytics updates (LIQUIDATED trades)
- ✅ All test files for position field
- ✅ All documentation files

### Database Rollback Removes
- ✅ position column from trades table
- ✅ trades_position_check constraint
- ✅ All synced position values

### What Stays (Not Rolled Back)
- ✅ All existing trades and their data
- ✅ Transaction history
- ✅ User data and settings
- ✅ Screenshots and evidence

---

## After Rollback

### Immediate Actions (Next 2 Hours)
1. [ ] Notify stakeholders of rollback
2. [ ] Start analysis of root cause
3. [ ] Document what went wrong
4. [ ] Identify fix needed

### Short Term (Next 24 Hours)
1. [ ] Root cause analysis complete
2. [ ] Fix implemented and tested locally
3. [ ] Team review of fix
4. [ ] Plan for re-deployment

### Investigation Tasks
- [ ] Check error logs for exact error message
- [ ] Review database state at time of issue
- [ ] Test code changes in isolation
- [ ] Check for data inconsistencies

---

## Recovery from Rollback

### If Rollback Succeeds
1. Application returns to stable state
2. LIQUIDATION feature works as before
3. No data loss
4. Continue with investigation

### If Rollback Fails
1. Contact Supabase support (critical database issue)
2. Contact Vercel support (deployment issue)
3. Consider using Supabase backup restore

### If Partial Rollback Needed
1. Roll back code, keep database (easiest recovery)
2. OR roll back database, rebuild code changes
3. OR roll back both and re-apply carefully

---

## Prevention for Next Attempt

### Code Level Checks
```bash
# Run comprehensive tests before re-deploying
npm test -- --no-coverage

# Check for any compilation errors
npm run build

# Lint for code quality
npm run lint
```

### Database Level Checks
```sql
-- Check migration syntax before running
-- Test migration in development first
-- Backup database before applying
-- Run verification queries after migration
```

### Deployment Checks
```bash
# Stage changes in a test environment first
# Run full end-to-end tests
# Have team review before production
# Schedule deployment during low-traffic hours
```

---

## Commit History for Rollback Reference

**Session 21 Commits (In Order):**

```
aeb1d28 Add final session 21 summary with complete status
db0aa45 Add comprehensive session 21 documentation
220bde9 Fix analytics to include LIQUIDATED trades
7644a00 Add test suite for position field fix
f6f304d CRITICAL FIX: Add missing position column

26efcba Add final deployment and testing (← BEFORE session 21)
```

**To rollback to before session 21:**
```bash
git reset --hard 26efcba
# OR
git revert --no-edit HEAD~4 HEAD~3 HEAD~2 HEAD~1 HEAD
```

---

## Database Backup & Restore

### Backup (Before Deployment)

Supabase automatically backs up daily. To manual backup:

1. Go to Supabase Dashboard
2. Project settings → Database
3. Click "Download" to backup
4. Save file securely

### Restore (If Needed)

If data corruption occurs:

1. Go to Supabase Dashboard
2. Project settings → Database
3. Click "Restore" 
4. Select date/time before issue
5. Wait for restoration (can take 30+ minutes)

**Warning:** This restores entire database to point-in-time, losing recent transactions.

---

## Communication Template

If you need to rollback, use this template:

```
INCIDENT: LIQUIDATION Feature Deployment - Rollback Required

ISSUE:
[Describe what went wrong]

ACTION TAKEN:
[Describe rollback steps]

STATUS:
Application rolled back to commit 26efcba
Database rolled back to [time]
Service restored: [time]

NEXT STEPS:
1. Investigation of root cause
2. Fix implementation
3. Comprehensive testing
4. Re-deployment (ETA: [time])

CUSTOMER IMPACT:
- Users cannot use LIQUIDATION feature (reverted to old behavior)
- All existing trades preserved
- No data loss

SUPPORT CONTACT:
[Your name/team]
```

---

## Rollback Decision Flow

```
Issue Found?
│
├─ YES → Is it critical?
│   │
│   ├─ NO → Cache clear + monitor
│   │   └─ If persistent: Schedule re-deploy
│   │
│   └─ YES → Team approval?
│       │
│       ├─ NO → Continue investigating
│       │
│       └─ YES → Execute rollback
│           ├─ Code rollback (5 min)
│           ├─ Database rollback (5 min)
│           ├─ Verification (5 min)
│           └─ Notify stakeholders
│
└─ NO → Continue deployment
    └─ Complete all health checks
```

---

## Rollback Checklist

**Before Starting Rollback:**
- [ ] Issue verified (reproducible)
- [ ] Root cause identified
- [ ] Team approval obtained
- [ ] Rollback procedure reviewed
- [ ] Database backed up
- [ ] Git repository clean

**During Rollback:**
- [ ] Code rollback executed
- [ ] Vercel deployment confirmed
- [ ] Database rollback executed
- [ ] Verification queries passed
- [ ] Application tested

**After Rollback:**
- [ ] Service restored to stable state
- [ ] Stakeholders notified
- [ ] Incident documented
- [ ] Root cause analysis started
- [ ] Fix schedule created

---

## Common Issues & Rollback Paths

| Issue | Rollback Path | Time |
|-------|---------------|------|
| 400 Bad Request | Code + Database | 25 min |
| Analytics wrong | Code only | 10 min |
| Performance bad | Code only | 10 min |
| DB constraint error | Database only | 10 min |
| Complete failure | Full rollback | 25 min |

---

## Emergency Contacts

| Issue | Contact | Escalation |
|-------|---------|-----------|
| Vercel deployment stuck | Vercel support | Account manager |
| Database locked/corrupted | Supabase support | Platform engineer |
| Data consistency issues | Database team | Data engineer |
| Cannot rollback | Full team | Engineering lead |

---

## Post-Rollback Analysis

After rollback completes, investigate:

1. **Root Cause**
   - [ ] Exact error message
   - [ ] Where error occurred
   - [ ] Why it wasn't caught in testing

2. **Prevention**
   - [ ] What test was missing
   - [ ] What check should have caught it
   - [ ] How to prevent recurrence

3. **Fix Approach**
   - [ ] Different implementation
   - [ ] Additional safety checks
   - [ ] More comprehensive testing

4. **Re-Deployment Plan**
   - [ ] When to retry
   - [ ] What to change
   - [ ] How to verify differently

---

**Last Updated:** October 23, 2026  
**Status:** Ready for emergency use only

Hopefully you never need this! But if you do, follow the steps above carefully.
