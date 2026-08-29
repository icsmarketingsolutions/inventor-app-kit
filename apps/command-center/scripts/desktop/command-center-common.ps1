#Requires -Version 7.0

Set-StrictMode -Version Latest

$script:CommandCenterRepoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\..\..'))
. (Join-Path $script:CommandCenterRepoRoot 'templates\web-app\scripts\desktop\desktop-common.ps1')

function Get-CommandCenterConfig {
    $root = Join-Path $script:CommandCenterRepoRoot 'apps\command-center'
    $dataDir = if ([string]::IsNullOrWhiteSpace($env:INVENTOR_OS_HOME)) {
        Join-Path $env:LOCALAPPDATA 'InventorOS'
    }
    else {
        [System.IO.Path]::GetFullPath($env:INVENTOR_OS_HOME)
    }
    return [pscustomobject]@{
        Name       = 'INVENTOR O.S. Command Center'
        Slug       = 'inventor-os'
        Root       = [System.IO.Path]::GetFullPath($root)
        Port       = 8421
        Url        = 'http://127.0.0.1:8421'
        RuntimeDir = Join-Path $root '.runtime\desktop'
        DataDir    = $dataDir
        RepoRoot   = $script:CommandCenterRepoRoot
    }
}

function Test-CommandCenterHealth {
    param([Parameter(Mandatory = $true)]$Config)

    try {
        $response = Invoke-RestMethod -Uri "$($Config.Url)/api/health" -TimeoutSec 3
        return $response.ok -eq $true -and $response.product -eq 'inventor-os'
    }
    catch {
        return $false
    }
}

function Get-CommandCenterState {
    param([Parameter(Mandatory = $true)]$Config)

    $path = Join-Path $Config.RuntimeDir 'runtime.json'
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { return $null }
    try { return Get-Content -Raw -LiteralPath $path | ConvertFrom-Json }
    catch { return $null }
}

function Test-CommandCenterProcess {
    param(
        [Parameter(Mandatory = $true)]$State,
        [Parameter(Mandatory = $true)][string]$NodePath
    )

    try {
        $process = Get-Process -Id ([int]$State.pid) -ErrorAction Stop
        $expected = [System.IO.Path]::GetFullPath($NodePath)
        $actual = [System.IO.Path]::GetFullPath($process.Path)
        $started = ConvertTo-InventorUtcDate -Value $State.startedAt
        $delta = [Math]::Abs(($process.StartTime.ToUniversalTime() - $started).TotalSeconds)
        return $actual.Equals($expected, [System.StringComparison]::OrdinalIgnoreCase) -and $delta -lt 3
    }
    catch {
        return $false
    }
}

function Open-CommandCenterWindow {
    param([Parameter(Mandatory = $true)]$Config)

    $title = Get-InventorWindowTitle -Config $Config
    $existing = Get-InventorAppWindow -WindowTitle $title
    if ($existing -ne [IntPtr]::Zero) {
        [void][InventorDesktop.Win32]::ShowWindow($existing, 9)
        [void][InventorDesktop.Win32]::SetForegroundWindow($existing)
        return
    }

    $browser = Get-InventorBrowser
    if (-not $browser) { throw 'No se encontro Google Chrome ni Microsoft Edge.' }
    $profile = Join-Path $Config.RuntimeDir 'browser-profile'
    [System.IO.Directory]::CreateDirectory($profile) | Out-Null
    $startInfo = [System.Diagnostics.ProcessStartInfo]::new()
    $startInfo.FileName = $browser
    $startInfo.WorkingDirectory = $Config.Root
    $startInfo.UseShellExecute = $true
    foreach ($argument in @(
        "--app=$($Config.Url)",
        '--new-window',
        '--no-first-run',
        '--disable-background-mode',
        "--user-data-dir=$profile"
    )) { $startInfo.ArgumentList.Add($argument) }
    [void][System.Diagnostics.Process]::Start($startInfo)
}

function Get-CommandCenterMutex {
    return [System.Threading.Mutex]::new($false, 'Local\InventorOS-DesktopServices')
}
