# One-click push script
cd C:\Users\HEMACHANDAR\crypto-trading-dashboard

Write-Host "Pushing to GitHub..." -ForegroundColor Cyan
git push origin main

if ($LASTEXITCODE -eq 0) {
    Write-Host "`n✓ Push successful!" -ForegroundColor Green
    Write-Host "`nBuild starting at:" -ForegroundColor Yellow
    Write-Host "https://github.com/hemachandarm7-sketch/crypto-trading-dashboard/actions" -ForegroundColor Blue
    Write-Host "`nWait ~8-10 minutes, then download APK from Artifacts section" -ForegroundColor Yellow
} else {
    Write-Host "`n✗ Push failed" -ForegroundColor Red
    Write-Host "Run with token:" -ForegroundColor Yellow
    Write-Host 'git push https://hemachandarm7-sketch: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@github.com/hemachandarm7-sketch/crypto-trading-dashboard.git main' -ForegroundColor Gray
}
