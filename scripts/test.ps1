[CmdletBinding()]
param(
    [switch]$Coverage,
    [switch]$E2E,
    [switch]$InstallBrowser
)

. (Join-Path $PSScriptRoot 'common.ps1')
Assert-DependenciesInstalled

if ($E2E) {
    if ($InstallBrowser) {
        Invoke-Npm -Arguments @('exec', 'playwright', 'install', 'chromium')
    }
    Invoke-Npm -Arguments @('run', 'test:e2e')
}
elseif ($Coverage) {
    Invoke-Npm -Arguments @('run', 'test:coverage')
}
else {
    Invoke-Npm -Arguments @('run', 'test')
}
