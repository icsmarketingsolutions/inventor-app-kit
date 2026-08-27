#Requires -Version 7.0

param(
    [switch]$NoOpen,
    [ValidateRange(30, 300)][int]$StartupTimeoutSeconds = 180
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'desktop-common.ps1')

function Open-InventorAppWindow {
    param([Parameter(Mandatory = $true)]$Config)

    $existing = Get-InventorAppWindow -WindowTitle (Get-InventorWindowTitle -Config $Config)
    if ($existing -ne [IntPtr]::Zero) {
        [void][InventorDesktop.Win32]::ShowWindow($existing, 9)
        [void][InventorDesktop.Win32]::SetForegroundWindow($existing)
        Write-InventorDesktopLog -Config $Config -Message 'Ventana existente enfocada.'
        return
    }

    $browser = Get-InventorBrowser
    if ($browser) {
        $profileDir = Join-Path $Config.RuntimeDir 'browser-profile'
        [System.IO.Directory]::CreateDirectory($profileDir) | Out-Null
        $profileArgument = '--user-data-dir="' + $profileDir + '"'
        Start-Process -FilePath $browser `
            -ArgumentList $profileArgument, "--app=$($Config.Url)", '--new-window', '--no-first-run', '--disable-background-mode' | Out-Null
        Write-InventorDesktopLog -Config $Config -Message 'Ventana de aplicacion abierta con navegador Chromium.'
    }
    else {
        Start-Process $Config.Url | Out-Null
        Write-InventorDesktopLog -Config $Config -Message 'Chrome/Edge no encontrado; se uso el navegador predeterminado.'
    }
}

$root = Resolve-InventorAppRoot -ScriptDirectory $PSScriptRoot
$config = Get-InventorDesktopConfig -Root $root
[System.IO.Directory]::CreateDirectory($config.RuntimeDir) | Out-Null
$mutex = [System.Threading.Mutex]::new($false, 'Local\InventorApp-DesktopServices')
$ownsMutex = $false
$npx = $null
$supabaseStartedHere = $false
$viteProcess = $null
$runtimeWrittenHere = $false

try {
    $ownsMutex = $mutex.WaitOne(5000)
    if (-not $ownsMutex) {
        throw 'Otra instancia del lanzador sigue preparando la aplicacion. Espera unos segundos y volve a abrirla.'
    }
    Write-InventorDesktopLog -Config $config -Message 'Inicio solicitado.'

    $node = Find-InventorExecutable -Names @('node.exe', 'node')
    $npx = Find-InventorExecutable -Names @('npx.cmd', 'npx') -Candidates @(
        (Join-Path $env:ProgramFiles 'nodejs\npx.cmd')
    )
    $vite = Join-Path $root 'node_modules\vite\bin\vite.js'
    if (-not $node -or -not $npx) {
        throw 'Falta Node.js o npx. Ejecuta primero el instalador de la computadora.'
    }
    if (-not (Test-Path -LiteralPath $vite -PathType Leaf)) {
        throw 'Faltan las dependencias. Abri PowerShell en la app, ejecuta npm ci y despues npm run desktop:install.'
    }

    $docker = Get-InventorDockerCli
    if (-not $docker) {
        throw 'No se encontro Docker CLI. Instala o repara Docker Desktop antes de abrir la app.'
    }
    if (-not (Test-InventorDockerEndpointLocal -DockerCli $docker -WorkingDirectory $root)) {
        throw 'El contexto Docker actual no es el motor local de Docker Desktop. Cambialo antes de abrir la app.'
    }
    if (-not (Test-InventorDockerEngine -DockerCli $docker -WorkingDirectory $root)) {
        $dockerDesktop = Get-InventorDockerDesktop
        if (-not $dockerDesktop) {
            throw 'Docker Desktop no esta disponible en esta computadora.'
        }
        Write-InventorDesktopLog -Config $config -Message 'Docker no respondia; iniciando Docker Desktop.'
        Start-Process -FilePath $dockerDesktop -WindowStyle Hidden | Out-Null
        $deadline = [DateTime]::UtcNow.AddSeconds($StartupTimeoutSeconds)
        do {
            Start-Sleep -Seconds 2
            $dockerReady = Test-InventorDockerEngine -DockerCli $docker -WorkingDirectory $root
        } while (-not $dockerReady -and [DateTime]::UtcNow -lt $deadline)
        if (-not $dockerReady) {
            throw "Docker Desktop no quedo listo en $StartupTimeoutSeconds segundos."
        }
    }
    Write-InventorDesktopLog -Config $config -Message 'Docker listo.'

    $statusArguments = @('--no-install', 'supabase', 'status', '-o', 'json', '--workdir', $root, '--log-level', 'error')
    $status = Invoke-InventorProcess -FilePath $npx -Arguments $statusArguments `
        -WorkingDirectory $root -TimeoutMilliseconds 30000
    if ($status.ExitCode -ne 0) {
        Write-InventorDesktopLog -Config $config -Message 'Supabase local estaba detenido; iniciando stack.'
        $start = Invoke-InventorProcess -FilePath $npx `
            -Arguments @('--no-install', 'supabase', 'start', '--workdir', $root, '--yes') `
            -WorkingDirectory $root -TimeoutMilliseconds 300000
        if ($start.ExitCode -ne 0) {
            $safeOutput = ConvertTo-InventorSafeSupabaseLog -Config $config -Text ($start.StdOut + "`n" + $start.StdErr)
            if ($safeOutput) { Write-InventorDesktopLog -Config $config -Message $safeOutput }
            throw 'Supabase local no pudo arrancar. Revisa .desktop/desktop.log.'
        }
        $supabaseStartedHere = $true
        $status = Invoke-InventorProcess -FilePath $npx -Arguments $statusArguments `
            -WorkingDirectory $root -TimeoutMilliseconds 30000
    }
    if ($status.ExitCode -ne 0) {
        throw 'Supabase local arranco, pero no devolvio un estado saludable.'
    }
    $supabase = ConvertFrom-InventorSupabaseStatus -Json $status.StdOut
    $migrationUp = Invoke-InventorProcess -FilePath $npx `
        -Arguments @('--no-install', 'supabase', 'migration', 'up', '--local', '--workdir', $root, '--yes') `
        -WorkingDirectory $root -TimeoutMilliseconds 120000
    if ($migrationUp.ExitCode -ne 0) {
        $safeOutput = ConvertTo-InventorSafeSupabaseLog -Config $config `
            -Text ($migrationUp.StdOut + "`n" + $migrationUp.StdErr)
        if ($safeOutput) { Write-InventorDesktopLog -Config $config -Message $safeOutput }
        throw 'Supabase local no pudo aplicar las migraciones pendientes. Revisa .desktop/desktop.log.'
    }
    Write-InventorDesktopLog -Config $config -Message 'Migraciones locales al dia.'
    Write-InventorDesktopLog -Config $config -Message 'Supabase local listo; credenciales publicables conservadas solo en memoria.'

    if (-not (Test-InventorWebApp -Config $config)) {
        if (Test-InventorTcpPort -Port $config.Port) {
            throw "El puerto $($config.Port) pertenece a otra aplicacion. Cerrala antes de abrir esta app."
        }

        $viteOut = Join-Path $config.RuntimeDir 'vite.out.log'
        $viteErr = Join-Path $config.RuntimeDir 'vite.err.log'
        $previousUrl = $env:VITE_SUPABASE_URL
        $previousKey = $env:VITE_SUPABASE_PUBLISHABLE_KEY
        try {
            $env:VITE_SUPABASE_URL = $supabase.ApiUrl
            $env:VITE_SUPABASE_PUBLISHABLE_KEY = $supabase.PublishableKey
            # Start-Process vuelve a unir ArgumentList en una cadena. La ruta
            # controlada de Vite necesita comillas explícitas si el repo vive
            # bajo una carpeta como "Nombre con espacios".
            $quotedVite = '"' + $vite + '"'
            $viteProcess = Start-Process -FilePath $node `
                -ArgumentList @($quotedVite, '--host', '127.0.0.1', '--port', [string]$config.Port, '--strictPort') `
                -WorkingDirectory $root -WindowStyle Hidden `
                -RedirectStandardOutput $viteOut -RedirectStandardError $viteErr -PassThru
        }
        finally {
            $env:VITE_SUPABASE_URL = $previousUrl
            $env:VITE_SUPABASE_PUBLISHABLE_KEY = $previousKey
        }

        $runtimeState = [ordered]@{
            schemaVersion = 1
            vitePid       = $viteProcess.Id
            startedAtUtc  = $viteProcess.StartTime.ToUniversalTime().ToString('O')
        }
        [System.IO.File]::WriteAllText(
            (Join-Path $config.RuntimeDir 'runtime.json'),
            (($runtimeState | ConvertTo-Json -Depth 3) + "`n"),
            [System.Text.UTF8Encoding]::new($false)
        )
        $runtimeWrittenHere = $true

        $deadline = [DateTime]::UtcNow.AddSeconds(60)
        do {
            Start-Sleep -Milliseconds 500
            $viteProcess.Refresh()
            if ($viteProcess.HasExited) {
                throw 'Vite termino antes de responder. Revisa .desktop/vite.err.log.'
            }
            $webReady = Test-InventorWebApp -Config $config
        } while (-not $webReady -and [DateTime]::UtcNow -lt $deadline)
        if (-not $webReady) {
            throw 'Vite no respondio en 60 segundos. Revisa .desktop/vite.err.log.'
        }
        Write-InventorDesktopLog -Config $config -Message 'Vite listo.'
    }
    else {
        Write-InventorDesktopLog -Config $config -Message 'Vite ya estaba listo; no se creo un duplicado.'
    }

    if (-not $NoOpen) {
        Open-InventorAppWindow -Config $config
        Start-Sleep -Seconds 2
        if (-not (Test-InventorWebApp -Config $config)) {
            throw 'La ventana se abrio, pero Vite dejo de responder. Revisa .desktop/vite.err.log.'
        }
    }
}
catch {
    $message = $_.Exception.Message
    $cleanupFailures = [System.Collections.Generic.List[string]]::new()
    if ($viteProcess) {
        try {
            $viteProcess.Refresh()
            if (-not $viteProcess.HasExited) {
                $viteProcess.Kill($true)
                if (-not $viteProcess.WaitForExit(10000)) {
                    throw 'Vite no termino durante la reversion.'
                }
                Write-InventorDesktopLog -Config $config -Message 'Reversion: Vite iniciado por esta llamada fue detenido.'
            }
            if ($runtimeWrittenHere) {
                $runtimePath = Join-Path $config.RuntimeDir 'runtime.json'
                if (Test-Path -LiteralPath $runtimePath -PathType Leaf) {
                    $savedRuntime = Get-Content -Raw -LiteralPath $runtimePath | ConvertFrom-Json
                    if ([int]$savedRuntime.vitePid -eq $viteProcess.Id) {
                        Remove-Item -LiteralPath $runtimePath -Force
                    }
                }
            }
        }
        catch {
            [void]$cleanupFailures.Add('Vite')
            Write-InventorDesktopLog -Config $config -Message 'ERROR de reversion: Vite no pudo detenerse por completo.'
        }
    }
    if ($supabaseStartedHere -and $npx) {
        try {
            if (-not $docker -or
                -not (Test-InventorDockerEndpointLocal -DockerCli $docker -WorkingDirectory $root)) {
                throw 'El contexto Docker dejo de ser local; no se ejecuto el apagado de reversion.'
            }
            $rollback = Invoke-InventorProcess -FilePath $npx `
                -Arguments @('--no-install', 'supabase', 'stop', '--workdir', $root, '--yes') `
                -WorkingDirectory $root -TimeoutMilliseconds 120000
            if ($rollback.ExitCode -ne 0) {
                throw 'Supabase no respondio al apagado de reversion.'
            }
            Write-InventorDesktopLog -Config $config -Message 'Reversion: Supabase iniciado por esta llamada fue detenido; datos conservados.'
        }
        catch {
            [void]$cleanupFailures.Add('Supabase')
            Write-InventorDesktopLog -Config $config -Message 'ERROR de reversion: Supabase no pudo detenerse por completo.'
        }
    }
    if ($cleanupFailures.Count -gt 0) {
        $message += " Reversion incompleta: $($cleanupFailures -join ', ')."
    }
    Write-InventorDesktopLog -Config $config -Message "ERROR: $message"
    Show-InventorDesktopError -Title $config.Name -Message "$message`n`nDiagnostico: .desktop\desktop.log"
    exit 1
}
finally {
    if ($ownsMutex) { $mutex.ReleaseMutex() }
    $mutex.Dispose()
}
