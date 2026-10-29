[CmdletBinding()]
param(
    [int]$FrontendPort = 5173,
    [int]$BackendPort = 3001
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'common.ps1')
Assert-DependenciesInstalled

Write-Host 'Démarrage du frontend et du backend dans deux fenêtres PowerShell.' -ForegroundColor Cyan
$frontend = Join-Path $PSScriptRoot 'dev.ps1'
$backend = Join-Path $PSScriptRoot 'backend.ps1'
$frontendCommand = "& '$frontend' -Port $FrontendPort"
$backendCommand = "& '$backend' -Port $BackendPort"
Start-Process -FilePath 'powershell.exe' -ArgumentList @('-NoExit', '-ExecutionPolicy', 'Bypass', '-Command', $backendCommand)
Start-Sleep -Milliseconds 700
Start-Process -FilePath 'powershell.exe' -ArgumentList @('-NoExit', '-ExecutionPolicy', 'Bypass', '-Command', $frontendCommand)
Write-Host "Frontend : http://localhost:$FrontendPort" -ForegroundColor Green
Write-Host "Backend  : http://localhost:$BackendPort/api/health" -ForegroundColor Green