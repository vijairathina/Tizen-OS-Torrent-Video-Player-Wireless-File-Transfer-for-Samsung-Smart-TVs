# Multi-Platform Test Execution Script
$ErrorActionPreference = "Stop"

Write-Host "================================================================" -ForegroundColor Cyan
Write-Host " Running Multi-Platform Verification & Test Suites" -ForegroundColor Cyan
Write-Host "================================================================" -ForegroundColor Cyan

$RootDir = Split-Path -Parent $PSScriptRoot

# 1. Validate Tizen Source & Package Integrity
Write-Host "`n[1/2] Verifying Samsung Tizen Application Integrity..." -ForegroundColor Yellow
python "$RootDir\build.py"
if ($LASTEXITCODE -ne 0) {
    Write-Host "Tizen integrity validation failed!" -ForegroundColor Red
    exit 1
}

# 2. Run Android Unit Tests
Write-Host "`n[2/2] Running Android Shared Core & Repository Unit Tests..." -ForegroundColor Yellow
$AndroidDir = Join-Path $RootDir "android"
Set-Location $AndroidDir

if (-not $env:JAVA_HOME -or -not (Test-Path $env:JAVA_HOME)) {
    if (Test-Path "D:\PY\VGuard\jdk\jdk-17.0.2") {
        $env:JAVA_HOME = "D:\PY\VGuard\jdk\jdk-17.0.2"
        $env:Path = "$env:JAVA_HOME\bin;$env:Path"
    }
}
if (-not $env:GRADLE_USER_HOME) {
    $env:GRADLE_USER_HOME = "d:\PY\.gradle_home"
}
$gradleCmd = if ($IsWindows -or $env:OS -like "*Windows*") { ".\gradlew.bat" } else { "./gradlew" }
& $gradleCmd -g $env:GRADLE_USER_HOME ":core:testDebugUnitTest"
if ($LASTEXITCODE -ne 0) {
    Write-Host "Android unit tests failed!" -ForegroundColor Red
    exit 1
}

Write-Host "`n[TESTS FINISHED] Verification completed successfully." -ForegroundColor Green
