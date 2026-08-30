Set-StrictMode -Version Latest

function Install-InventorVoiceRuntime {
    param(
        [Parameter(Mandatory = $true)][string]$VoiceRoot,
        [Parameter(Mandatory = $true)][string]$StageRoot,
        [Parameter(Mandatory = $true)][string[]]$InstallNames,
        [Parameter(Mandatory = $true)][scriptblock]$VerifyInstalled,
        [scriptblock]$AfterBackupStep
    )

    $backupRoot = Join-Path $VoiceRoot ".backup-$([Guid]::NewGuid().ToString('N'))"
    [System.IO.Directory]::CreateDirectory($backupRoot) | Out-Null
    $backedUpNames = [System.Collections.Generic.List[string]]::new()
    $installedNames = [System.Collections.Generic.List[string]]::new()
    $commitSucceeded = $false
    $rollbackSucceeded = $false
    try {
        foreach ($name in $InstallNames) {
            $current = Join-Path $VoiceRoot $name
            if (Test-Path -LiteralPath $current) {
                Move-Item -LiteralPath $current -Destination (Join-Path $backupRoot $name)
                $backedUpNames.Add($name)
                if ($AfterBackupStep) { & $AfterBackupStep $name $backedUpNames.Count }
            }
        }
        foreach ($name in $InstallNames) {
            $staged = Join-Path $StageRoot $name
            if (-not (Test-Path -LiteralPath $staged)) {
                throw "Falta un elemento del staging: $name"
            }
            Move-Item -LiteralPath $staged -Destination (Join-Path $VoiceRoot $name)
            $installedNames.Add($name)
        }
        & $VerifyInstalled
        $commitSucceeded = $true
    }
    catch {
        $installError = $_
        try {
            foreach ($name in $installedNames) {
                $current = Join-Path $VoiceRoot $name
                if (Test-Path -LiteralPath $current) {
                    Remove-Item -LiteralPath $current -Recurse -Force
                }
            }
            foreach ($name in $backedUpNames) {
                $backup = Join-Path $backupRoot $name
                $current = Join-Path $VoiceRoot $name
                if (-not (Test-Path -LiteralPath $backup)) {
                    throw "Falta un elemento del respaldo: $name"
                }
                Move-Item -LiteralPath $backup -Destination $current
            }
            $allRestored = $true
            foreach ($name in $backedUpNames) {
                if (-not (Test-Path -LiteralPath (Join-Path $VoiceRoot $name))) {
                    $allRestored = $false
                }
            }
            $rollbackSucceeded = $allRestored -and
                -not (Get-ChildItem -LiteralPath $backupRoot -Force | Select-Object -First 1)
        }
        catch {
            $rollbackSucceeded = $false
        }
        if (-not $rollbackSucceeded) {
            throw 'Falló la instalación y el respaldo anterior se conservó para recuperación manual.'
        }
        throw $installError
    }
    finally {
        if (Test-Path -LiteralPath $StageRoot) {
            Remove-Item -LiteralPath $StageRoot -Recurse -Force
        }
        if (($commitSucceeded -or $rollbackSucceeded) -and (Test-Path -LiteralPath $backupRoot)) {
            Remove-Item -LiteralPath $backupRoot -Recurse -Force
        }
    }
}
