#Requires -Version 7.0

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'desktop-common.ps1')

if (-not $IsWindows) {
    throw 'La desinstalacion de accesos directos esta disponible solo en Windows.'
}

$root = Resolve-InventorAppRoot -ScriptDirectory $PSScriptRoot
$config = Get-InventorDesktopConfig -Root $root
$vbsPath = Join-Path $PSScriptRoot 'start-app.vbs'
$expectedArguments = '"' + $vbsPath + '"'
$shell = New-Object -ComObject WScript.Shell
$removed = 0

foreach ($shortcutPath in Get-InventorShortcutPaths -Config $config) {
    if (-not (Test-Path -LiteralPath $shortcutPath -PathType Leaf)) { continue }
    $shortcut = $shell.CreateShortcut($shortcutPath)
    $targetMatches = [System.IO.Path]::GetFullPath($shortcut.TargetPath) -eq
        [System.IO.Path]::GetFullPath((Join-Path $env:SystemRoot 'System32\wscript.exe'))
    if (-not $targetMatches -or $shortcut.Arguments -ne $expectedArguments) {
        throw "No se elimino un acceso directo que ahora apunta a otra aplicacion: $shortcutPath"
    }
    Remove-Item -LiteralPath $shortcutPath -Force
    $removed += 1
}

Write-InventorDesktopLog -Config $config -Message 'Accesos directos desinstalados; datos y codigo conservados.'
Write-Output "Accesos directos eliminados: $removed. La app y sus datos locales no se borraron."
