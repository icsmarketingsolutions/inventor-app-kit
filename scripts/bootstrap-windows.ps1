#requires -Version 7.0

[CmdletBinding(SupportsShouldProcess = $true)]
param(
    [switch]$Install
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Test-IsAdministrator {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = [Security.Principal.WindowsPrincipal]::new($identity)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Invoke-External {
    param(
        [Parameter(Mandatory)][string]$FilePath,
        [Parameter(Mandatory)][string[]]$Arguments,
        [Parameter(Mandatory)][string]$Description
    )

    Write-Host ("Ejecutando: {0}" -f $Description) -ForegroundColor Cyan
    & $FilePath @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw ("Falló '{0}' con código {1}." -f $Description, $LASTEXITCODE)
    }
}

function Install-WingetPackage {
    param(
        [Parameter(Mandatory)][string]$Id,
        [Parameter(Mandatory)][string]$Label,
        [string]$Version
    )

    if ($PSCmdlet.ShouldProcess($Label, "Instalar con winget ($Id)")) {
        $wingetArguments = @(
            'install',
            '--exact',
            '--id', $Id,
            '--source', 'winget',
            '--accept-source-agreements',
            '--accept-package-agreements',
            '--disable-interactivity'
        )
        if (-not [string]::IsNullOrWhiteSpace($Version)) {
            $wingetArguments += @('--version', $Version)
        }
        Invoke-External -FilePath 'winget.exe' -Description ("instalar {0}" -f $Label) -Arguments $wingetArguments
    }
}

$packages = @(
    [pscustomobject]@{ Id = 'Git.Git'; Label = 'Git'; Version = $null },
    [pscustomobject]@{ Id = 'GitHub.cli'; Label = 'GitHub CLI'; Version = $null },
    [pscustomobject]@{ Id = 'OpenJS.NodeJS.LTS'; Label = 'Node.js 24 LTS'; Version = '24.18.0' },
    [pscustomobject]@{ Id = 'Docker.DockerDesktop'; Label = 'Docker Desktop'; Version = $null }
)

Write-Host ''
Write-Host 'Bootstrap de Windows — Inventor App Kit' -ForegroundColor White
Write-Host ''

if (-not $IsWindows) {
    throw 'Este script de bootstrap solo se ejecuta en Windows.'
}

Write-Host 'Plan:' -ForegroundColor White
Write-Host '  1. Preparar WSL 2 como motor local de Linux.'
foreach ($package in $packages) {
    Write-Host ("  - Instalar {0} mediante winget ({1})." -f $package.Label, $package.Id)
}
Write-Host '  - Codex CLI se instala después, desde una terminal normal sin privilegios.'
Write-Host '  - NO crear cuentas, iniciar OAuth, configurar Supabase, desplegar ni tocar DNS.'
Write-Host '  - NO solicitar ni imprimir contraseñas, tokens o archivos .env.'
Write-Host ''

if (-not $Install) {
    Write-Host 'DRY-RUN: no se realizó ningún cambio.' -ForegroundColor Green
    Write-Host 'Revisá el plan. Para instalar, abrí PowerShell 7 como administrador y usá:' -ForegroundColor Yellow
    Write-Host '  pwsh -NoProfile -File ./scripts/bootstrap-windows.ps1 -Install'
    exit 0
}

if (-not (Test-IsAdministrator)) {
    throw 'Para usar -Install, abrí PowerShell 7 con “Ejecutar como administrador”.'
}

if ($null -eq (Get-Command -Name 'winget.exe' -ErrorAction SilentlyContinue)) {
    throw 'No se encontró winget. Instalá o actualizá App Installer desde Microsoft Store y repetí.'
}

if ($PSCmdlet.ShouldProcess('WSL 2', 'Instalar componentes faltantes y fijar la versión predeterminada en 2')) {
    $null = & wsl.exe --status *> $null
    if ($LASTEXITCODE -ne 0) {
        Invoke-External -FilePath 'wsl.exe' -Description 'instalar WSL sin una distribución adicional' -Arguments @(
            '--install', '--no-distribution'
        )
    }

    Invoke-External -FilePath 'wsl.exe' -Description 'usar WSL 2 por defecto' -Arguments @(
        '--set-default-version', '2'
    )
}

foreach ($package in $packages) {
    Install-WingetPackage -Id $package.Id -Label $package.Label -Version $package.Version
}

Write-Host ''
Write-Host 'Instalación local terminada.' -ForegroundColor Green
Write-Host 'Reiniciá Windows. Luego, en una consola normal, instalá Codex con el comando fijado en setup/COMPUTADORA_NUEVA.md.' -ForegroundColor Yellow
Write-Host 'Abrí Docker Desktop y ejecutá:' -ForegroundColor Yellow
Write-Host '  pwsh -NoProfile -File ./scripts/check-machine.ps1'
Write-Host ''
Write-Host 'Las cuentas, OAuth y MCP se configuran manualmente en setup/MCP_Y_CUENTAS.md.'
