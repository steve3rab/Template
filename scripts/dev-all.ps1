[CmdletBinding()]
param(
    [ValidateRange(1, 65535)][int]$FrontendPort = 5173,
    [ValidateRange(1, 65535)][int]$BackendPort = 3001,
    [switch]$SeedTestUsers
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'common.ps1')
Assert-DependenciesInstalled

if ($FrontendPort -eq $BackendPort) {
    throw 'Les ports frontend et backend doivent être différents.'
}
foreach ($port in @($FrontendPort, $BackendPort)) {
    if (-not (Test-PortAvailable -Port $port)) {
        throw "Le port $port est déjà utilisé. Arrêtez le service concerné ou choisissez un autre port."
    }
}

# The API origin must exactly match the browser URL used to open Vite.
$frontendOrigin = "http://localhost:$FrontendPort"

if ($SeedTestUsers) {
    $previousSeedOrigin = $env:APP_ORIGIN
    try {
        $env:APP_ORIGIN = $frontendOrigin
        & (Join-Path $PSScriptRoot 'seed-test-users.ps1')
    }
    finally {
        if ($null -eq $previousSeedOrigin) {
            Remove-Item Env:APP_ORIGIN -ErrorAction SilentlyContinue
        }
        else {
            $env:APP_ORIGIN = $previousSeedOrigin
        }
    }
}

$shellPath = if ($PSVersionTable.PSEdition -eq 'Core') {
    Join-Path $PSHOME 'pwsh.exe'
}
else {
    Join-Path $PSHOME 'powershell.exe'
}
if (-not (Test-Path -LiteralPath $shellPath)) {
    throw "Exécutable PowerShell introuvable : $shellPath"
}

$frontendScript = Join-Path $PSScriptRoot 'dev.ps1'
$backendScript = Join-Path $PSScriptRoot 'backend.ps1'
$previousOrigin = $env:APP_ORIGIN
$backendProcess = $null
$frontendProcess = $null
try {
    $env:APP_ORIGIN = $frontendOrigin
    $backendArguments = "-ExecutionPolicy Bypass -File `"$backendScript`" -Port $BackendPort"
    $backendProcess = Start-Process -FilePath $shellPath -ArgumentList $backendArguments -WorkingDirectory $script:ProjectRoot -PassThru -NoNewWindow

    $backendDeadline = (Get-Date).AddSeconds(20)
    while ((Test-PortAvailable -Port $BackendPort) -and (Get-Date) -lt $backendDeadline) {
        $backendProcess.Refresh()
        if ($backendProcess.HasExited) {
            throw "La fenêtre backend s'est fermée (code $($backendProcess.ExitCode))."
        }
        Start-Sleep -Milliseconds 500
    }
    if (Test-PortAvailable -Port $BackendPort) {
        throw "API non disponible sur le port $BackendPort après 20 secondes."
    }

    $frontendArguments = "-ExecutionPolicy Bypass -File `"$frontendScript`" -Port $FrontendPort"
    $frontendProcess = Start-Process -FilePath $shellPath -ArgumentList $frontendArguments -WorkingDirectory $script:ProjectRoot -PassThru -NoNewWindow

    $frontendDeadline = (Get-Date).AddSeconds(20)
    while ((Test-PortAvailable -Port $FrontendPort) -and (Get-Date) -lt $frontendDeadline) {
        $frontendProcess.Refresh()
        if ($frontendProcess.HasExited) {
            throw "La fenêtre frontend s'est fermée (code $($frontendProcess.ExitCode))."
        }
        Start-Sleep -Milliseconds 500
    }
    if (Test-PortAvailable -Port $FrontendPort) {
        throw "Le frontend ne répond pas sur le port $FrontendPort après 20 secondes."
    }
}
catch {
    foreach ($process in @($frontendProcess, $backendProcess)) {
        if ($null -ne $process) {
            $process.Refresh()
            if (-not $process.HasExited) {
                $taskkill = Get-Command 'taskkill.exe' -ErrorAction SilentlyContinue
                if ($taskkill) {
                    & $taskkill.Source /PID $process.Id /T /F | Out-Null
                }
                else {
                    Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
                }
            }
        }
    }
    throw
}
finally {
    if ($null -eq $previousOrigin) {
        Remove-Item Env:APP_ORIGIN -ErrorAction SilentlyContinue
    }
    else {
        $env:APP_ORIGIN = $previousOrigin
    }
}

Write-Host ''
Write-Host 'Les deux serveurs sont démarrés dans le terminal courant, avec des processus séparés.' -ForegroundColor Green
Write-Host "Frontend : $frontendOrigin  (PID $($frontendProcess.Id))" -ForegroundColor Cyan
Write-Host "Backend  : http://127.0.0.1:$BackendPort/api/health  (PID $($backendProcess.Id))" -ForegroundColor Cyan
Write-Host 'Origine API autorisée : identique a l origine frontend (protection anti-CSRF active).' -ForegroundColor DarkGray
Write-Host 'Arrêt groupé : .\scripts\stop-dev-all.ps1' -ForegroundColor Yellow
