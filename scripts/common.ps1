Set-StrictMode -Version Latest

$script:ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path

function Test-ExternalCommand {
    param([Parameter(Mandatory = $true)][string]$Name)

    if (-not (Get-Command -Name $Name -ErrorAction SilentlyContinue)) {
        throw "Commande '$Name' introuvable. Vérifiez l'installation et le PATH."
    }
}

function Get-CommandVersion {
    param([Parameter(Mandatory = $true)][string]$Name)

    Test-ExternalCommand -Name $Name
    $versionText = (& $Name --version 2>&1 | Select-Object -First 1).ToString().Trim()
    if ($LASTEXITCODE -ne 0 -or $versionText -notmatch '([0-9]+\.[0-9]+\.[0-9]+)') {
        throw "Impossible de lire la version de $Name. Résultat : $versionText"
    }
    return [version]$Matches[1]
}

function Assert-Toolchain {
    $nodeVersion = Get-CommandVersion -Name 'node'
    $npmVersion = Get-CommandVersion -Name 'npm.cmd'
    if ($nodeVersion -lt [version]'22.16.0') {
        throw "Node.js 22.16.0 ou supérieur est requis. Version détectée : $nodeVersion"
    }
    if ($npmVersion -lt [version]'10.9.0') {
        throw "npm 10.9.0 ou supérieur est requis. Version détectée : $npmVersion"
    }
    Write-Host "Node.js $nodeVersion | npm $npmVersion" -ForegroundColor DarkGray
}

function Invoke-Npm {
    param(
        [Parameter(Mandatory = $true)][string[]]$Arguments,
        [string]$Description = ''
    )

    $npmCommand = Get-Command 'npm.cmd' -ErrorAction SilentlyContinue
    if (-not $npmCommand) {
        throw 'npm.cmd est introuvable. Vérifiez que Node.js est installé et présent dans PATH.'
    }

    if ($Description) {
        Write-Host "`n$Description" -ForegroundColor Cyan
    }
    Write-Host ("> npm " + ($Arguments -join ' ')) -ForegroundColor DarkGray

    $capturedOutput = New-Object 'System.Collections.Generic.List[string]'
    $previousErrorActionPreference = $ErrorActionPreference
    $exitCode = 1
    Push-Location $script:ProjectRoot
    try {
        $ErrorActionPreference = 'Continue'
        & $npmCommand.Source @Arguments 2>&1 | ForEach-Object {
            $line = $_.ToString()
            $capturedOutput.Add($line)
            Write-Host $line
        }
        $exitCode = $LASTEXITCODE
    }
    finally {
        $ErrorActionPreference = $previousErrorActionPreference
        Pop-Location
    }

    if ($exitCode -ne 0) {
        Write-Host "`nÉCHEC — code de sortie : $exitCode" -ForegroundColor Red
        $references = @($capturedOutput | Where-Object {
            $_ -match '(?i)(error TS\d+|(?:src|server|e2e|scripts)/[^\s:]+:\d+(?::\d+)?|[^\s]+\.(?:ts|tsx|js|jsx|ps1)\(\d+,\d+\):\s*error|ERR!)'
        } | Select-Object -Unique -Last 25)
        if ($references.Count -gt 0) {
            Write-Host 'Références utiles (fichier / ligne / erreur) :' -ForegroundColor Yellow
            foreach ($reference in $references) {
                Write-Host "  $reference" -ForegroundColor Yellow
            }
        }
        else {
            Write-Host 'Aucune référence fichier/ligne détectée ; consultez la sortie ci-dessus.' -ForegroundColor Yellow
        }
        throw "La commande npm a échoué : npm $($Arguments -join ' ') (code $exitCode)."
    }

    Write-Host 'Terminé avec succès.' -ForegroundColor Green
}

function Assert-DependenciesInstalled {
    Test-ExternalCommand -Name 'node'
    Test-ExternalCommand -Name 'npm.cmd'
    $nodeModules = Join-Path $script:ProjectRoot 'node_modules'
    if (-not (Test-Path -LiteralPath $nodeModules -PathType Container)) {
        throw 'Les dépendances ne sont pas installées. Exécutez .\scripts\setup.ps1 depuis la racine du dépôt.'
    }
}

function Test-PortAvailable {
    param([Parameter(Mandatory = $true)][ValidateRange(1, 65535)][int]$Port)

    $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $Port)
    try {
        $listener.Start()
        return $true
    }
    catch [System.Net.Sockets.SocketException] {
        return $false
    }
    finally {
        $listener.Stop()
    }
}
