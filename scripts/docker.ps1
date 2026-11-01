[CmdletBinding()]
param(
    [ValidateSet('Build', 'Run', 'Stop', 'Logs')]
    [string]$Action = 'Build',
    [string]$Image = 'template-react:local',
    [string]$Container = 'template-react-local',
    [int]$Port = 8080
)

. (Join-Path $PSScriptRoot 'common.ps1')
Test-ExternalCommand -Name 'docker'

switch ($Action) {
    'Build' {
        Push-Location $script:ProjectRoot
        try {
            & docker build -t $Image .
            if ($LASTEXITCODE -ne 0) { throw "La construction Docker a échoué (code $LASTEXITCODE)." }
        }
        finally { Pop-Location }
    }
    'Run' {
        & docker run --rm --name $Container -p "${Port}:8080" $Image
        if ($LASTEXITCODE -ne 0) { throw "Le lancement Docker a échoué (code $LASTEXITCODE)." }
    }
    'Stop' {
        & docker stop $Container
        if ($LASTEXITCODE -ne 0) { throw "L'arrêt du conteneur a échoué (code $LASTEXITCODE)." }
    }
    'Logs' {
        & docker logs --follow $Container
        if ($LASTEXITCODE -ne 0) { throw "La lecture des logs a échoué (code $LASTEXITCODE)." }
    }
}
