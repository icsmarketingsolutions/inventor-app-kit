#Requires -Version 7.0

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'command-center-common.ps1')

if (-not $IsWindows) { throw 'El instalador de escritorio esta disponible solo en Windows.' }
$config = Get-CommandCenterConfig
$node = Find-InventorExecutable -Names @('node.exe', 'node')
if (-not $node) { throw 'Node.js 24 no esta disponible.' }
$tsc = Join-Path $config.Root 'node_modules\typescript\bin\tsc'
$vite = Join-Path $config.Root 'node_modules\vite\bin\vite.js'
if (-not (Test-Path -LiteralPath $tsc) -or -not (Test-Path -LiteralPath $vite)) {
    throw 'Faltan dependencias. Ejecuta npm ci en apps/command-center.'
}
$typecheck = Invoke-InventorProcess -FilePath $node -Arguments @($tsc, '-b') -WorkingDirectory $config.Root
if ($typecheck.ExitCode -ne 0) { throw "TypeScript fallo: $($typecheck.StdErr.Trim())" }
$build = Invoke-InventorProcess -FilePath $node -Arguments @($vite, 'build') -WorkingDirectory $config.Root
if ($build.ExitCode -ne 0) { throw "Vite fallo: $($build.StdErr.Trim())" }

$vbsPath = Join-Path $PSScriptRoot 'start-app.vbs'
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
    $shortcut.WorkingDirectory = $config.Root
    $shortcut.IconLocation = $icon
    $shortcut.Description = 'Abrir el centro local de memoria y agentes'
    $shortcut.Save()
}
Write-Output 'LISTO: accesos directos instalados. No requieren Docker ni Supabase.'
