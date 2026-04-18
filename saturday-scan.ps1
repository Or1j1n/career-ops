# Career-Ops Saturday Auto-Scan
$ProjectDir = "C:\dev\career-ops"
Set-Location $ProjectDir
Write-Host "Starting Saturday Scan..." -ForegroundColor Cyan
node scan.mjs
Write-Host "Scan Complete. Check data/pipeline.md for new offers." -ForegroundColor Green
