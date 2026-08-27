#Requires -Version 7.0

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'desktop-common.ps1')

$root = Resolve-InventorAppRoot -ScriptDirectory $PSScriptRoot
$config = Get-InventorDesktopConfig -Root $root
$runtimeStatePath = Join-Path $config.RuntimeDir 'runtime.json'
$hadFailure = $false
$mutex = [System.Threading.Mutex]::new($false, 'Local\InventorApp-DesktopServices')
$ownsMutex = $false

try {
    $ownsMutex = $mutex.WaitOne(10000)
    if (-not $ownsMutex) {
        throw 'Otra app sigue iniciando o deteniendo servicios. Espera unos segundos y volve a intentar.'
    }

$windowCloseResult = Close-InventorAppWindow -Config $config
if ($windowCloseResult -eq 'closed') {
    Write-InventorDesktopLog -Config $config -Message 'Ventana de aplicacion cerrada.'
}
elseif ($windowCloseResult -eq 'failed') {
    Write-Warning 'La ventana de la aplicacion no respondio al cierre.'
    $hadFailure = $true
}

if (Test-Path -LiteralPath $runtimeStatePath -PathType Leaf) {
    try {
        $runtimeState = Get-Content -Raw -LiteralPath $runtimeStatePath | ConvertFrom-Json
        $vitePid = [int]$runtimeState.vitePid
        $expectedStart = ConvertTo-InventorUtcDate -Value $runtimeState.startedAtUtc
        $process = Get-Process -Id $vitePid -ErrorAction SilentlyContinue
        if ($process) {
            $actualStart = $process.StartTime.ToUniversalTime()
            if ($process.ProcessName -ne 'node' -or [Math]::Abs(($actualStart - $expectedStart).TotalSeconds) -gt 2) {
                throw 'El PID guardado ahora pertenece a otro proceso; no se detuvo.'
            }
            Stop-Process -Id $vitePid -Force
            if (-not $process.WaitForExit(10000)) {
                throw 'Vite no termino en 10 segundos; se conservo el estado runtime.'
            }
            Write-InventorDesktopLog -Config $config -Message 'Vite detenido.'
        }
        Remove-Item -LiteralPath $runtimeStatePath -Force
    }
    catch {
        Write-Warning $_.Exception.Message
        $hadFailure = $true
    }
}
elseif (Test-InventorWebApp -Config $config) {
    Write-Warning 'Vite responde, pero no fue iniciado por este lanzador; no se detuvo un proceso desconocido.'
}

$npx = Find-InventorExecutable -Names @('npx.cmd', 'npx') -Candidates @(
    (Join-Path $env:ProgramFiles 'nodejs\npx.cmd')
)
$docker = Get-InventorDockerCli
$dockerIsLocal = $docker -and
    (Test-InventorDockerEndpointLocal -DockerCli $docker -WorkingDirectory $root)
if (-not $dockerIsLocal) {
    Write-Warning 'El contexto Docker no es el motor local de Docker Desktop; Supabase no se detuvo.'
    $hadFailure = $true
}
elseif ($npx) {
    $stop = Invoke-InventorProcess -FilePath $npx `
        -Arguments @('--no-install', 'supabase', 'stop', '--workdir', $root, '--yes') `
        -WorkingDirectory $root -TimeoutMilliseconds 120000
    if ($stop.ExitCode -eq 0) {
        Write-InventorDesktopLog -Config $config -Message 'Supabase local detenido; datos conservados.'
    }
    else {
        Write-Warning 'Supabase no pudo detenerse automaticamente.'
        $hadFailure = $true
    }
}
else {
    Write-Warning 'No se encontro npx; Supabase no pudo comprobarse ni detenerse.'
    $hadFailure = $true
}

if ($hadFailure) {
    Write-Output 'Apagado incompleto. Revisa las advertencias; Docker Desktop queda abierto.'
    exit 1
}

Write-Output 'Ventana y servicios de la app detenidos. Docker Desktop queda abierto para otras aplicaciones.'
}
finally {
    if ($ownsMutex) { $mutex.ReleaseMutex() }
    $mutex.Dispose()
}
