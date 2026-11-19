# Build Samsung Tizen TV Widget Package (.wgt)
$ErrorActionPreference = "Stop"

Write-Host "================================================================" -ForegroundColor Cyan
Write-Host " Building Samsung Tizen OS Package (.wgt)" -ForegroundColor Cyan
Write-Host "================================================================" -ForegroundColor Cyan

$RootDir = Split-Path -Parent $PSScriptRoot
Set-Location $RootDir

python build.py

if ($LASTEXITCODE -eq 0) {
    Write-Host "`n[SUCCESS] Tizen build finished: $RootDir\build\TVFileHub.wgt" -ForegroundColor Green
} else {
    Write-Host "`n[ERROR] Tizen build failed with exit code $LASTEXITCODE" -ForegroundColor Red
    exit 1
}
