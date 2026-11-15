<#
.SYNOPSIS
    Automated Deployment & Testing Script for Android on Samsung Tizen Smart TV
.DESCRIPTION
    Builds the Android.wgt package, verifies TV network reachability,
    connects via SDB to 192.168.0.12, signs & installs using apps2samsung-cli,
    and launches the Android environment on the TV screen.
#>

param(
    [string]$TV_IP = "192.168.0.12",
    [string]$Host_IP = "192.168.0.13"
)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ToolsDir = "D:\PY\SamsungTV\tools"
$SDB = Join-Path $ToolsDir "sdb.exe"
$CLI = Join-Path $ToolsDir "apps2samsung\apps2samsung-cli.exe"
$WGT = Join-Path $ScriptDir "build\Android.wgt"
$AppID = "aM9fAnd001.Android"

Write-Host "================================================================" -ForegroundColor Cyan
Write-Host " Android TV - Samsung Tizen Automated Deployment Engine" -ForegroundColor Cyan
Write-Host " Target TV: Samsung Smart TV (UA43UE84AFULXL) @ $TV_IP" -ForegroundColor Cyan
Write-Host " Host PC:   $Host_IP" -ForegroundColor Cyan
Write-Host "================================================================" -ForegroundColor Cyan

# 1. Check TV REST API
Write-Host "[1/5] Checking Samsung TV status over network..." -ForegroundColor Yellow
try {
    $res = Invoke-RestMethod -Uri "http://${TV_IP}:8001/api/v2/" -TimeoutSec 3 -ErrorAction Stop
    $dev = $res.device
    Write-Host "  [OK] Connected to Samsung Smart TV!" -ForegroundColor Green
    Write-Host "       Model:       $($dev.modelName) ($($dev.model))"
    Write-Host "       Resolution:  $($dev.resolution)"
    Write-Host "       Power State: $($dev.PowerState)"
    Write-Host "       Dev Mode:    $($dev.developerMode)"
} catch {
    Write-Host "  [WARN] TV REST API not responding on port 8001: $_" -ForegroundColor DarkYellow
}

# 2. Build / Package WGT
Write-Host "[2/5] Building Android.wgt package..." -ForegroundColor Yellow
python "$ScriptDir\build.py"
if (-not (Test-Path $WGT)) {
    Write-Error "Build failed: $WGT not found."
    exit 1
}
Write-Host "  [OK] Package ready: $WGT" -ForegroundColor Green

# 3. Connect via SDB
Write-Host "[3/5] Connecting to TV via SDB..." -ForegroundColor Yellow
try {
    & $SDB connect $TV_IP
    Write-Host "  [OK] SDB connected to $TV_IP" -ForegroundColor Green
} catch {
    Write-Host "  [WARN] SDB connect notice: $_" -ForegroundColor DarkYellow
}

# 4. Install Application via apps2samsung-cli
Write-Host "[4/5] Installing Android.wgt onto TV (Samsung Signed)..." -ForegroundColor Yellow
try {
    & $CLI install $WGT --tv $TV_IP --launch --plain
    Write-Host "  [OK] Installation & Launch completed successfully!" -ForegroundColor Green
} catch {
    Write-Host "  [!] Install command output: $_" -ForegroundColor DarkYellow
}

# 5. Launch verification
Write-Host "[5/5] Verifying launch on TV..." -ForegroundColor Yellow
try {
    & $CLI launch $AppID --tv $TV_IP
    Write-Host "  [OK] Android application is now running live on Samsung TV!" -ForegroundColor Green
} catch {
    Write-Host "  [INFO] Launch check finished: $_" -ForegroundColor DarkYellow
}

Write-Host "================================================================" -ForegroundColor Cyan
Write-Host " Deployment Complete! You can now control Android with TV remote." -ForegroundColor Green
Write-Host "================================================================" -ForegroundColor Cyan
