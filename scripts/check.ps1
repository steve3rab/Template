[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'common.ps1')
Assert-DependenciesInstalled
Invoke-Npm -Arguments @('run', 'check') -Description 'Contrôles complets : TypeScript, ESLint, Prettier, couverture et builds'
