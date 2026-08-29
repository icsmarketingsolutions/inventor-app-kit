#Requires -Version 7.0

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'command-center-common.ps1')

$config = Get-CommandCenterConfig
$mutex = Get-CommandCenterMutex
$acquired = $false
$failed = $false
try {
    $acquired = $mutex.WaitOne([TimeSpan]::FromSeconds(30))
    if (-not $acquired) { throw 'Otro arranque o apagado sigue en curso.' }

    $closed = Close-InventorAppWindow -Config $config
    if ($closed -eq 'failed') { $failed = $true }
    $state = Get-CommandCenterState -Config $config
    $node = Find-InventorExecutable -Names @('node.exe', 'node')
    if ($state -and $node -and (Test-CommandCenterProcess -State $state -NodePath $node)) {
        try {
            $process = Get-Process -Id ([int]$state.pid) -ErrorAction Stop
            $process.Kill($true)
            if (-not $process.WaitForExit(10000)) { $failed = $true }
        }
        catch { $failed = $true }
    }
    elseif ($state) {
        $failed = $true
    }

    if (-not $failed) {
        $statePath = Join-Path $config.RuntimeDir 'runtime.json'
        if (Test-Path -LiteralPath $statePath) { [System.IO.File]::Delete($statePath) }
        Write-Output 'Command Center detenido. La memoria local se conserva.'
    }
    else {
        Write-Error 'Apagado incompleto: se conservo el estado para diagnostico.'
        exit 1
    }
}
finally {
    if ($acquired) { $mutex.ReleaseMutex() }
    $mutex.Dispose()
}
