#Requires -Version 7.0

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'command-center-common.ps1')

$config = Get-CommandCenterConfig
$vbsPath = Join-Path $PSScriptRoot 'start-app.vbs'
$expectedArguments = '"' + $vbsPath + '"'
$shell = New-Object -ComObject WScript.Shell
$expectedTarget = [System.IO.Path]::GetFullPath((Join-Path $env:SystemRoot 'System32\wscript.exe'))
$removed = 0
foreach ($shortcutPath in Get-InventorShortcutPaths -Config $config) {
    if (-not (Test-Path -LiteralPath $shortcutPath -PathType Leaf)) { continue }
    $shortcut = $shell.CreateShortcut($shortcutPath)
    if ([System.IO.Path]::GetFullPath($shortcut.TargetPath) -ne $expectedTarget -or
        $shortcut.Arguments -ne $expectedArguments) {
        throw "No se elimino un acceso que ahora apunta a otra aplicacion: $shortcutPath"
    }
    [System.IO.File]::Delete($shortcutPath)
    $removed += 1
}
Write-Output "Accesos eliminados: $removed. La memoria y el codigo se conservan."
