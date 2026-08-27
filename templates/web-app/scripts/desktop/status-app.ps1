#Requires -Version 7.0

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'desktop-common.ps1')

$root = Resolve-InventorAppRoot -ScriptDirectory $PSScriptRoot
$config = Get-InventorDesktopConfig -Root $root
$docker = Get-InventorDockerCli
$npx = Find-InventorExecutable -Names @('npx.cmd', 'npx') -Candidates @(
    (Join-Path $env:ProgramFiles 'nodejs\npx.cmd')
)

$dockerReady = $false
if ($docker -and (Test-InventorDockerEndpointLocal -DockerCli $docker -WorkingDirectory $root)) {
    $dockerReady = Test-InventorDockerEngine -DockerCli $docker -WorkingDirectory $root
}
$supabaseReady = $false
if ($npx -and $dockerReady) {
    $status = Invoke-InventorProcess -FilePath $npx `
        -Arguments @('--no-install', 'supabase', 'status', '-o', 'json', '--workdir', $root, '--log-level', 'error') `
        -WorkingDirectory $root -TimeoutMilliseconds 30000
    if ($status.ExitCode -eq 0) {
        try {
            [void](ConvertFrom-InventorSupabaseStatus -Json $status.StdOut)
            $supabaseReady = $true
        }
        catch { }
    }
}
$viteReady = Test-InventorWebApp -Config $config

[pscustomobject]@{
    Aplicacion = $config.Name
    Docker     = if ($dockerReady) { 'listo' } else { 'detenido' }
    Supabase   = if ($supabaseReady) { 'listo' } else { 'detenido' }
    Vite       = if ($viteReady) { 'listo' } else { 'detenido' }
    URL        = $config.Url
} | Format-List

if (-not ($dockerReady -and $supabaseReady -and $viteReady)) {
    exit 1
}
