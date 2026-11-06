[CmdletBinding()]
param(
    [ValidateSet('All', 'Unit', 'Integration', 'Coverage', 'E2E', 'LoadSmoke', 'LoadStress')]
    [string]$Mode = 'All',
    [switch]$Coverage,
    [switch]$E2E,
    [switch]$InstallBrowser
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'common.ps1')
Assert-DependenciesInstalled

if ($Coverage -and $E2E) {
    throw 'Choisissez un seul mode : -Coverage ou -E2E.'
}
if ($Coverage) { $Mode = 'Coverage' }
if ($E2E) { $Mode = 'E2E' }
if ($InstallBrowser -and $Mode -ne 'E2E') {
    throw '-InstallBrowser ne peut être utilisé qu’avec -Mode E2E ou -E2E.'
}

switch ($Mode) {
    'All' { Invoke-Npm -Arguments @('run', 'test') }
    'Unit' { Invoke-Npm -Arguments @('run', 'test:unit') }
    'Integration' { Invoke-Npm -Arguments @('run', 'test:integration') }
    'Coverage' { Invoke-Npm -Arguments @('run', 'test:coverage:ci') }
    'E2E' {
        if ($InstallBrowser) {
            Invoke-Npm -Arguments @('exec', '--', 'playwright', 'install', 'chromium')
        }
        Invoke-Npm -Arguments @('run', 'test:e2e')
    }
    'LoadSmoke' { Invoke-Npm -Arguments @('run', 'test:load:smoke') }
    'LoadStress' {
        if (-not $env:BASE_URL) {
            throw 'Définissez BASE_URL vers une préproduction isolée avant un test de charge.'
        }
        Invoke-Npm -Arguments @('run', 'test:load:stress')
    }
}
