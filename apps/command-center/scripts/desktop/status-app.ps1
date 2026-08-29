#Requires -Version 7.0

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'command-center-common.ps1')

$config = Get-CommandCenterConfig
$node = Find-InventorExecutable -Names @('node.exe', 'node')
$state = Get-CommandCenterState -Config $config
$processReady = $state -and $node -and (Test-CommandCenterProcess -State $state -NodePath $node)
$windowReady = (Get-InventorAppWindow -WindowTitle (Get-InventorWindowTitle -Config $config)) -ne [IntPtr]::Zero
[pscustomobject]@{
    Servicio = if (Test-CommandCenterHealth -Config $config) { 'listo' } else { 'detenido' }
    Proceso  = if ($processReady) { 'listo' } else { 'detenido' }
    Ventana  = if ($windowReady) { 'lista' } else { 'cerrada' }
    Memoria  = if (Test-Path -LiteralPath $config.DataDir) { 'lista' } else { 'se crea al iniciar' }
} | Format-List
