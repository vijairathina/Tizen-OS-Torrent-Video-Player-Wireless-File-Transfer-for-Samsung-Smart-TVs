# Universal Android Deployer for LinkPlay (Phones, Tablets & TV)
param(
    [string]$DeviceSerial = "",
    [string]$Target = "phone", # "phone" or "tv"
    [string]$ApkPath = ""
)

$ErrorActionPreference = "Continue"

Write-Host "================================================================" -ForegroundColor Cyan
Write-Host " LinkPlay - Universal Android Deployer" -ForegroundColor Cyan
Write-Host "================================================================" -ForegroundColor Cyan

$adb = "D:\Android\Sdk\platform-tools\adb.exe"
if (-not (Test-Path $adb)) { $adb = "C:\ADB\adb.exe" }
if (-not (Test-Path $adb)) { $adb = "adb" }

if (-not $ApkPath) {
    if ($Target -eq "tv") {
        $ApkPath = "$PSScriptRoot\..\android\tv\build\outputs\apk\debug\tv-debug.apk"
    } else {
        $ApkPath = "$PSScriptRoot\..\android\phone\build\outputs\apk\debug\phone-debug.apk"
    }
}

if (-not (Test-Path $ApkPath)) {
    Write-Host "[INFO] APK not found. Building target: $Target..." -ForegroundColor Yellow
    & "$PSScriptRoot\build_android.ps1" -Target $Target
}

# Enumerate devices
$rawDevices = & $adb devices -l
$activeDevices = @()
foreach ($line in ($rawDevices -split "`r?`n")) {
    if ($line -match '^([^\s]+)\s+device\b') {
        $activeDevices += $matches[1]
    }
}

if ($activeDevices.Count -eq 0) {
    Write-Host "[WARNING] No active ADB device found. Attempting to connect to known endpoints..." -ForegroundColor Yellow
    & $adb connect "192.168.0.23:5555" # Moto Edge 70 Fusion
    & $adb connect "192.168.0.100:5555" # iBall Tablet
    Start-Sleep -Seconds 1
    $rawDevices = & $adb devices -l
    foreach ($line in ($rawDevices -split "`r?`n")) {
        if ($line -match '^([^\s]+)\s+device\b') {
            $activeDevices += $matches[1]
        }
    }
}

if ($activeDevices.Count -eq 0) {
    Write-Host "[ERROR] No authorized ADB device found. Ensure USB debugging is ON." -ForegroundColor Red
    exit 1
}

$targetDevice = $DeviceSerial
if (-not $targetDevice) {
    $targetDevice = $activeDevices[0]
}

Write-Host "`nTarget Device: $targetDevice" -ForegroundColor Green
Write-Host "Installing APK: $ApkPath..." -ForegroundColor Yellow

& $adb -s $targetDevice install -r -d "$ApkPath"

$pkg = if ($Target -eq "tv") { "com.tvfilehub.tv.debug/com.tvfilehub.tv.TvMainActivity" } else { "com.tvfilehub.phone.debug/com.tvfilehub.phone.PhoneMainActivity" }
Write-Host "Launching $pkg on device..." -ForegroundColor Yellow
& $adb -s $targetDevice shell am start -n $pkg

Write-Host "`n[SUCCESS] LinkPlay successfully deployed and running on $targetDevice!" -ForegroundColor Green
