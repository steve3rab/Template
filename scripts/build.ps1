[CmdletBinding()]
param(
    [switch]$Preview,
    [int]$Port = 4173,
    [switch]$Expose
)

. (Join-Path $PSScriptRoot 'common.ps1')
Assert-DependenciesInstalled
Invoke-Npm -Arguments @('run', 'build')

if ($Preview) {
    $hostAddress = if ($Expose) { '0.0.0.0' } else { '127.0.0.1' }
    Write-Host "Prévisualisation du build : http://localhost:$Port" -ForegroundColor Cyan
    Invoke-Npm -Arguments @('run', 'preview', '--', '--host', $hostAddress, '--port', "$Port")
}
