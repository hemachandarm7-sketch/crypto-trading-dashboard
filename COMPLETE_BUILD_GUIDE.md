# 🚀 ORBIT - Complete Setup Guide (Cloud Build)
**App ID: trackDashboard.orbit**

---

## ⚡ PART 1: Fix Node.js/npm (5 minutes)

### Step 1: Download Node.js
1. Open browser and go to: **https://nodejs.org/**
2. Click the **LTS version** (Long Term Support) button - currently v20.x or newer
3. Download will start (approximately 50MB)
4. Wait for download to complete

### Step 2: Install Node.js
1. Run the downloaded installer (`.msi` file)
2. Click **Next** → **Accept** license → **Next**
3. Keep default installation path
4. **IMPORTANT:** Make sure "Add to PATH" is checked ✅
5. Click **Install**
6. Wait for installation (~2 minutes)
7. Click **Finish**
8. **Restart PowerShell/Terminal** (important!)

### Step 3: Verify Installation
Open fresh PowerShell and run:
```powershell
node --version
# Should show: v20.x.x or v24.x.x

npm --version
# Should show: 10.x.x (no errors!)
```

✅ If both show version numbers without errors, proceed to Part 2!

---

## 📱 PART 2: Run Setup Script (5 minutes)

### Step 1: Navigate to Project
```powershell
cd C:\Users\HEMACHANDAR\.kiro\crew\scratch\runtime-6d6b01f9\crypto-trading-dashboard
```

### Step 2: Run Setup
```powershell
.\setup-android.ps1
```

**If you get an execution policy error:**
```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\setup-android.ps1
```

### Step 3: Wait for Completion
The script will:
- ✅ Install dependencies (~2 min)
- ✅ Install Capacitor (~1 min)
- ✅ Initialize Android platform (~1 min)
- ✅ Build web app (~1 min)
- ✅ Sync with Android (~30 sec)

**Look for:** "✨ Setup Complete!" message

---

## ☁️ PART 3: Cloud Build Setup (20 minutes)

### Step 1: Sign Up for Ionic AppFlow (Free)

1. Go to: **https://ionic.io/appflow**
2. Click **"Sign Up Free"**
3. Create account (use your GitHub to sign in quickly)
4. Verify your email

### Step 2: Create App in AppFlow

1. Click **"New App"** in dashboard
2. App name: **Orbit**
3. Click **"Create App"**
4. Select **"Git-based workflow"** (NOT manual)

### Step 3: Connect GitHub Repository

You have two options:

#### Option A: Push to Existing GitHub Repo (Recommended)
```powershell
# Go to your LOCAL GitHub repo directory
cd path\to\your\crypto-trading-dashboard

# Copy all Android setup files
$source = "C:\Users\HEMACHANDAR\.kiro\crew\scratch\runtime-6d6b01f9\crypto-trading-dashboard"

Copy-Item "$source\capacitor.config.ts" . -Force
Copy-Item "$source\.env" . -Force
Copy-Item "$source\android" . -Recurse -Force
Copy-Item "$source\setup-android.ps1" . -Force
Copy-Item "$source\ANDROID_SETUP_GUIDE.md" . -Force

# Add and commit
git add .
git commit -m "Add Capacitor Android support - trackDashboard.orbit"
git push origin main
```

#### Option B: Connect AppFlow to GitHub
1. In AppFlow: **Settings** → **Git** → **Connect Repository**
2. Authorize GitHub
3. Select: **hemachandarm7-sketch/crypto-trading-dashboard**
4. AppFlow will automatically detect pushes

### Step 4: Install Ionic CLI & Link
```powershell
# Install Ionic CLI globally
npm install -g @ionic/cli

# Login to Ionic (opens browser)
ionic login

# Navigate to your project
cd path\to\your\crypto-trading-dashboard

# Link to AppFlow
ionic link
# Select the "Orbit" app you just created
```

### Step 5: Trigger Cloud Build

#### Via AppFlow Dashboard (Easiest):
1. Go to AppFlow → **Builds** tab
2. Click **"New Build"**
3. Select **Android**
4. Build type: **Debug** (for testing)
5. Click **"Build"**
6. Wait ~10-15 minutes

#### Via CLI:
```powershell
ionic build android --build-type=debug
```

### Step 6: Download APK

1. When build shows **"Success"** (green checkmark)
2. Click the build
3. Click **"Download"** → **"APK"**
4. Save to your computer

---

## 📲 PART 4: Install on Android Phone (5 minutes)

### Step 1: Transfer APK
- Email it to yourself, OR
- Use USB cable and copy to phone, OR
- Use cloud storage (Google Drive, Dropbox)

### Step 2: Enable Installation
On your Android phone:
1. Go to **Settings**
2. Search for **"Install unknown apps"** or **"Unknown sources"**
3. Enable for your file manager/browser

### Step 3: Install
1. Locate the APK file on your phone
2. Tap it
3. Tap **"Install"**
4. Wait for installation
5. Tap **"Open"**

### Step 4: Test
1. App should launch with your dark theme
2. Log in with Supabase credentials
3. Test features:
   - ✅ Dashboard loads
   - ✅ Can view trades
   - ✅ Charts display
   - ✅ Screenshot upload works

---

## 🔐 IMPORTANT: Supabase Configuration

### Add Android Redirect URL
1. Go to **Supabase Dashboard**
2. Navigate to: **Authentication** → **URL Configuration**
3. Add to **Redirect URLs**:
   ```
   trackDashboard.orbit://callback
   ```
4. Click **Save**

---

## 🎯 TROUBLESHOOTING

### Problem: npm install fails during setup
**Solution:** 
```powershell
# Clear npm cache
npm cache clean --force
# Try again
.\setup-android.ps1
```

### Problem: AppFlow build fails
**Check:**
1. Did you push all files (including `android/` folder)?
2. Is `.env` file in repository?
3. Check build logs in AppFlow for specific error

**Common fix:**
```powershell
# Rebuild locally first to ensure it works
npm run build
# Then push
git add .
git commit -m "Fix build"
git push
```

### Problem: Can't install APK on phone
**Check:**
1. Is "Unknown sources" enabled?
2. Try downloading directly on phone instead of transferring
3. Check if phone storage is full

### Problem: App crashes on open
**Check:**
1. Is Supabase URL correct in `.env`?
2. Did you add redirect URL to Supabase?
3. Check Android logs via `adb logcat` if you have developer mode

---

## 🔄 FUTURE UPDATES

When you make changes to your web app:

### Quick Update Process:
```powershell
# 1. Make your changes to React code
# 2. Build and sync
npm run build:android

# 3. Commit and push
git add .
git commit -m "Update: [describe changes]"
git push

# 4. Trigger new build in AppFlow
# Download new APK and reinstall
```

---

## 📊 SUCCESS CHECKLIST

Use this to track your progress:

### Phase 1: Setup ✓
- [ ] Node.js installed (v20+)
- [ ] npm working without errors
- [ ] setup-android.ps1 completed successfully
- [ ] "Setup Complete!" message displayed

### Phase 2: AppFlow ✓
- [ ] Ionic AppFlow account created
- [ ] "Orbit" app created in AppFlow
- [ ] GitHub repository connected
- [ ] Ionic CLI installed globally
- [ ] Project linked with `ionic link`

### Phase 3: Build ✓
- [ ] Files pushed to GitHub
- [ ] Build triggered in AppFlow
- [ ] Build completed successfully (green)
- [ ] APK downloaded to computer

### Phase 4: Install ✓
- [ ] APK transferred to phone
- [ ] Unknown sources enabled
- [ ] APK installed on phone
- [ ] App opens successfully
- [ ] Can log in
- [ ] Features work correctly

### Phase 5: Configure ✓
- [ ] Supabase redirect URL added
- [ ] App authenticates properly
- [ ] Data syncs across devices

---

## ⏱️ TIME BREAKDOWN

| Phase | Task | Time |
|-------|------|------|
| 1 | Install Node.js | 5 min |
| 2 | Run setup script | 5 min |
| 3 | AppFlow signup & setup | 10 min |
| 4 | Cloud build | 15 min |
| 5 | Install on phone | 5 min |
| **TOTAL** | | **40 min** |

---

## 🎉 WHAT YOU'LL HAVE

✅ **Orbit** - Professional Android app
✅ Native performance
✅ Offline capability
✅ Cross-device sync
✅ Professional splash screen
✅ Dark theme matching web
✅ All trading dashboard features
✅ Screenshot OCR
✅ Portfolio analytics

---

## 🆘 NEED HELP?

1. Check `ANDROID_SETUP_GUIDE.md` for detailed troubleshooting
2. Review build logs in AppFlow dashboard
3. Test web build first: `npm run build && npm run preview`
4. Check Ionic community: https://forum.ionicframework.com/

---

## 📱 APP DETAILS

- **App Name:** Orbit
- **Package ID:** trackDashboard.orbit
- **Platform:** Android 8.0+ (API 26+)
- **Size:** ~15-20 MB
- **Theme:** Dark (#0F172A)
- **Backend:** Supabase
- **Framework:** Capacitor 6

---

**Ready to start? Begin with Part 1: Install Node.js! 🚀**
