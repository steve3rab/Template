[CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
param(
    [switch]$Dependencies
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'common.ps1')

$targets = @('dist', 'server/dist', 'coverage', 'playwright-report', 'test-results')
if ($Dependencies) { $targets += 'node_modules' }

foreach ($target in $targets) {
    $path = Join-Path $script:ProjectRoot $target
    if (Test-Path -LiteralPath $path) {
        if ($PSCmdlet.ShouldProcess($path, 'Supprimer les artefacts')) {
            Remove-Item -LiteralPath $path -Recurse -Force
            Write-Host "Supprimé : $target" -ForegroundColor Yellow
        }
    }
}
Write-Host 'Nettoyage terminé.' -ForegroundColor Green
