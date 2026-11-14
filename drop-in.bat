@echo off
setlocal
 title supportka drop-in
set "SUPPORTKA_BAT=%~f0"
powershell -NoProfile -ExecutionPolicy Bypass -Command "$p=$env:SUPPORTKA_BAT; $lines=Get-Content -LiteralPath $p; $marker=[Array]::IndexOf($lines,'__SUPPORTKA_POWERSHELL__'); if($marker -lt 0){exit 1}; $tmp=Join-Path $env:TEMP ('supportka-drop-in-'+$PID+'.ps1'); $lines[($marker+1)..($lines.Count-1)] | Set-Content -LiteralPath $tmp -Encoding UTF8; & powershell -NoProfile -ExecutionPolicy Bypass -File $tmp -SourceDir (Split-Path $p); $code=$LASTEXITCODE; Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue; exit $code"
echo.
pause
exit /b
__SUPPORTKA_POWERSHELL__
param([string]$SourceDir = $PSScriptRoot)

# supportka drop-in installer
# Installs the supportka build into:
#   - Vencord (stock Discord injection; official + custom install paths)
#   - Vesktop and any other app that loads Vencord from <data>\sessionData\vencordFiles
# Usage: double-click drop-in.bat, or run this file directly.

$ErrorActionPreference = "SilentlyContinue"

$scriptDir = $SourceDir

$distSource = Join-Path $scriptDir "Vencord\dist"
if (-not (Test-Path (Join-Path $distSource "renderer.js"))) {
    Write-Host "[FAIL] Vencord build is missing from this archive." -ForegroundColor Red
    exit 1
}

$distTarget = Join-Path $env:APPDATA "Vencord\dist"
$files = @("patcher.js", "preload.js", "renderer.js", "renderer.css")
try {
    New-Item -ItemType Directory -Path $distTarget -Force | Out-Null
    foreach ($file in $files) {
        $source = Join-Path $distSource $file
        if (-not (Test-Path $source)) { throw "Missing build file: $file" }
        $destination = Join-Path $distTarget $file
        if ((Test-Path $destination) -and -not (Test-Path "$destination.supportka-backup")) {
            Copy-Item $destination "$destination.supportka-backup" -ErrorAction Stop
        }
        Copy-Item $source $destination -Force -ErrorAction Stop
    }

    $settingsPath = Join-Path $env:APPDATA "Vencord\settings\settings.json"
    if (-not (Test-Path $settingsPath)) { throw "Vencord settings not found: $settingsPath" }
    $cfg = Get-Content -LiteralPath $settingsPath -Raw | ConvertFrom-Json
    if (-not $cfg.plugins.PSObject.Properties['supportka']) {
        $cfg.plugins | Add-Member -MemberType NoteProperty -Name supportka -Value ([pscustomobject]@{ enabled = $true })
    } else {
        $cfg.plugins.supportka.enabled = $true
    }
    Set-Content -LiteralPath $settingsPath -Value ($cfg | ConvertTo-Json -Depth 40) -Encoding utf8
    Write-Host "[OK] Current Vencord build installed; Supportka enabled." -ForegroundColor Green
    Write-Host "Restart Discord. Previous runtime files are backed up as *.supportka-backup." -ForegroundColor Cyan
} catch {
    Write-Host "[FAIL] $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "Close Discord fully and run drop-in.bat again." -ForegroundColor Yellow
    exit 1
}
