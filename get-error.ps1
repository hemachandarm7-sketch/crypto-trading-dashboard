# Get error from GitHub Actions
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  HOW TO GET THE ERROR LOG" -ForegroundColor Yellow
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "1. Sign in to GitHub" -ForegroundColor White
Write-Host "2. Go to: https://github.com/hemachandarm7-sketch/crypto-trading-dashboard/actions" -ForegroundColor Blue
Write-Host "3. Click the failed run (red X)" -ForegroundColor White
Write-Host "4. Click 'build' job" -ForegroundColor White
Write-Host "5. Find the step with red X" -ForegroundColor White
Write-Host "6. Copy ALL the red error text" -ForegroundColor Red
Write-Host "7. Paste it in the chat" -ForegroundColor White
Write-Host ""
Write-Host "WITHOUT THE ERROR TEXT, I CANNOT FIX IT!" -ForegroundColor Yellow -BackgroundColor Red
Write-Host ""
Write-Host "OR use this PowerShell to push and monitor:" -ForegroundColor Cyan
Write-Host ""
Write-Host 'cd C:\Users\HEMACHANDAR\crypto-trading-dashboard; git push origin main; Start-Process "https://github.com/hemachandarm7-sketch/crypto-trading-dashboard/actions"' -ForegroundColor Green
