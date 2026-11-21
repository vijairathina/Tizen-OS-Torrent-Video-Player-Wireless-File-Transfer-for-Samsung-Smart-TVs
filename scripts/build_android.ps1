# Build Android Phone, Android TV, and Android Auto Applications
param(
    [string]$Target = "all", # phone, tv, auto, all
    [string]$BuildType = "Debug" # Debug or Release
)

$ErrorActionPreference = "Stop"

Write-Host "================================================================" -ForegroundColor Cyan
Write-Host " Building Android Applications: Target=$Target, Type=$BuildType" -ForegroundColor Cyan
Write-Host "================================================================" -ForegroundColor Cyan

$RootDir = Split-Path -Parent $PSScriptRoot
$AndroidDir = Join-Path $RootDir "android"
Set-Location $AndroidDir

if (-not $env:JAVA_HOME -or -not (Test-Path $env:JAVA_HOME)) {
    if (Test-Path "D:\PY\VGuard\jdk\jdk-17.0.2") {
        $env:JAVA_HOME = "D:\PY\VGuard\jdk\jdk-17.0.2"
        $env:Path = "$env:JAVA_HOME\bin;$env:Path"
    }
}
if (-not $env:ANDROID_HOME -or -not (Test-Path $env:ANDROID_HOME)) {
    if (Test-Path "D:\Android\Sdk") {
        $env:ANDROID_HOME = "D:\Android\Sdk"
        $env:Path = "$env:ANDROID_HOME\cmdline-tools\latest\bin;$env:ANDROID_HOME\platform-tools;$env:Path"
    }
}
if (-not $env:GRADLE_USER_HOME) {
    $env:GRADLE_USER_HOME = "d:\PY\.gradle_home"
}

$gradleCmd = if ($IsWindows -or $env:OS -like "*Windows*") { ".\gradlew.bat" } else { "./gradlew" }
if (-not (Test-Path $gradleCmd)) {
    $gradleCmd = "gradle"
}
$extraArgs = @()
if ($env:GRADLE_USER_HOME) {
    $extraArgs += @("-g", $env:GRADLE_USER_HOME)
}

switch ($Target.ToLower()) {
    "phone" {
        & $gradleCmd @extraArgs ":phone:assemble$BuildType"
    }
    "tv" {
        & $gradleCmd @extraArgs ":tv:assemble$BuildType"
    }
    "auto" {
        & $gradleCmd @extraArgs ":auto:assemble$BuildType"
    }
    default {
        & $gradleCmd @extraArgs ":phone:assemble$BuildType" ":tv:assemble$BuildType" ":auto:assemble$BuildType"
    }
}

if ($LASTEXITCODE -eq 0) {
    Write-Host "`n[SUCCESS] Android build completed successfully!" -ForegroundColor Green
} else {
    Write-Host "`n[ERROR] Android build failed with exit code $LASTEXITCODE" -ForegroundColor Red
    exit 1
}
