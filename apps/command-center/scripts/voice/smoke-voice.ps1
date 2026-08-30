#Requires -Version 5.1

param([string]$BaseUrl = '')

$ErrorActionPreference = 'Stop'
if ($PSVersionTable.PSEdition -eq 'Core') {
    $windowsPowerShell = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
    & $windowsPowerShell -NoProfile -NonInteractive -STA -ExecutionPolicy Bypass -File $PSCommandPath -BaseUrl $BaseUrl
    exit $LASTEXITCODE
}
if ([string]::IsNullOrWhiteSpace($BaseUrl)) {
    foreach ($candidate in @('http://127.0.0.1:8421', 'http://127.0.0.1:8322')) {
        try {
            $health = Invoke-RestMethod -Uri "$candidate/api/health" -TimeoutSec 2
            if ($health.ok -eq $true -and $health.product -eq 'inventor-os') {
                $BaseUrl = $candidate
                break
            }
        }
        catch { }
    }
    if ([string]::IsNullOrWhiteSpace($BaseUrl)) {
        throw 'Abrí INVENTOR O.S. antes de ejecutar el smoke de voz.'
    }
}
$wavPath = Join-Path ([System.IO.Path]::GetTempPath()) "inventor-os-smoke-$([Guid]::NewGuid().ToString('N')).wav"
try {
    $voice = New-Object -ComObject SAPI.SpVoice
    $stream = New-Object -ComObject SAPI.SpFileStream
    try {
        $stream.Format.Type = 18 # SAFT16kHz16BitMono
        $stream.Open($wavPath, 3, $false) # SSFMCreateForWrite
        $voice.AudioOutputStream = $stream
        [void]$voice.Speak('Esta es una prueba local para Inventor OS.')
        $voice.AudioOutputStream = $null
        $stream.Close()
    }
    finally {
        [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($stream)
        [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($voice)
        [GC]::Collect()
        [GC]::WaitForPendingFinalizers()
    }
    $audio = [System.IO.File]::ReadAllBytes($wavPath)
    $response = Invoke-RestMethod -Uri "$BaseUrl/api/transcription" -Method Post -Headers @{ Origin = $BaseUrl } -ContentType 'audio/wav' -Body $audio -TimeoutSec 180
    if ([string]::IsNullOrWhiteSpace([string]$response.transcript)) { throw 'El motor no devolvió una transcripción.' }
    $normalized = ([string]$response.transcript).ToLowerInvariant()
    if ($normalized -notmatch 'inventor' -or ($normalized -notmatch 'prueba' -and $normalized -notmatch 'local')) {
        throw 'El motor respondió, pero no reconoció las palabras de control esperadas.'
    }
    Write-Host "Smoke de voz listo: $($response.transcript)"
}
finally {
    for ($attempt = 0; $attempt -lt 5 -and (Test-Path -LiteralPath $wavPath); $attempt++) {
        try { Remove-Item -LiteralPath $wavPath -Force -ErrorAction Stop }
        catch { Start-Sleep -Milliseconds 200 }
    }
}
