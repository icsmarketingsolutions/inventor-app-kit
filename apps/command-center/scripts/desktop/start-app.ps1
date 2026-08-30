#Requires -Version 7.0

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'command-center-common.ps1')

if (-not $IsWindows) { throw 'El lanzador de escritorio esta disponible solo en Windows.' }
$config = Get-CommandCenterConfig
$mutex = Get-CommandCenterMutex
$acquired = $false
try {
    $acquired = $mutex.WaitOne([TimeSpan]::FromSeconds(30))
    if (-not $acquired) { throw 'Otro arranque o apagado sigue en curso.' }

    if (Test-CommandCenterHealth -Config $config) {
        Open-CommandCenterWindow -Config $config
        exit 0
    }
    if (Test-InventorTcpPort -Port $config.Port) {
        throw "El puerto $($config.Port) pertenece a otra aplicacion."
    }
    $entry = Join-Path $config.Root 'server\index.mjs'
    $dist = Join-Path $config.Root 'dist\index.html'
    if (-not (Test-Path -LiteralPath $entry -PathType Leaf)) { throw 'Falta el servidor local.' }
    if (-not (Test-Path -LiteralPath $dist -PathType Leaf)) {
        throw 'Falta el build. Ejecuta npm run build antes de abrir el acceso directo.'
    }
    $node = Find-InventorExecutable -Names @('node.exe', 'node')
    if (-not $node) { throw 'Node.js 24 no esta disponible.' }

    [System.IO.Directory]::CreateDirectory($config.RuntimeDir) | Out-Null
    [System.IO.Directory]::CreateDirectory($config.DataDir) | Out-Null
    $startInfo = [System.Diagnostics.ProcessStartInfo]::new()
    $startInfo.FileName = $node
    $startInfo.WorkingDirectory = $config.Root
    $startInfo.UseShellExecute = $false
    $startInfo.CreateNoWindow = $true
    $startInfo.Environment['NODE_ENV'] = 'production'
    $startInfo.Environment['INVENTOR_OS_HOME'] = $config.DataDir
    $startInfo.Environment['INVENTOR_OS_PWSH'] = [System.IO.Path]::GetFullPath((Join-Path $PSHOME 'pwsh.exe'))
    $startInfo.ArgumentList.Add($entry)
    $startInfo.ArgumentList.Add('--port')
    $startInfo.ArgumentList.Add([string]$config.Port)
    $process = [System.Diagnostics.Process]::Start($startInfo)
    if (-not $process) { throw 'No se pudo iniciar el servidor local.' }

    $state = [ordered]@{
        pid       = $process.Id
        startedAt = $process.StartTime.ToUniversalTime().ToString('o')
        node      = [System.IO.Path]::GetFullPath($node)
    }
    [System.IO.File]::WriteAllText(
        (Join-Path $config.RuntimeDir 'runtime.json'),
        ($state | ConvertTo-Json),
        [System.Text.UTF8Encoding]::new($false)
    )

    $deadline = [DateTime]::UtcNow.AddSeconds(30)
    while (-not (Test-CommandCenterHealth -Config $config) -and [DateTime]::UtcNow -lt $deadline) {
        if ($process.HasExited) { throw 'El servidor local termino durante el arranque.' }
        Start-Sleep -Milliseconds 250
    }
    if (-not (Test-CommandCenterHealth -Config $config)) {
        try { $process.Kill($true) } catch { }
        throw 'El Command Center no respondio a tiempo.'
    }
    Write-InventorDesktopLog -Config $config -Message 'Servidor local listo; abriendo ventana.'
    Open-CommandCenterWindow -Config $config
}
catch {
    Write-InventorDesktopLog -Config $config -Message "ERROR: $($_.Exception.Message)"
    Show-InventorDesktopError -Title $config.Name -Message $_.Exception.Message
    exit 1
}
finally {
    if ($acquired) { $mutex.ReleaseMutex() }
    $mutex.Dispose()
}
