# 🚀 ORBIT - GitHub Actions Build Guide

**App ID:** trackDashboard.orbit  
**Build Method:** GitHub Actions (Free Cloud Build)

---

## ✅ What I've Created

**File:** `.github/workflows/build-android.yml`

This workflow automatically builds your Android APK in GitHub's cloud servers whenever you push code.

---

## 🎯 How It Works

### **Automatic Triggers:**
- ✅ Push to `main` or `master` branch
- ✅ Pull requests
- ✅ Manual trigger (workflow_dispatch)

### **What It Does:**
1. Checks out your code
2. Installs Node.js and dependencies
3. Builds your React web app
4. Sets up Android SDK
5. Builds Android APK
6. Uploads APK as downloadable artifact

### **Output:**
- **APK Location:** Actions tab → Latest run → Artifacts → `orbit-android-debug.apk`
- **Retention:** 30 days
- **Size:** ~15-20 MB

---

## 📋 Setup Steps (10 Minutes)

### **Step 1: Copy Files to Your GitHub Repo (2 min)**

```powershell
# Run from the dashboard project directory
cd C:\Users\HEMACHANDAR\.kiro\crew\scratch\runtime-6d6b01f9\crypto-trading-dashboard

# Copy to your local GitHub repo (replace with your actual path)
$repoPath = "C:\path\to\your\crypto-dashboard-repo"

# Copy workflow file
New-Item -Path "$repoPath\.github\workflows" -ItemType Directory -Force
Copy-Item ".github\workflows\build-android.yml" -Destination "$repoPath\.github\workflows\" -Force

# Copy Capacitor config
Copy-Item "capacitor.config.ts" -Destination "$repoPath\" -Force

# Copy environment file (rename to prevent exposure)
Copy-Item ".env" -Destination "$repoPath\.env.example" -Force

Write-Host "✅ Files copied!" -ForegroundColor Green
Write-Host "⚠️  Add .env to .gitignore before committing!" -ForegroundColor Yellow
```

### **Step 2: Secure Your Supabase Credentials (2 min)**

**Important:** Don't commit your real `.env` file!

```powershell
# In your repo directory
cd $repoPath

# Add to .gitignore
Add-Content .gitignore "`n# Environment variables`n.env`n.env.local"

# Create GitHub Secrets instead
Write-Host "Go to your GitHub repo → Settings → Secrets and variables → Actions"
Write-Host "Add these secrets:"
Write-Host "  VITE_SUPABASE_URL = your_supabase_url"
Write-Host "  VITE_SUPABASE_ANON_KEY = your_supabase_key"
```

### **Step 3: Update Workflow to Use Secrets (optional but recommended)**

If you want to use GitHub Secrets instead of `.env`:

```yaml
# Add this step before "Build web app" in the workflow:
- name: Create .env file
  run: |
    echo "VITE_SUPABASE_URL=${{ secrets.VITE_SUPABASE_URL }}" >> .env
    echo "VITE_SUPABASE_ANON_KEY=${{ secrets.VITE_SUPABASE_ANON_KEY }}" >> .env
```

### **Step 4: Push to GitHub (2 min)**

```powershell
cd $repoPath

git add .
git commit -m "Add GitHub Actions Android build workflow"
git push origin main
```

### **Step 5: Watch the Build (5-10 min)**

1. **Go to:** https://github.com/your-username/your-repo/actions
2. **Click:** The latest workflow run
3. **Watch:** Build progress (takes ~5-10 minutes)
4. **Success:** Green checkmark appears

### **Step 6: Download Your APK (1 min)**

1. **In the completed workflow run:**
   - Scroll to bottom → "Artifacts" section
   - Click **"orbit-android-debug"** to download
2. **Extract the ZIP** (contains `app-debug.apk`)
3. **Transfer to phone** (email/cloud/USB)
4. **Install and run!**

---

## 🔧 Manual Build Trigger

**If you want to rebuild without pushing code:**

1. Go to: **Actions** tab
2. Click: **"Build Android APK"** workflow (left sidebar)
3. Click: **"Run workflow"** dropdown (right side)
4. Select branch: **main**
5. Click: **"Run workflow"** button
6. Wait for build to complete
7. Download APK from artifacts

---

## 📱 Build Types

### **Debug Build (Default)**
- ✅ Current setup
- ✅ Easy testing
- ✅ No signing needed
- ❌ Larger file size (~20MB)
- ❌ Not optimized

### **Release Build (Production)**
To enable release builds, you need:
1. Generate signing keystore
2. Add keystore to GitHub Secrets
3. Update workflow to build release APK

*I can guide you through this when you're ready for production!*

---

## 🐛 Troubleshooting

### **Build Fails: "npm ci" Error**
**Fix:** Make sure `package-lock.json` is committed
```powershell
git add package-lock.json
git commit -m "Add package-lock.json"
git push
```

### **Build Fails: "capacitor.config.ts not found"**
**Fix:** Ensure you copied all files from Step 1

### **APK Won't Install on Phone**
**Fix:** Enable "Install from Unknown Sources"
- Settings → Security → Unknown Sources → Enable

### **App Crashes on Launch**
**Fix:** Check Supabase credentials
- Verify `.env` values are correct
- Check GitHub Secrets match your Supabase project

---

## ⚡ Quick Reference

### **File Locations:**
- Workflow: `.github/workflows/build-android.yml`
- Config: `capacitor.config.ts`
- Env (example): `.env.example`
- Env (real, local only): `.env`

### **Key Commands:**
```powershell
# Copy files
.\copy-to-github.ps1

# Commit and push
git add .
git commit -m "message"
git push

# Check build status
# → GitHub → Actions tab
```

### **Build Time:**
- Average: **5-10 minutes**
- First build: **10-15 minutes** (downloads dependencies)
- Subsequent: **5-8 minutes** (cached)

---

## 🎉 What You Get

**Orbit Android App:**
- ✅ Full crypto trading dashboard
- ✅ Portfolio tracking & analytics
- ✅ Trade journal with OCR
- ✅ Screenshot management
- ✅ Real-time Supabase sync
- ✅ Dark theme (#0F172A)
- ✅ Offline capable
- ✅ ~15-20 MB APK

---

## 🚀 Production Deployment (Future)

When ready for Play Store:

1. **Generate release keystore**
2. **Add signing to workflow**
3. **Build release APK**
4. **Create Play Store listing**
5. **Upload release APK**

*I can provide the full production deployment guide when needed!*

---

## 📞 Support

**If stuck:**
1. Check workflow logs in GitHub Actions
2. Read error messages carefully
3. Verify all files were copied correctly
4. Ensure GitHub Secrets are set (if using)
5. Ask me for help with specific error messages!

---

## ✨ Advantages Over AppFlow

**GitHub Actions:**
- ✅ Free forever (public repos)
- ✅ 2,000 minutes/month free (private repos)
- ✅ Full control over build process
- ✅ No service shutdowns
- ✅ Works with any CI/CD
- ✅ Faster builds (5-10 min vs 15-20 min)
- ✅ Open source friendly

**AppFlow:**
- ❌ New apps shut down (Oct 1, 2026)
- ❌ Paid plans only
- ❌ Vendor lock-in

---

**🎯 Next Step:** Follow the setup steps above and push to GitHub. The build will start automatically!
