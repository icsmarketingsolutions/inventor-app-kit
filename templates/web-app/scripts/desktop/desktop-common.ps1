#Requires -Version 7.0

Set-StrictMode -Version Latest

function Resolve-InventorAppRoot {
    param([Parameter(Mandatory = $true)][string]$ScriptDirectory)

    $root = [System.IO.Path]::GetFullPath((Join-Path $ScriptDirectory '..\..'))
    if (-not [System.IO.File]::Exists((Join-Path $root 'src\project.generated.json'))) {
        throw 'No se encontro src/project.generated.json desde el lanzador.'
    }
    return $root
}

function Get-InventorDesktopConfig {
    param([Parameter(Mandatory = $true)][string]$Root)

    $projectPath = Join-Path $Root 'src\project.generated.json'
    $project = Get-Content -Raw -LiteralPath $projectPath | ConvertFrom-Json
    $name = [string]$project.name
    $slug = [string]$project.slug
    if ([string]::IsNullOrWhiteSpace($name)) {
        throw 'El proyecto no tiene un nombre valido.'
    }
    if ($slug -notmatch '^[a-z0-9]+(?:-[a-z0-9]+)*$' -or $slug.Length -gt 50) {
        throw 'El proyecto no tiene un slug seguro.'
    }
    return [pscustomobject]@{
        Name       = $name
        Slug       = $slug
        Root       = [System.IO.Path]::GetFullPath($Root)
        Port       = 5173
        Url        = 'http://127.0.0.1:5173'
        RuntimeDir = Join-Path $Root '.desktop'
    }
}

function ConvertTo-InventorUtcDate {
    param([Parameter(Mandatory = $true)]$Value)

    if ($Value -is [DateTime]) {
        return $Value.ToUniversalTime()
    }
    return [DateTime]::Parse(
        [string]$Value,
        [System.Globalization.CultureInfo]::InvariantCulture,
        [System.Globalization.DateTimeStyles]::RoundtripKind
    ).ToUniversalTime()
}

function Get-InventorShortcutName {
    param([Parameter(Mandatory = $true)]$Config)

    $safeName = ([string]$Config.Name -replace '[<>:"/\\|?*\x00-\x1F]', '-').Trim(' ', '.')
    if ([string]::IsNullOrWhiteSpace($safeName)) {
        $safeName = 'Inventor App'
    }
    if ($safeName.Length -gt 80) {
        $safeName = $safeName.Substring(0, 80).TrimEnd(' ', '.')
    }
    return "$safeName ($($Config.Slug)).lnk"
}

function Get-InventorWindowTitle {
    param([Parameter(Mandatory = $true)]$Config)

    return "$($Config.Name) · $($Config.Slug)"
}

function Get-InventorAppWindow {
    param([Parameter(Mandatory = $true)][string]$WindowTitle)

    if (-not ('InventorDesktop.Win32' -as [type])) {
        Add-Type -Namespace InventorDesktop -Name Win32 -MemberDefinition @'
public delegate bool EnumProc(System.IntPtr h, System.IntPtr p);
[DllImport("user32.dll")] public static extern bool ShowWindow(System.IntPtr h, int cmd);
[DllImport("user32.dll")] public static extern bool IsWindowVisible(System.IntPtr h);
[DllImport("user32.dll")] public static extern bool SetForegroundWindow(System.IntPtr h);
[DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc cb, System.IntPtr p);
[DllImport("user32.dll")] public static extern bool PostMessage(System.IntPtr h, uint m, System.IntPtr w, System.IntPtr l);
[DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowTextW(System.IntPtr h, System.Text.StringBuilder s, int n);
'@
    }

    $script:inventorDesktopWindow = [IntPtr]::Zero
    $script:inventorDesktopTitle = $WindowTitle
    $callback = [InventorDesktop.Win32+EnumProc] {
        param($handle, $parameter)
        if ([InventorDesktop.Win32]::IsWindowVisible($handle)) {
            $builder = [System.Text.StringBuilder]::new(512)
            [void][InventorDesktop.Win32]::GetWindowTextW($handle, $builder, 512)
            if ($builder.ToString().Equals($script:inventorDesktopTitle, [System.StringComparison]::OrdinalIgnoreCase)) {
                $script:inventorDesktopWindow = $handle
                return $false
            }
        }
        return $true
    }
    [void][InventorDesktop.Win32]::EnumWindows($callback, [IntPtr]::Zero)
    return $script:inventorDesktopWindow
}

function Close-InventorAppWindow {
    param([Parameter(Mandatory = $true)]$Config)

    $title = Get-InventorWindowTitle -Config $Config
    $window = Get-InventorAppWindow -WindowTitle $title
    if ($window -eq [IntPtr]::Zero) { return 'absent' }
    [void][InventorDesktop.Win32]::PostMessage($window, 0x0010, [IntPtr]::Zero, [IntPtr]::Zero)
    $deadline = [DateTime]::UtcNow.AddSeconds(5)
    do {
        Start-Sleep -Milliseconds 100
        $remaining = Get-InventorAppWindow -WindowTitle $title
    } while ($remaining -ne [IntPtr]::Zero -and [DateTime]::UtcNow -lt $deadline)
    if ($remaining -eq [IntPtr]::Zero) { return 'closed' }
    return 'failed'
}

function Get-InventorShortcutPaths {
    param([Parameter(Mandatory = $true)]$Config)

    $shortcutName = Get-InventorShortcutName -Config $Config
    return @(
        (Join-Path ([Environment]::GetFolderPath('Desktop')) $shortcutName),
        (Join-Path ([Environment]::GetFolderPath('Programs')) $shortcutName)
    )
}

function Write-InventorDesktopLog {
    param(
        [Parameter(Mandatory = $true)]$Config,
        [Parameter(Mandatory = $true)][string]$Message
    )

    [System.IO.Directory]::CreateDirectory($Config.RuntimeDir) | Out-Null
    $clean = $Message.Replace("`r", ' ').Replace("`n", ' ')
    "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')  $clean" |
        Out-File -LiteralPath (Join-Path $Config.RuntimeDir 'desktop.log') -Append -Encoding utf8
}

function Show-InventorDesktopError {
    param(
        [Parameter(Mandatory = $true)][string]$Title,
        [Parameter(Mandatory = $true)][string]$Message
    )

    if ($IsWindows) {
        (New-Object -ComObject WScript.Shell).Popup($Message, 45, $Title, 48) | Out-Null
    }
    else {
        Write-Error $Message
    }
}

function Find-InventorExecutable {
    param(
        [Parameter(Mandatory = $true)][string[]]$Names,
        [string[]]$Candidates = @()
    )

    foreach ($name in $Names) {
        $command = Get-Command $name -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($command -and -not [string]::IsNullOrWhiteSpace($command.Source)) {
            return $command.Source
        }
    }
    foreach ($candidate in $Candidates) {
        if (-not [string]::IsNullOrWhiteSpace($candidate) -and (Test-Path -LiteralPath $candidate -PathType Leaf)) {
            return [System.IO.Path]::GetFullPath($candidate)
        }
    }
    return $null
}

function Invoke-InventorProcess {
    param(
        [Parameter(Mandatory = $true)][string]$FilePath,
        [string[]]$Arguments = @(),
        [Parameter(Mandatory = $true)][string]$WorkingDirectory,
        [ValidateRange(1000, 600000)][int]$TimeoutMilliseconds = 30000,
        [AllowNull()][string]$StandardInput
    )

    $startInfo = [System.Diagnostics.ProcessStartInfo]::new()
    $startInfo.FileName = $FilePath
    $startInfo.WorkingDirectory = $WorkingDirectory
    $startInfo.UseShellExecute = $false
    $startInfo.CreateNoWindow = $true
    $startInfo.RedirectStandardOutput = $true
    $startInfo.RedirectStandardError = $true
    $hasInput = $PSBoundParameters.ContainsKey('StandardInput')
    $startInfo.RedirectStandardInput = $hasInput
    foreach ($argument in $Arguments) {
        $startInfo.ArgumentList.Add($argument)
    }

    $process = [System.Diagnostics.Process]::new()
    $process.StartInfo = $startInfo
    if (-not $process.Start()) {
        throw "No se pudo iniciar el proceso requerido."
    }
    $stdoutTask = $process.StandardOutput.ReadToEndAsync()
    $stderrTask = $process.StandardError.ReadToEndAsync()
    if ($hasInput) {
        $process.StandardInput.Write($StandardInput)
        $process.StandardInput.Close()
    }

    $completed = $process.WaitForExit($TimeoutMilliseconds)
    if (-not $completed) {
        try { $process.Kill($true) } catch { }
        $process.WaitForExit()
    }
    $stdout = $stdoutTask.GetAwaiter().GetResult()
    $stderr = $stderrTask.GetAwaiter().GetResult()
    $exitCode = if ($completed) { $process.ExitCode } else { -1 }
    $process.Dispose()

    return [pscustomobject]@{
        ExitCode = $exitCode
        StdOut   = $stdout
        StdErr   = $stderr
        TimedOut = -not $completed
    }
}

function ConvertTo-InventorSafeSupabaseLog {
    param(
        [Parameter(Mandatory = $true)]$Config,
        [AllowEmptyString()][string]$Text
    )

    if ([string]::IsNullOrWhiteSpace($Text)) {
        return ''
    }
    $node = Find-InventorExecutable -Names @('node.exe', 'node')
    $redactor = Join-Path $Config.Root 'scripts\redact-supabase-output.mjs'
    if (-not $node -or -not (Test-Path -LiteralPath $redactor -PathType Leaf)) {
        return '[salida de Supabase omitida por seguridad]'
    }
    $result = Invoke-InventorProcess -FilePath $node -Arguments @($redactor) `
        -WorkingDirectory $Config.Root -TimeoutMilliseconds 15000 -StandardInput $Text
    if ($result.ExitCode -ne 0) {
        return '[salida de Supabase omitida por seguridad]'
    }
    return $result.StdOut.Trim()
}

function ConvertFrom-InventorSupabaseStatus {
    param([Parameter(Mandatory = $true)][string]$Json)

    try {
        $data = $Json | ConvertFrom-Json -AsHashtable
    }
    catch {
        throw 'Supabase no devolvio un estado JSON valido.'
    }
    $apiUrl = [string]$data['API_URL']
    $publishableKey = if ($data.ContainsKey('PUBLISHABLE_KEY')) {
        [string]$data['PUBLISHABLE_KEY']
    }
    elseif ($data.ContainsKey('ANON_KEY')) {
        [string]$data['ANON_KEY']
    }
    else {
        ''
    }

    $parsedUrl = $null
    if (-not [System.Uri]::TryCreate($apiUrl, [System.UriKind]::Absolute, [ref]$parsedUrl)) {
        throw 'Supabase local no devolvio una URL valida.'
    }
    $localHosts = @('127.0.0.1', 'localhost', '::1')
    if ($parsedUrl.Scheme -ne 'http' -or $parsedUrl.Host -notin $localHosts) {
        throw 'El lanzador solo acepta el Supabase HTTP local de esta computadora.'
    }
    if ([string]::IsNullOrWhiteSpace($publishableKey) -or
        $publishableKey.Length -lt 20 -or $publishableKey.Length -gt 4096 -or
        $publishableKey -match '\s') {
        throw 'Supabase local no devolvio una llave publicable valida.'
    }
    return [pscustomobject]@{
        ApiUrl         = $apiUrl
        PublishableKey = $publishableKey
    }
}

function Get-InventorDockerCli {
    $candidates = @(
        (Join-Path $env:LOCALAPPDATA 'Programs\DockerDesktop\resources\bin\docker.exe'),
        (Join-Path $env:ProgramFiles 'Docker\Docker\resources\bin\docker.exe')
    )
    return Find-InventorExecutable -Names @('docker.exe', 'docker') -Candidates $candidates
}

function Get-InventorDockerDesktop {
    $candidates = @(
        (Join-Path $env:LOCALAPPDATA 'Programs\DockerDesktop\Docker Desktop.exe'),
        (Join-Path $env:LOCALAPPDATA 'Programs\DockerDesktop\frontend\Docker Desktop.exe'),
        (Join-Path $env:ProgramFiles 'Docker\Docker\Docker Desktop.exe')
    )
    return Find-InventorExecutable -Names @('Docker Desktop.exe') -Candidates $candidates
}

function Test-InventorDockerEngine {
    param(
        [Parameter(Mandatory = $true)][string]$DockerCli,
        [Parameter(Mandatory = $true)][string]$WorkingDirectory
    )

    $result = Invoke-InventorProcess -FilePath $DockerCli -Arguments @('info', '--format', '{{.ServerVersion}}') `
        -WorkingDirectory $WorkingDirectory -TimeoutMilliseconds 8000
    return $result.ExitCode -eq 0 -and -not [string]::IsNullOrWhiteSpace($result.StdOut)
}

function Test-InventorDockerEndpointValue {
    param([Parameter(Mandatory = $true)][string]$Endpoint)

    return $Endpoint -in @(
        'npipe:////./pipe/dockerDesktopLinuxEngine',
        'npipe:////./pipe/docker_engine'
    )
}

function Test-InventorDockerEndpointLocal {
    param(
        [Parameter(Mandatory = $true)][string]$DockerCli,
        [Parameter(Mandatory = $true)][string]$WorkingDirectory
    )

    if (-not [string]::IsNullOrWhiteSpace($env:DOCKER_HOST)) {
        return $false
    }
    $result = Invoke-InventorProcess -FilePath $DockerCli `
        -Arguments @('context', 'inspect', '--format', '{{json .Endpoints.docker.Host}}') `
        -WorkingDirectory $WorkingDirectory -TimeoutMilliseconds 8000
    if ($result.ExitCode -ne 0) { return $false }
    try {
        $endpoint = [string]($result.StdOut | ConvertFrom-Json)
        return Test-InventorDockerEndpointValue -Endpoint $endpoint
    }
    catch {
        return $false
    }
}

function Test-InventorWebApp {
    param([Parameter(Mandatory = $true)]$Config)

    try {
        $response = Invoke-WebRequest -Uri $Config.Url -TimeoutSec 3 -UseBasicParsing
        $marker = 'name="inventor-app-id" content="' + $Config.Slug + '"'
        return [int]$response.StatusCode -eq 200 -and ([string]$response.Content).Contains($marker)
    }
    catch {
        return $false
    }
}

function Test-InventorTcpPort {
    param([Parameter(Mandatory = $true)][int]$Port)

    $client = [System.Net.Sockets.TcpClient]::new()
    try {
        $pending = $client.BeginConnect('127.0.0.1', $Port, $null, $null)
        return $pending.AsyncWaitHandle.WaitOne(300) -and $client.Connected
    }
    catch {
        return $false
    }
    finally {
        $client.Dispose()
    }
}

function Get-InventorBrowser {
    $candidates = @(
        (Join-Path $env:ProgramFiles 'Google\Chrome\Application\chrome.exe'),
        (Join-Path ${env:ProgramFiles(x86)} 'Google\Chrome\Application\chrome.exe'),
        (Join-Path $env:LOCALAPPDATA 'Google\Chrome\Application\chrome.exe'),
        (Join-Path $env:ProgramFiles 'Microsoft\Edge\Application\msedge.exe'),
        (Join-Path ${env:ProgramFiles(x86)} 'Microsoft\Edge\Application\msedge.exe')
    )
    return Find-InventorExecutable -Names @('chrome.exe', 'msedge.exe') -Candidates $candidates
}
