#Requires -Version 7.0

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
. (Join-Path $PSScriptRoot 'voice-runtime-transaction.ps1')

if (-not $IsWindows) { throw 'La instalación automática de voz está disponible solo en Windows x64.' }
if (-not [Environment]::Is64BitOperatingSystem) { throw 'whisper.cpp requiere Windows x64 en este instalador.' }

$release = 'b4938'
$binaryUrl = "https://github.com/ggml-org/whisper.cpp/releases/download/$release/whisper-bin-x64.zip"
$binarySha256 = 'c2a4b60edb11f7e11a9191ffb50929535527d4d91c9903dbe3e554583bbbc63d'
$modelRevision = '5359861c739e955e79d9a303bcbc70fb988958b1'
$modelUrl = "https://huggingface.co/ggerganov/whisper.cpp/resolve/$modelRevision/ggml-base.bin"
$modelSha1 = '465707469ff3a37a2b9b8d8f89f2f99de7299dac'
$modelSha256 = '60ed5bc3dd14eea856493d334349b405782ddcaf0028d4b5df4088345fba2efe'
$defaultVoiceRoot = [System.IO.Path]::GetFullPath((Join-Path $env:LOCALAPPDATA 'InventorOS\voice'))
$voiceRoot = if ([string]::IsNullOrWhiteSpace($env:INVENTOR_OS_VOICE_HOME)) {
    $defaultVoiceRoot
}
else {
    [System.IO.Path]::GetFullPath($env:INVENTOR_OS_VOICE_HOME)
}
$volumeRoot = [System.IO.Path]::GetPathRoot($voiceRoot)
if ($voiceRoot.StartsWith('\\') -or $voiceRoot.TrimEnd('\') -eq $volumeRoot.TrimEnd('\')) {
    throw 'INVENTOR_OS_VOICE_HOME no puede ser la raíz de una unidad.'
}
$drive = [System.IO.DriveInfo]::new($volumeRoot)
if ($drive.DriveType -ne [System.IO.DriveType]::Fixed) {
    throw 'INVENTOR_OS_VOICE_HOME debe estar en una unidad local fija.'
}
$ancestor = $voiceRoot
while (-not [string]::IsNullOrWhiteSpace($ancestor)) {
    if (Test-Path -LiteralPath $ancestor) {
        $ancestorItem = Get-Item -LiteralPath $ancestor -Force
        if ($ancestorItem.Attributes -band [System.IO.FileAttributes]::ReparsePoint) {
            throw 'INVENTOR_OS_VOICE_HOME no puede atravesar enlaces o puntos de reanálisis.'
        }
    }
    if ($ancestor.TrimEnd('\') -eq $volumeRoot.TrimEnd('\')) { break }
    $ancestor = [System.IO.Directory]::GetParent($ancestor.TrimEnd('\'))?.FullName
}
$managedMarkerName = '.inventor-os-voice-runtime'
$managedMarkerValue = 'INVENTOR_OS_VOICE_RUNTIME_V1'
$managedMarker = Join-Path $voiceRoot $managedMarkerName
$isDefaultVoiceRoot = $voiceRoot.Equals($defaultVoiceRoot, [System.StringComparison]::OrdinalIgnoreCase)
if (Test-Path -LiteralPath $voiceRoot) {
    $voiceRootItem = Get-Item -LiteralPath $voiceRoot -Force
    if (-not $voiceRootItem.PSIsContainer -or ($voiceRootItem.Attributes -band [System.IO.FileAttributes]::ReparsePoint)) {
        throw 'La carpeta de voz debe ser un directorio local real.'
    }
    $existingItems = @(Get-ChildItem -LiteralPath $voiceRoot -Force)
    $hasManagedMarker = (Test-Path -LiteralPath $managedMarker -PathType Leaf) -and
        ((Get-Content -Raw -LiteralPath $managedMarker).Trim() -eq $managedMarkerValue)
    if (-not $isDefaultVoiceRoot -and $existingItems.Count -gt 0 -and -not $hasManagedMarker) {
        throw 'INVENTOR_OS_VOICE_HOME debe estar vacío o ser un runtime administrado por INVENTOR O.S.'
    }
}
$tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) "inventor-os-voice-$([Guid]::NewGuid().ToString('N'))"
$stageRoot = $null
$runtimeFiles = @(
    'ggml-base.dll',
    'ggml-cpu-alderlake.dll',
    'ggml-cpu-cannonlake.dll',
    'ggml-cpu-cascadelake.dll',
    'ggml-cpu-haswell.dll',
    'ggml-cpu-icelake.dll',
    'ggml-cpu-sandybridge.dll',
    'ggml-cpu-skylakex.dll',
    'ggml-cpu-sse42.dll',
    'ggml-cpu-x64.dll',
    'ggml.dll',
    'whisper-cli.exe',
    'whisper.dll'
)

function Assert-FileHash {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][ValidateSet('SHA1', 'SHA256')][string]$Algorithm,
        [Parameter(Mandatory = $true)][string]$Expected
    )
    $actual = (Get-FileHash -LiteralPath $Path -Algorithm $Algorithm).Hash.ToLowerInvariant()
    if ($actual -ne $Expected) { throw "La descarga de voz no pasó la verificación $Algorithm." }
}

try {
    [System.IO.Directory]::CreateDirectory($tempRoot) | Out-Null
    $zipPath = Join-Path $tempRoot 'whisper-bin-x64.zip'
    $extractRoot = Join-Path $tempRoot 'extract'
    $modelDownload = Join-Path $tempRoot 'ggml-base.bin'

    Write-Host 'Descargando whisper.cpp oficial…'
    Invoke-WebRequest -Uri $binaryUrl -OutFile $zipPath -UseBasicParsing
    Assert-FileHash -Path $zipPath -Algorithm SHA256 -Expected $binarySha256
    Expand-Archive -LiteralPath $zipPath -DestinationPath $extractRoot
    $whisperCli = Get-ChildItem -LiteralPath $extractRoot -Filter 'whisper-cli.exe' -File -Recurse | Select-Object -First 1
    if (-not $whisperCli) { throw 'El paquete oficial no contiene whisper-cli.exe.' }

    Write-Host 'Descargando modelo multilingüe base (aprox. 142 MiB)…'
    Invoke-WebRequest -Uri $modelUrl -OutFile $modelDownload -UseBasicParsing
    Assert-FileHash -Path $modelDownload -Algorithm SHA1 -Expected $modelSha1
    Assert-FileHash -Path $modelDownload -Algorithm SHA256 -Expected $modelSha256

    [System.IO.Directory]::CreateDirectory($voiceRoot) | Out-Null
    $binRoot = Join-Path $voiceRoot 'bin'
    $modelsRoot = Join-Path $voiceRoot 'models'
    $stageRoot = Join-Path $voiceRoot ".install-$([Guid]::NewGuid().ToString('N'))"
    $stageBin = Join-Path $stageRoot 'bin'
    $stageModels = Join-Path $stageRoot 'models'
    [System.IO.Directory]::CreateDirectory($stageBin) | Out-Null
    [System.IO.Directory]::CreateDirectory($stageModels) | Out-Null
    foreach ($fileName in $runtimeFiles) {
        $sourceFile = Join-Path $whisperCli.Directory.FullName $fileName
        if (-not (Test-Path -LiteralPath $sourceFile -PathType Leaf)) {
            throw "El paquete oficial no contiene el runtime requerido: $fileName"
        }
        Copy-Item -LiteralPath $sourceFile -Destination (Join-Path $stageBin $fileName)
    }
    Copy-Item -LiteralPath $modelDownload -Destination (Join-Path $stageModels 'ggml-base.bin')

    $installedCli = Join-Path $stageBin 'whisper-cli.exe'
    Assert-FileHash -Path (Join-Path $stageModels 'ggml-base.bin') -Algorithm SHA256 -Expected $modelSha256
    $manifest = [ordered]@{
        engine          = 'whisper.cpp'
        release         = $release
        binaryArchive   = $binaryUrl
        binarySha256    = $binarySha256
        executableSha256 = (Get-FileHash -LiteralPath $installedCli -Algorithm SHA256).Hash.ToLowerInvariant()
        model           = 'base'
        modelSource     = $modelUrl
        modelSha1       = $modelSha1
        modelSha256     = $modelSha256
        installedAt     = [DateTime]::UtcNow.ToString('o')
    }
    [System.IO.File]::WriteAllText(
        (Join-Path $stageRoot 'manifest.json'),
        ($manifest | ConvertTo-Json),
        [System.Text.UTF8Encoding]::new($false)
    )
    [System.IO.File]::WriteAllText(
        (Join-Path $stageRoot $managedMarkerName),
        $managedMarkerValue,
        [System.Text.UTF8Encoding]::new($false)
    )

    $installNames = @('bin', 'models', 'manifest.json', $managedMarkerName)
    Install-InventorVoiceRuntime -VoiceRoot $voiceRoot -StageRoot $stageRoot -InstallNames $installNames -VerifyInstalled {
        Assert-FileHash -Path (Join-Path $modelsRoot 'ggml-base.bin') -Algorithm SHA256 -Expected $modelSha256
        if ((Get-Content -Raw -LiteralPath $managedMarker).Trim() -ne $managedMarkerValue) {
            throw 'La instalación no pudo verificarse después del reemplazo.'
        }
    }
    Write-Host "Voz local lista en $voiceRoot"
    Write-Host 'Reiniciá INVENTOR O.S. y presioná REVISAR MOTOR.'
}
finally {
    if ($stageRoot -and (Test-Path -LiteralPath $stageRoot)) {
        Remove-Item -LiteralPath $stageRoot -Recurse -Force
    }
    if (Test-Path -LiteralPath $tempRoot) {
        Remove-Item -LiteralPath $tempRoot -Recurse -Force
    }
}
