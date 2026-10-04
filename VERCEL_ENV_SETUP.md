# 🚀 Vercel Environment Variables Setup

## Problem
The app deployed to Vercel but shows blank/doesn't load because **Supabase environment variables are missing** on Vercel.

---

## ✅ Solution: Add Environment Variables to Vercel

### Step 1: Go to Vercel Dashboard
1. Visit: https://vercel.com/dashboard
2. Click on project: **crypto-trading-dashboard**

### Step 2: Open Project Settings
1. Click **Settings** (top menu)
2. Left sidebar → **Environment Variables**

### Step 3: Add Supabase Variables

Add two environment variables:

#### Variable 1: Supabase URL
```
Name:  VITE_SUPABASE_URL
Value: https://hqjdcqofotscnhuppqgd.supabase.co
```

#### Variable 2: Supabase Anon Key
```
Name:  VITE_SUPABASE_ANON_KEY
Value: sb_publishable_L1EgmZf6JURBj9Uggoisrg_tHNYAib
```

### Step 4: Select Environments
For each variable:
- ☑ Production
- ☑ Preview
- ☑ Development

Click **Save**

---

## Step 5: Trigger Redeploy

After adding env vars:

### Option A: Redeploy from Vercel Dashboard
1. Go to **Deployments** tab
2. Find latest deployment
3. Click **...** (three dots)
4. Select **Redeploy**

### Option B: Redeploy from GitHub
Push a new commit:
```bash
cd /home/claude/crypto-trading-dashboard
git commit --allow-empty -m "🔄 Trigger Vercel redeploy with env vars"
git push origin main
```

---

## ⏳ Wait for Deployment

Vercel will:
1. Detect new environment variables
2. Rebuild the app
3. Deploy with Supabase connected
4. Show ✅ when complete

---

## ✅ Verify It Works

Once deployment completes (~2 minutes):

1. **Visit:** https://shboard-steel.vercel.app
2. **Wait for page load** (first load ~3 sec)
3. **You should see:**
   - Dashboard with metrics
   - Trades tab
   - Upload tab
   - Settings tab
   - Responsive layout

---

## 🔒 Security Note

These variables in Vercel are:
- ✅ Secure (Vercel encrypts them)
- ✅ Only used on server/build
- ✅ Not exposed in client code
- ✅ Publishable key is safe (Anon key, not Service Role)

---

## 🐛 If Still Blank After Deploy

### Check 1: Verify Env Vars in Vercel
1. Go to Settings → Environment Variables
2. Confirm both variables are there
3. Confirm all environments selected

### Check 2: Check Deployment Logs
1. Go to **Deployments** tab
2. Click latest deployment
3. Click **Build Logs**
4. Search for errors (usually shows if env vars missing)

### Check 3: Hard Refresh
```
Ctrl+Shift+R (Windows) or Cmd+Shift+R (Mac)
Or use Private/Incognito window
```

### Check 4: Clear Vercel Cache
1. Go to **Settings** → **Git**
2. Click **Clear Build Cache**
3. Redeploy

---

## 📝 Environment Variables Summary

Your app needs these to work:

```
VITE_SUPABASE_URL=https://hqjdcqofotscnhuppqgd.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_L1EgmZf6JURBj9Uggoisrg_tHNYAib
```

These connect your app to Supabase database.

---

## 🎯 Quick Checklist

- [ ] Go to Vercel dashboard
- [ ] Open crypto-trading-dashboard project
- [ ] Go to Settings → Environment Variables
- [ ] Add VITE_SUPABASE_URL
- [ ] Add VITE_SUPABASE_ANON_KEY
- [ ] Select Production + Preview + Development
- [ ] Save
- [ ] Redeploy (or push new commit)
- [ ] Wait 2-3 minutes
- [ ] Visit https://shboard-steel.vercel.app
- [ ] Should see dashboard ✅

---

## 🚀 Expected Result

After env vars are added and app redeployed:

```
✅ App loads at: https://shboard-steel.vercel.app
✅ Dashboard visible with all metrics
✅ Trades tab shows all trades
✅ Upload tab ready for screenshots
✅ Settings tab working
✅ Mobile responsive
```

---

**Status:** Ready to configure environment variables

**Action:** Follow steps above in Vercel dashboard
