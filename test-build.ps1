# Test Build Locally
# Run this to diagnose build issues before pushing

Write-Host "Testing Orbit Android Build Locally" -ForegroundColor Cyan
Write-Host "====================================" -ForegroundColor Cyan
Write-Host ""

$repoPath = "C:\Users\HEMACHANDAR\crypto-trading-dashboard"
cd $repoPath

Write-Host "1. Checking Node.js version..." -ForegroundColor Yellow
node --version
npm --version

Write-Host ""
Write-Host "2. Installing dependencies..." -ForegroundColor Yellow
npm ci

if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: npm ci failed!" -ForegroundColor Red
    Write-Host "Try: npm install instead" -ForegroundColor Yellow
    exit 1
}

Write-Host ""
Write-Host "3. Building web app..." -ForegroundColor Yellow
npm run build

if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Build failed!" -ForegroundColor Red
    Write-Host "Check the errors above" -ForegroundColor Yellow
    exit 1
}

Write-Host ""
Write-Host "4. Checking dist folder..." -ForegroundColor Yellow
if (Test-Path "dist") {
    $files = Get-ChildItem dist -Recurse | Measure-Object
    Write-Host "SUCCESS: dist folder created with $($files.Count) files" -ForegroundColor Green
} else {
    Write-Host "ERROR: No dist folder created!" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "====================================" -ForegroundColor Cyan
Write-Host "Local build successful!" -ForegroundColor Green
Write-Host "The GitHub Actions build should work now" -ForegroundColor Green
Write-Host "====================================" -ForegroundColor Cyan
