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
# Installs the supportka build into the Vencord data directory:
#   %APPDATA%\Vencord\dist
# Usage: double-click drop-in.bat, or run this file directly.

$ErrorActionPreference = "Stop"

$scriptDir = $SourceDir
$versionLabel = Split-Path $scriptDir -Leaf
$expectedVersion = $versionLabel -replace '^supportka-v', ''
if ($expectedVersion -notmatch '^\d+\.\d+\.\d+$') {
    Write-Host "[FAIL] Could not detect the Supportka version from the folder name: $versionLabel" -ForegroundColor Red
    exit 1
}

$distSource = Join-Path $scriptDir "Vencord\dist"
if (-not (Test-Path (Join-Path $distSource "renderer.js"))) {
    Write-Host "[FAIL] Vencord build is missing from this archive." -ForegroundColor Red
    exit 1
}

$distTarget = Join-Path $env:APPDATA "Vencord\dist"
$files = @("patcher.js", "preload.js", "renderer.js", "renderer.css")
try {
    $running = Get-Process -Name Discord,DiscordCanary,DiscordPTB,Vesktop -ErrorAction SilentlyContinue
    if ($running) {
        throw "Discord is still running. Close it fully (including the tray icon) and run drop-in.bat again."
    }

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

    $installedRenderer = Get-Content (Join-Path $distTarget "renderer.js") -Raw -Encoding UTF8
    if ($installedRenderer -notmatch "vc-supportka") {
        throw "Supportka code was not found in the installed build. The archive may be corrupted."
    }
    if ($installedRenderer -notmatch ([regex]::Escape($expectedVersion))) {
        throw "The installed build is not Supportka v$expectedVersion. The archive may be corrupted."
    }

    $settingsPath = Join-Path $env:APPDATA "Vencord\settings\settings.json"
    if (-not (Test-Path $settingsPath)) { throw "Vencord settings not found: $settingsPath" }
    $settingsBackup = "$settingsPath.supportka-backup"
    if (-not (Test-Path $settingsBackup)) {
        Copy-Item $settingsPath $settingsBackup -Force
    }
    $rawSettings = Get-Content -LiteralPath $settingsPath -Raw -Encoding UTF8
    $cfg = $rawSettings | ConvertFrom-Json
    if (-not $cfg.plugins) { throw "Vencord settings has no plugins section." }
    $enabledBefore = @($cfg.plugins.PSObject.Properties | Where-Object { $_.Value.enabled -eq $true } | ForEach-Object Name)
    if (-not $cfg.plugins.PSObject.Properties['supportka']) {
        $cfg.plugins | Add-Member -MemberType NoteProperty -Name supportka -Value ([pscustomobject]@{ enabled = $true })
    } else {
        $cfg.plugins.supportka.enabled = $true
    }
    if (-not $cfg.PSObject.Properties['autoUpdate']) {
        $cfg | Add-Member -MemberType NoteProperty -Name autoUpdate -Value $false
    } else {
        $cfg.autoUpdate = $false
    }
    $json = $cfg | ConvertTo-Json -Depth 40
    [IO.File]::WriteAllText($settingsPath, $json, (New-Object System.Text.UTF8Encoding($false)))
    $saved = Get-Content -LiteralPath $settingsPath -Raw -Encoding UTF8 | ConvertFrom-Json
    $enabledAfter = @($saved.plugins.PSObject.Properties | Where-Object { $_.Value.enabled -eq $true } | ForEach-Object Name)
    $missing = @($enabledBefore | Where-Object { $_ -ne "supportka" -and $_ -notin $enabledAfter })
    if ($missing.Count -gt 0) { throw "Enabled plugins were lost: $($missing -join ', ')" }
    if ($saved.plugins.supportka.enabled -ne $true) { throw "Supportka was not enabled in settings." }
    if ($saved.autoUpdate -ne $false) { throw "Failed to disable Vencord auto-update." }
    Write-Host "[OK] Current Vencord build installed; Supportka enabled." -ForegroundColor Green
    Write-Host "[OK] Vencord auto-update disabled so it cannot replace Supportka." -ForegroundColor Green
    Write-Host "Restart Discord. Settings backup: $settingsBackup" -ForegroundColor Cyan
    Write-Host "If you update Vencord manually later, run drop-in.bat again." -ForegroundColor Yellow
} catch {
    Write-Host "[FAIL] $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "Close Discord fully and run drop-in.bat again." -ForegroundColor Yellow
    exit 1
}
