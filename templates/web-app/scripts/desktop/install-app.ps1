#Requires -Version 7.0

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'desktop-common.ps1')

if (-not $IsWindows) {
    throw 'El instalador de escritorio esta disponible solo en Windows.'
}

$root = Resolve-InventorAppRoot -ScriptDirectory $PSScriptRoot
$config = Get-InventorDesktopConfig -Root $root
$vbsPath = Join-Path $PSScriptRoot 'start-app.vbs'
$vitePath = Join-Path $root 'node_modules\vite\bin\vite.js'
if (-not (Test-Path -LiteralPath $vbsPath -PathType Leaf)) {
    throw 'Falta el puente silencioso start-app.vbs.'
}
if (-not (Test-Path -LiteralPath $vitePath -PathType Leaf)) {
    throw 'Faltan dependencias. Ejecuta npm ci antes de instalar el acceso directo.'
}
if (-not (Get-InventorDockerCli) -or -not (Get-InventorDockerDesktop)) {
    throw 'Docker Desktop no esta instalado o no se puede localizar.'
}

$browser = Get-InventorBrowser
$icon = if ($browser) { "$browser,0" } else { "$env:SystemRoot\System32\shell32.dll,13" }
$shell = New-Object -ComObject WScript.Shell
$wscript = Join-Path $env:SystemRoot 'System32\wscript.exe'
$quotedVbs = '"' + $vbsPath + '"'

foreach ($shortcutPath in Get-InventorShortcutPaths -Config $config) {
    [System.IO.Directory]::CreateDirectory((Split-Path -Parent $shortcutPath)) | Out-Null
    $shortcut = $shell.CreateShortcut($shortcutPath)
    $shortcut.TargetPath = $wscript
    $shortcut.Arguments = $quotedVbs
    $shortcut.WorkingDirectory = $root
    $shortcut.IconLocation = $icon
    $shortcut.Description = "Abrir $($config.Name) con sus servicios locales"
    $shortcut.Save()
}

Write-InventorDesktopLog -Config $config -Message 'Accesos directos instalados en Escritorio y menu Inicio.'
Write-Output "LISTO: $($config.Name) quedo instalada como app de escritorio."
Write-Output 'El acceso directo inicia Docker, Supabase local y Vite antes de abrir la ventana.'
Write-Output 'Para detener sus servicios: npm run desktop:stop'
