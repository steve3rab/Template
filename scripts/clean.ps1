[CmdletBinding(SupportsShouldProcess = $true)]
param(
    [switch]$Dependencies
)

. (Join-Path $PSScriptRoot 'common.ps1')

$targets = @('dist', 'coverage', 'playwright-report', 'test-results')
if ($Dependencies) { $targets += 'node_modules' }

foreach ($target in $targets) {
    $path = Join-Path $script:ProjectRoot $target
    if (Test-Path $path) {
        if ($PSCmdlet.ShouldProcess($path, 'Supprimer')) {
            Remove-Item -LiteralPath $path -Recurse -Force
            Write-Host "Supprimé : $target" -ForegroundColor Yellow
        }
    }
}

Write-Host 'Nettoyage terminé.' -ForegroundColor Green
