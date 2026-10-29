[CmdletBinding()]
param(
    [int]$Port = 4173,
    [switch]$Expose,
    [switch]$SkipBuild
)

$ErrorActionPreference = 'Stop'

$buildScript = Join-Path $PSScriptRoot 'build.ps1'
$arguments = @('-Preview', '-Port', "$Port")
if ($Expose) { $arguments += '-Expose' }

if ($SkipBuild) {
    . (Join-Path $PSScriptRoot 'common.ps1')
    Assert-DependenciesInstalled
    Invoke-Npm -Arguments @('run', 'preview', '--', '--host', $(if ($Expose) { '0.0.0.0' } else { '127.0.0.1' }), '--port', "$Port")
}
else {
    & $buildScript @arguments
    if ($LASTEXITCODE -and $LASTEXITCODE -ne 0) {
        throw "Le mode preview a échoué (code $LASTEXITCODE)."
    }
}
