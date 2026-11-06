[CmdletBinding(SupportsShouldProcess = $true)]
param()

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'common.ps1')

$projectPath = [System.IO.Path]::GetFullPath($script:ProjectRoot).TrimEnd('\')
$targets = @('dev.ps1', 'backend.ps1')
$processes = @(
    Get-CimInstance -ClassName Win32_Process -ErrorAction Stop | Where-Object {
        $candidate = $_
        if ($candidate.ProcessId -eq $PID -or
            $candidate.Name -notmatch '^(powershell|pwsh)\.exe$' -or
            -not $candidate.CommandLine -or
            $candidate.CommandLine.IndexOf($projectPath, [System.StringComparison]::OrdinalIgnoreCase) -lt 0) {
            return $false
        }

        foreach ($target in $targets) {
            $targetPath = Join-Path $projectPath "scripts\$target"
            if ($candidate.CommandLine.IndexOf($targetPath, [System.StringComparison]::OrdinalIgnoreCase) -ge 0) {
                return $true
            }
        }
        return $false
    }
)

if ($processes.Count -eq 0) {
    Write-Host 'Aucune fenêtre frontend/backend correspondante trouvée.' -ForegroundColor Yellow
    return
}

foreach ($process in $processes) {
    $description = "PID $($process.ProcessId) — $($process.Name)"
    if ($PSCmdlet.ShouldProcess($description, 'Arrêter le processus et ses enfants')) {
        $taskkill = Get-Command 'taskkill.exe' -ErrorAction SilentlyContinue
        if ($taskkill) {
            & $taskkill.Source /PID $process.ProcessId /T /F | Out-Null
            if ($LASTEXITCODE -ne 0) {
                Write-Warning "Impossible d'arrêter $description (code $LASTEXITCODE)."
            }
            else {
                Write-Host "Arrêté : $description" -ForegroundColor Green
            }
        }
        else {
            Stop-Process -Id $process.ProcessId -Force -ErrorAction Stop
            Write-Host "Arrêté : $description (sans arrêt garanti des processus enfants)." -ForegroundColor Yellow
        }
    }
}
