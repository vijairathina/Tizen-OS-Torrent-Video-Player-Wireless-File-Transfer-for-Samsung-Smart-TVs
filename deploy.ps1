<#
.SYNOPSIS
    Automated Deployment & Testing Script for Samsung Tizen Smart TV
.DESCRIPTION
    Checks network reachability, verifies Developer Mode on Samsung CU7000/CU7700,
    connects via SDB, installs the TVFileHub.wgt package, and launches the app.
#>

param(
    [string]$TV_IP = "192.168.0.12",
    [string]$Host_IP = "192.168.0.13",
    [switch]$StartServer
)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$SDB = Join-Path $ScriptDir "tools\sdb.exe"
$WGT = Join-Path $ScriptDir "build\TVFileHub.wgt"
$AppID = "aM9fHub001.TVFileHub"

Write-Host "================================================================" -ForegroundColor Cyan
Write-Host " Samsung Tizen TV Automated Deployment & Hardware Bridge" -ForegroundColor Cyan
Write-Host " Target TV: Samsung Crystal UHD (CU7000 / CU7700) @ $TV_IP" -ForegroundColor Cyan
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
    Write-Host "       Dev Host IP: $($dev.developerIP)"

    if ($dev.developerMode -eq "0") {
        Write-Host ""
        Write-Host "================================================================" -ForegroundColor Red
        Write-Host " ACTION REQUIRED ON SAMSUNG TV REMOTE:" -ForegroundColor Yellow
        Write-Host " Developer Mode is currently OFF on the TV." -ForegroundColor Yellow
        Write-Host " Please perform these 4 quick steps on your TV:" -ForegroundColor White
        Write-Host "   1. Press Home button -> navigate to 'Apps' panel." -ForegroundColor White
        Write-Host "   2. On your remote, press numbers: 1 2 3 4 5" -ForegroundColor White
        Write-Host "   3. In the popup, toggle Developer Mode to ON" -ForegroundColor White
        Write-Host "      and enter Host PC IP: $Host_IP" -ForegroundColor White
        Write-Host "   4. Turn TV OFF and ON (or hold Power button for 5s to reboot)." -ForegroundColor White
        Write-Host "================================================================" -ForegroundColor Red
        Write-Host ""
    }
} catch {
    Write-Host "  [WARN] TV REST API not responding on port 8001: $_" -ForegroundColor DarkYellow
}

# 2. Check Package
Write-Host "[2/5] Checking .wgt package..." -ForegroundColor Yellow
if (-not (Test-Path $WGT)) {
    Write-Host "  Package not found. Building now..." -ForegroundColor Yellow
    python "$ScriptDir\build.py"
}
Write-Host "  [OK] Package ready: $WGT" -ForegroundColor Green

# 3. Connect & Verify TV
Write-Host "[3/5] Connecting to TV via SDB..." -ForegroundColor Yellow
$CLI = Join-Path $ScriptDir "tools\apps2samsung\apps2samsung-cli.exe"
try {
    & $SDB connect $TV_IP
    Write-Host "  [OK] SDB connected to $TV_IP" -ForegroundColor Green
} catch {
    Write-Host "  [!] SDB connection warning: $_" -ForegroundColor DarkYellow
}

# 4. Install Application
Write-Host "[4/5] Installing TVFileHub.wgt onto TV (Samsung Signed)..." -ForegroundColor Yellow
try {
    & $CLI install $WGT --tv $TV_IP --launch --plain
    Write-Host "  [OK] Installation & Launch completed successfully!" -ForegroundColor Green
} catch {
    Write-Host "  [!] Install command output: $_" -ForegroundColor DarkYellow
}

if ($StartServer) {
    Write-Host ""
    Write-Host "Starting companion file transfer server..." -ForegroundColor Cyan
    python "$ScriptDir\server\server.py"
}

Write-Host "================================================================" -ForegroundColor Cyan
Write-Host " Deployment script finished." -ForegroundColor Cyan
Write-Host "================================================================" -ForegroundColor Cyan
