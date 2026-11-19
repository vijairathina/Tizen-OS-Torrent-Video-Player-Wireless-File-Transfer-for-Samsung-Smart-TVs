# Install LinkPlay APK onto iBall Tablet over LAN/Wi-Fi
param(
    [string]$TabletIP = "192.168.0.100",
    [int]$SshPort = 8022,
    [string]$SshUser = "u0_a108",
    [string]$ApkPath = "D:\PY\SamsungTV\android\phone\build\outputs\apk\debug\phone-debug.apk"
)

$ErrorActionPreference = "Continue"

Write-Host "================================================================" -ForegroundColor Cyan
Write-Host " LinkPlay - iBall Tablet Deployer (IP: $TabletIP)" -ForegroundColor Cyan
Write-Host "================================================================" -ForegroundColor Cyan

if (-not (Test-Path $ApkPath)) {
    Write-Host "[ERROR] APK not found at $ApkPath. Building phone APK first..." -ForegroundColor Yellow
    & "$PSScriptRoot\build_android.ps1" -Target "phone"
}

$adb = "D:\Android\Sdk\platform-tools\adb.exe"
if (-not (Test-Path $adb)) {
    $adb = "C:\ADB\adb.exe"
}
if (-not (Test-Path $adb)) {
    $adb = "adb"
}

# 1. Try direct ADB connection over Wi-Fi
Write-Host "`n[1/3] Testing ADB Wi-Fi connection (${TabletIP}:5555)..." -ForegroundColor Yellow
$adbRes = & $adb connect "${TabletIP}:5555" 2>&1
Write-Host "ADB status: $adbRes"

$devices = & $adb devices
if ($devices -match "${TabletIP}:5555\s+device") {
    Write-Host "[OK] ADB connected wirelessly! Installing APK via ADB..." -ForegroundColor Green
    & $adb -s "${TabletIP}:5555" install -r -d "$ApkPath"
    Write-Host "`nLaunching LinkPlay on tablet..." -ForegroundColor Yellow
    & $adb -s "${TabletIP}:5555" shell am start -n com.tvfilehub.phone.debug/com.tvfilehub.phone.PhoneMainActivity
    Write-Host "[SUCCESS] LinkPlay installed and launched!" -ForegroundColor Green
    exit 0
}

# 2. Check for USB-connected tablet on PC to activate TCP 5555
Write-Host "`n[2/3] Checking if tablet is connected via USB to switch to Wi-Fi ADB..." -ForegroundColor Yellow
$usbDevice = $devices | Where-Object { $_ -match "\b[0-9A-Fa-f]{8,}\s+device\b" -and $_ -notmatch ":5555" }
if ($usbDevice) {
    Write-Host "Found USB device: $usbDevice. Switching to port 5555..." -ForegroundColor Green
    & $adb tcpip 5555
    Start-Sleep -Seconds 2
    & $adb connect "$TabletIP`:5555"
    & $adb -s "$TabletIP`:5555" install -r -d "$ApkPath"
    & $adb -s "$TabletIP`:5555" shell am start -n com.tvfilehub.phone.debug/com.tvfilehub.phone.PhoneMainActivity
    Write-Host "[SUCCESS] LinkPlay installed and launched via activated ADB!" -ForegroundColor Green
    exit 0
}

# 3. Deploy via active SSH connection + PackageInstaller
Write-Host "`n[3/3] Deploying via active SSH transport on port $SshPort..." -ForegroundColor Yellow
Write-Host "Transferring APK to /sdcard/Download/TVFileHub.apk..." -ForegroundColor Yellow
scp -P $SshPort -o "StrictHostKeyChecking=no" "$ApkPath" "${SshUser}@${TabletIP}:/sdcard/Download/TVFileHub.apk"

# Also ensure it's available on HTTP companion Server
$publicDir = "D:\PY\SamsungTV\server\public"
if (Test-Path $publicDir) {
    Copy-Item -Path $ApkPath -Destination (Join-Path $publicDir "TVFileHub.apk") -Force
    Write-Host "APK also hosted at: http://192.168.0.14:8080/TVFileHub.apk" -ForegroundColor Green
}

Write-Host "Launching PackageInstaller on tablet screen..." -ForegroundColor Yellow
ssh -p $SshPort -o "StrictHostKeyChecking=no" "${SshUser}@${TabletIP}" "export PATH=/system/bin:`$PATH; am start --user 0 -n com.google.android.packageinstaller/com.android.packageinstaller.PackageInstallerActivity -d file:///sdcard/Download/TVFileHub.apk"

Write-Host "`n[DONE] PackageInstaller dialog is active on the iBall tablet screen." -ForegroundColor Green
Write-Host "Please tap 'INSTALL' on the tablet display to confirm installation." -ForegroundColor Cyan
