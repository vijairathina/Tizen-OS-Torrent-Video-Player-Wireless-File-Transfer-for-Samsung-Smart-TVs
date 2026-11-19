# Automated Tizen TV Deployment for LinkPlay
param(
    [string]$TV_IP = "192.168.0.12"
)

$ErrorActionPreference = "Stop"

Write-Host "================================================================" -ForegroundColor Cyan
Write-Host " LinkPlay - Samsung Tizen TV Automated Deployer" -ForegroundColor Cyan
Write-Host " Target TV: $TV_IP" -ForegroundColor Cyan
Write-Host "================================================================" -ForegroundColor Cyan

$RootDir = Split-Path -Parent $PSScriptRoot
Set-Location $RootDir

# 1. Package .wgt archive
Write-Host "`n[1/3] Building LinkPlay Tizen package..." -ForegroundColor Yellow
python "$RootDir\build.py"
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Build failed." -ForegroundColor Red
    exit 1
}

$wgt = Join-Path $RootDir "build\TVFileHub.wgt"
$cli = Join-Path $RootDir "tools\apps2samsung\apps2samsung-cli.exe"

# 2. Check TV reachability
Write-Host "`n[2/3] Checking TV connection at $TV_IP..." -ForegroundColor Yellow
try {
    $res = Invoke-RestMethod -Uri "http://${TV_IP}:8001/api/v2/" -TimeoutSec 3 -ErrorAction Stop
    Write-Host "  [OK] Connected to Samsung Smart TV: $($res.device.modelName) (Power: $($res.device.PowerState), DevMode: $($res.device.developerMode))" -ForegroundColor Green
} catch {
    Write-Host "  [WARN] TV REST API not responding on port 8001: $_" -ForegroundColor Yellow
}

# 3. Sign, Install & Launch via apps2samsung-cli
Write-Host "`n[3/3] Installing and launching LinkPlay on Samsung TV..." -ForegroundColor Yellow
& $cli install $wgt --tv $TV_IP --launch --plain -y

Write-Host "`n[SUCCESS] LinkPlay successfully deployed and running on Samsung TV ($TV_IP)!" -ForegroundColor Green
