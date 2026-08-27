#requires -Version 7.0

[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$script:Failures = 0

function Write-Check {
    param(
        [Parameter(Mandatory)]
        [ValidateSet('OK', 'FALTA', 'INFO')]
        [string]$State,

        [Parameter(Mandatory)]
        [string]$Name,

        [Parameter(Mandatory)]
        [string]$Detail
    )

    if ($State -eq 'FALTA') {
        $script:Failures++
    }

    $color = switch ($State) {
        'OK' { 'Green' }
        'FALTA' { 'Red' }
        default { 'Cyan' }
    }

    Write-Host ('[{0,-5}] {1}: {2}' -f $State, $Name, $Detail) -ForegroundColor $color
}

function Test-AvailableCommand {
    param([Parameter(Mandatory)][string]$Name)
    return $null -ne (Get-Command -Name $Name -ErrorAction SilentlyContinue)
}

function Get-DockerCommandPath {
    $command = Get-Command -Name 'docker' -ErrorAction SilentlyContinue
    if ($null -ne $command) {
        return $command.Source
    }

    if ($IsWindows -and -not [string]::IsNullOrWhiteSpace($env:LOCALAPPDATA)) {
        $perUserDocker = Join-Path $env:LOCALAPPDATA 'Programs/DockerDesktop/resources/bin/docker.exe'
        if ([System.IO.File]::Exists($perUserDocker)) {
            return $perUserDocker
        }
    }

    $systemDocker = 'C:\Program Files\Docker\Docker\resources\bin\docker.exe'
    if ($IsWindows -and [System.IO.File]::Exists($systemDocker)) {
        return $systemDocker
    }

    return $null
}

function Invoke-ExternalCapture {
    param(
        [Parameter(Mandatory)][string]$FilePath,
        [Parameter(Mandatory)][string[]]$Arguments
    )

    $startInfo = [System.Diagnostics.ProcessStartInfo]::new()
    $startInfo.FileName = $FilePath
    $startInfo.UseShellExecute = $false
    $startInfo.CreateNoWindow = $true
    $startInfo.RedirectStandardOutput = $true
    $startInfo.RedirectStandardError = $true
    foreach ($argument in $Arguments) {
        $startInfo.ArgumentList.Add($argument)
    }

    $process = [System.Diagnostics.Process]::new()
    $process.StartInfo = $startInfo
    $null = $process.Start()
    $standardOutput = $process.StandardOutput.ReadToEnd()
    $standardError = $process.StandardError.ReadToEnd()
    $process.WaitForExit()
    return [pscustomobject]@{
        ExitCode = $process.ExitCode
        Output   = $standardOutput.Trim()
        Error    = $standardError.Trim()
    }
}

Write-Host ''
Write-Host 'Chequeo de computadora — Inventor App Kit' -ForegroundColor White
Write-Host 'Este script no instala nada y no imprime secretos.' -ForegroundColor DarkGray
Write-Host ''

if (-not $IsWindows) {
    Write-Check -State 'FALTA' -Name 'Windows' -Detail 'Esta ruta de onboarding requiere Windows 10/11.'
}
else {
    Write-Check -State 'OK' -Name 'Windows' -Detail 'Sistema Windows detectado.'
}

if ($PSVersionTable.PSVersion.Major -ge 7) {
    Write-Check -State 'OK' -Name 'PowerShell' -Detail ("Versión {0}." -f $PSVersionTable.PSVersion)
}
else {
    Write-Check -State 'FALTA' -Name 'PowerShell' -Detail 'Instalá PowerShell 7 o superior.'
}

if (Test-AvailableCommand -Name 'node') {
    $nodeVersion = (& node --version 2>$null).Trim()
    $nodeMajorText = $nodeVersion.TrimStart('v').Split('.')[0]
    $nodeMajor = 0
    if ([int]::TryParse($nodeMajorText, [ref]$nodeMajor) -and $nodeMajor -eq 24) {
        Write-Check -State 'OK' -Name 'Node.js' -Detail ("{0} (24 LTS)." -f $nodeVersion)
    }
    else {
        Write-Check -State 'FALTA' -Name 'Node.js' -Detail ("Se requiere 24 LTS; se detectó {0}." -f $nodeVersion)
    }
}
else {
    Write-Check -State 'FALTA' -Name 'Node.js' -Detail 'No se encontró el comando node.'
}

if (Test-AvailableCommand -Name 'npm') {
    $npmVersion = (& npm --version 2>$null).Trim()
    Write-Check -State 'OK' -Name 'npm' -Detail ("Versión {0}." -f $npmVersion)
}
else {
    Write-Check -State 'FALTA' -Name 'npm' -Detail 'Se instala junto con Node.js 24 LTS.'
}

if (Test-AvailableCommand -Name 'git') {
    $gitVersion = (& git --version 2>$null).Trim()
    Write-Check -State 'OK' -Name 'Git' -Detail $gitVersion

    $gitNameConfigured = -not [string]::IsNullOrWhiteSpace((& git config --global user.name 2>$null))
    $gitEmailConfigured = -not [string]::IsNullOrWhiteSpace((& git config --global user.email 2>$null))
    if ($gitNameConfigured -and $gitEmailConfigured) {
        Write-Check -State 'OK' -Name 'Identidad Git' -Detail 'Nombre y correo configurados (valores ocultos).'
    }
    else {
        Write-Check -State 'FALTA' -Name 'Identidad Git' -Detail 'Configurá user.name y user.email según la guía.'
    }
}
else {
    Write-Check -State 'FALTA' -Name 'Git' -Detail 'No se encontró el comando git.'
}

if (Test-AvailableCommand -Name 'gh') {
    $null = & gh auth status *> $null
    if ($LASTEXITCODE -eq 0) {
        Write-Check -State 'OK' -Name 'GitHub CLI' -Detail 'Instalado y autenticado (identidad oculta).'
    }
    else {
        Write-Check -State 'FALTA' -Name 'GitHub CLI' -Detail 'Ejecutá gh auth login --web y completá el navegador.'
    }
}
else {
    Write-Check -State 'FALTA' -Name 'GitHub CLI' -Detail 'No se encontró el comando gh.'
}

if (Test-AvailableCommand -Name 'wsl.exe') {
    $null = & wsl.exe --version
    if ($LASTEXITCODE -eq 0) {
        Write-Check -State 'OK' -Name 'WSL' -Detail 'WSL moderno disponible. Docker debe usar el motor WSL 2.'
    }
    else {
        Write-Check -State 'FALTA' -Name 'WSL' -Detail 'Instalá o terminá de configurar WSL 2 y reiniciá.'
    }
}
else {
    Write-Check -State 'FALTA' -Name 'WSL' -Detail 'No se encontró WSL 2.'
}

$dockerCommandPath = Get-DockerCommandPath
if ($null -ne $dockerCommandPath) {
    $dockerVersion = Invoke-ExternalCapture -FilePath $dockerCommandPath -Arguments @('--version')
    $dockerInfo = Invoke-ExternalCapture -FilePath $dockerCommandPath -Arguments @('info', '--format', '{{.ServerVersion}}')
    if ($dockerVersion.ExitCode -eq 0 -and $dockerInfo.ExitCode -eq 0) {
        Write-Check -State 'OK' -Name 'Docker' -Detail ("Motor {0} activo; {1}" -f $dockerInfo.Output, $dockerVersion.Output)
    }
    else {
        Write-Check -State 'FALTA' -Name 'Docker' -Detail 'La CLI existe, pero el motor no responde. Abrí Docker Desktop.'
    }
}
else {
    Write-Check -State 'FALTA' -Name 'Docker' -Detail 'No se encontró Docker Desktop ni su CLI por usuario.'
}

if (Test-AvailableCommand -Name 'codex') {
    try {
        $codexVersion = (& codex --version).Trim()
        if ($LASTEXITCODE -eq 0 -and -not [string]::IsNullOrWhiteSpace($codexVersion)) {
            Write-Check -State 'OK' -Name 'Codex' -Detail $codexVersion
        }
        else {
            Write-Check -State 'FALTA' -Name 'Codex' -Detail 'El comando existe, pero no respondió. Abrí Codex, iniciá sesión y repetí en una terminal nueva.'
        }
    }
    catch {
        Write-Check -State 'FALTA' -Name 'Codex' -Detail 'El comando existe, pero Windows no pudo ejecutarlo. Abrí Codex y repetí en una terminal nueva.'
    }
}
else {
    Write-Check -State 'FALTA' -Name 'Codex' -Detail 'No se encontró el comando codex.'
}

if (Test-AvailableCommand -Name 'supabase') {
    $supabaseVersion = (& supabase --version 2>$null).Trim()
    Write-Check -State 'OK' -Name 'Supabase CLI' -Detail ("CLI disponible: {0}." -f $supabaseVersion)
}
else {
    Write-Check -State 'INFO' -Name 'Supabase CLI' -Detail 'Se instalará por proyecto y se ejecutará con npx; no hace falta una instalación global.'
}

Write-Host ''
Write-Check -State 'INFO' -Name 'Revisión manual' -Detail 'Confirmá GitHub 2FA, sesión de Codex y MCP Supabase DEV/read-only en setup/MCP_Y_CUENTAS.md.'
Write-Host ''

if ($script:Failures -gt 0) {
    Write-Host ("Resultado: {0} requisito(s) con FALTA." -f $script:Failures) -ForegroundColor Red
    Write-Host 'Seguí setup/COMPUTADORA_NUEVA.md y repetí este chequeo.' -ForegroundColor Yellow
    exit 1
}

Write-Host 'Resultado: herramientas locales listas. Completá también la revisión manual indicada.' -ForegroundColor Green
exit 0
