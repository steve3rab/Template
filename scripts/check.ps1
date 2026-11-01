[CmdletBinding()]
param()

. (Join-Path $PSScriptRoot 'common.ps1')
Assert-DependenciesInstalled
Write-Host 'Exécution des contrôles qualité complets...' -ForegroundColor Cyan
Invoke-Npm -Arguments @('run', 'check')
