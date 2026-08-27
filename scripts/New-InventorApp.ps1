#Requires -Version 7.2

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidateNotNullOrEmpty()]
    [string]$Name,

    [Parameter(Mandatory = $true)]
    [ValidateNotNullOrEmpty()]
    [string]$Slug,

    [Parameter(Mandatory = $true)]
    [ValidateNotNullOrEmpty()]
    [string]$Problem,

    [Parameter(Mandatory = $true)]
    [ValidateNotNullOrEmpty()]
    [string]$Audience,

    [Parameter(Mandatory = $true)]
    [ValidateNotNullOrEmpty()]
    [string]$FirstAction,

    [Parameter(Mandatory = $true)]
    [ValidateSet("mobile", "desktop", "balanced")]
    [string]$PrimaryUse,

    [Parameter(Mandatory = $true)]
    [ValidateNotNullOrEmpty()]
    [string]$OutputRoot
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$script:ExcludedTemplateDirectories = @('.git', '.codex', '.branches', '.temp', 'coverage', 'dist', 'node_modules')

function Assert-TemplateValue {
    param(
        [Parameter(Mandatory = $true)][string]$Label,
        [Parameter(Mandatory = $true)][string]$Value
    )

    if ([string]::IsNullOrWhiteSpace($Value)) {
        throw "El valor de '$Label' no puede estar vacio."
    }
    if ($Value -match '[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]') {
        throw "El valor de '$Label' contiene caracteres de control no permitidos."
    }
    if ($Value -match '[\r\n]') {
        throw "El valor de '$Label' debe escribirse en una sola linea."
    }
    $maximumLength = switch ($Label) {
        "Name" { 120 }
        "Problem" { 2000 }
        "Audience" { 200 }
        "FirstAction" { 200 }
        default { 2000 }
    }
    if ($Value.Length -gt $maximumLength) {
        throw "El valor de '$Label' supera el maximo de $maximumLength caracteres."
    }
    if ($Value -match '^\s{0,3}(?:[#>|]|[-+*]\s|\d+[.)]\s|`{3}|~{3})' -or
        $Value -match '::[A-Za-z]' -or
        $Value -match '<\/?(?:system|assistant|user|developer)\b') {
        throw "El valor de '$Label' contiene sintaxis de instrucciones no permitida."
    }
    if ($Value.Contains("__INVENTOR_", [System.StringComparison]::Ordinal)) {
        throw "El valor de '$Label' no puede contener el prefijo reservado '__INVENTOR_'."
    }
}

function Assert-NoLinks {
    param([Parameter(Mandatory = $true)][string]$SourcePath)

    $item = Get-Item -LiteralPath $SourcePath -Force
    if ($item.Name -in $script:ExcludedTemplateDirectories) {
        return
    }

    $itemsToCheck = @($item) + @(Get-ChildItem -LiteralPath $SourcePath -Force)
    foreach ($item in $itemsToCheck) {
        $linkTypeProperty = $item.PSObject.Properties["LinkType"]
        $isLink = $null -ne $linkTypeProperty -and $null -ne $linkTypeProperty.Value
        $isReparsePoint = ($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0
        if ($isLink -or $isReparsePoint) {
            throw "El origen contiene un enlace simbolico o reparse point no permitido: $($item.FullName)"
        }
        if ($item.PSIsContainer -and $item.FullName -ne $SourcePath -and
            $item.Name -notin $script:ExcludedTemplateDirectories) {
            Assert-NoLinks -SourcePath $item.FullName
        }
    }
}

function Copy-TreeLiteral {
    param(
        [Parameter(Mandatory = $true)][string]$SourcePath,
        [Parameter(Mandatory = $true)][string]$DestinationPath
    )

    [System.IO.Directory]::CreateDirectory($DestinationPath) | Out-Null
    foreach ($child in @(Get-ChildItem -LiteralPath $SourcePath -Force)) {
        if ($child.PSIsContainer -and $script:ExcludedTemplateDirectories -contains $child.Name) {
            continue
        }
        if (-not $child.PSIsContainer) {
            $parentName = [System.IO.Path]::GetFileName($child.DirectoryName)
            $isLocalEditorConfig =
                ($parentName -eq '.vscode' -and $child.Name.EndsWith('.local.json', [System.StringComparison]::OrdinalIgnoreCase)) -or
                ($parentName -eq '.obsidian' -and $child.Name.StartsWith('workspace', [System.StringComparison]::OrdinalIgnoreCase))
            if ($isLocalEditorConfig -or
                $child.Name -in @('.mcp.json', '.npmrc') -or
                $child.Name -eq '.env' -or
                ($child.Name.StartsWith('.env.', [System.StringComparison]::Ordinal) -and
                 $child.Name -ne '.env.example')) {
                continue
            }
        }
        if ($child.PSIsContainer) {
            Copy-TreeLiteral -SourcePath $child.FullName -DestinationPath (Join-Path $DestinationPath $child.Name)
        }
        else {
            Copy-Item -LiteralPath $child.FullName -Destination $DestinationPath -Force
        }
    }
}

function Test-IsTemplateTextFile {
    param([Parameter(Mandatory = $true)][string]$Path)

    $textExtensions = @(
        ".cjs", ".css", ".env", ".example", ".gitignore", ".gitattributes",
        ".htm", ".html", ".ini", ".js", ".json", ".jsonc", ".jsx", ".md",
        ".mjs", ".ps1", ".scss", ".sh", ".sql", ".svg", ".toml", ".ts",
        ".tsx", ".txt", ".yaml", ".yml"
    )
    $textNames = @(
        ".editorconfig", ".gitattributes", ".gitignore", ".node-version", ".npmrc",
        "Dockerfile", "LICENSE", "Makefile"
    )
    $fileName = [System.IO.Path]::GetFileName($Path)
    $extension = [System.IO.Path]::GetExtension($Path)

    return $textExtensions -contains $extension -or $textNames -contains $fileName
}

foreach ($entry in @(
        @{ Label = "Name"; Value = $Name },
        @{ Label = "Problem"; Value = $Problem },
        @{ Label = "Audience"; Value = $Audience },
        @{ Label = "FirstAction"; Value = $FirstAction }
    )) {
    Assert-TemplateValue -Label $entry.Label -Value $entry.Value
}

if ($Slug -notmatch '^[a-z0-9]+(?:-[a-z0-9]+)*$') {
    throw "Slug invalido. Usa solamente minusculas, numeros y guiones, sin espacios ni rutas."
}
if ($Slug -match '^(con|prn|aux|nul|com[1-9]|lpt[1-9])$') {
    throw "Slug invalido: '$Slug' es un nombre reservado en Windows."
}

$kitRoot = [System.IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
$templateRoot = Join-Path $kitRoot "templates/web-app"
$foundryRoot = Join-Path $kitRoot "foundry"
$portableScriptNames = @("foundry.mjs", "check-privacy.mjs", "redact-supabase-output.mjs")
$versionFile = Join-Path $kitRoot "VERSION"

if (-not [System.IO.Directory]::Exists($templateRoot)) {
    throw "Falta el template obligatorio: $templateRoot"
}
if (-not [System.IO.Directory]::Exists($foundryRoot)) {
    throw "Falta la biblioteca Foundry obligatoria: $foundryRoot"
}
foreach ($scriptName in $portableScriptNames) {
    $portableScript = Join-Path $kitRoot "scripts/$scriptName"
    if (-not [System.IO.File]::Exists($portableScript)) {
        throw "Falta el script portable obligatorio: $portableScript"
    }
}
if (-not [System.IO.File]::Exists($versionFile)) {
    throw "Falta VERSION en la raiz del kit."
}

$kitVersion = [System.IO.File]::ReadAllText($versionFile).Trim()
if ($kitVersion -notmatch '^\d+\.\d+\.\d+$') {
    throw "VERSION debe usar SemVer simple (por ejemplo, 0.1.0). Valor actual: '$kitVersion'."
}

Assert-NoLinks -SourcePath $templateRoot
Assert-NoLinks -SourcePath $foundryRoot
foreach ($scriptName in $portableScriptNames) {
    $portableScript = Join-Path $kitRoot "scripts/$scriptName"
    $portableScriptItem = Get-Item -LiteralPath $portableScript -Force
    $portableScriptLink = $portableScriptItem.PSObject.Properties["LinkType"]
    if (($null -ne $portableScriptLink -and $null -ne $portableScriptLink.Value) -or
        (($portableScriptItem.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0)) {
        throw "Un script portable no puede ser enlace simbolico o reparse point: $portableScript"
    }
}

$resolvedOutputRoot = Resolve-Path -LiteralPath $OutputRoot -ErrorAction Stop
if ($resolvedOutputRoot.Provider.Name -ne "FileSystem") {
    throw "OutputRoot debe pertenecer al sistema de archivos."
}
$outputRootFull = [System.IO.Path]::GetFullPath($resolvedOutputRoot.ProviderPath)
if (-not [System.IO.Directory]::Exists($outputRootFull)) {
    throw "OutputRoot debe existir y ser una carpeta: $outputRootFull"
}

$targetFull = [System.IO.Path]::GetFullPath((Join-Path $outputRootFull $Slug))
$relativeTarget = [System.IO.Path]::GetRelativePath($outputRootFull, $targetFull)
if ([System.IO.Path]::IsPathRooted($relativeTarget) -or
    $relativeTarget -eq ".." -or
    $relativeTarget.StartsWith("../", [System.StringComparison]::Ordinal) -or
    $relativeTarget.StartsWith("..\", [System.StringComparison]::Ordinal)) {
    throw "La ruta de destino escapa de OutputRoot."
}
if (Test-Path -LiteralPath $targetFull) {
    throw "No se sobrescribio nada: el destino ya existe: $targetFull"
}

$stageName = ".inventor-kit-tmp-$([System.Guid]::NewGuid().ToString('N'))"
$stageFull = [System.IO.Path]::GetFullPath((Join-Path $outputRootFull $stageName))
$relativeStage = [System.IO.Path]::GetRelativePath($outputRootFull, $stageFull)
if ($relativeStage -ne $stageName) {
    throw "No se pudo validar la ruta temporal de trabajo."
}

$utf8NoBom = [System.Text.UTF8Encoding]::new($false)
$stageCreated = $false
$primaryUseLabel = switch ($PrimaryUse) {
    "mobile" { "móvil" }
    "desktop" { "escritorio" }
    "balanced" { "móvil y escritorio por igual" }
}

try {
    [System.IO.Directory]::CreateDirectory($stageFull) | Out-Null
    $stageCreated = $true

    Copy-TreeLiteral -SourcePath $templateRoot -DestinationPath $stageFull

    $stageFoundry = Join-Path $stageFull "foundry"
    if (Test-Path -LiteralPath $stageFoundry) {
        throw "El template web-app no debe contener 'foundry/'; su unico origen es la raiz del kit."
    }
    Copy-TreeLiteral -SourcePath $foundryRoot -DestinationPath $stageFoundry

    $stageScripts = Join-Path $stageFull "scripts"
    [System.IO.Directory]::CreateDirectory($stageScripts) | Out-Null
    foreach ($scriptName in $portableScriptNames) {
        $stagePortableScript = Join-Path $stageScripts $scriptName
        if (Test-Path -LiteralPath $stagePortableScript) {
            throw "El template web-app no debe contener 'scripts/$scriptName'; su unico origen es la raiz del kit."
        }
        Copy-Item -LiteralPath (Join-Path $kitRoot "scripts/$scriptName") -Destination $stagePortableScript
    }

    $replacements = [ordered]@{
        "__INVENTOR_APP_NAME__"          = $Name
        "__INVENTOR_APP_SLUG__"          = $Slug
        "__INVENTOR_APP_PROBLEM__"       = $Problem
        "__INVENTOR_APP_AUDIENCE__"      = $Audience
        "__INVENTOR_APP_FIRST_ACTION__"  = $FirstAction
        "__INVENTOR_PRIMARY_USE__"       = $PrimaryUse
        "__INVENTOR_PRIMARY_USE_LABEL__" = $primaryUseLabel
        "__INVENTOR_KIT_VERSION__"       = $kitVersion
    }

    foreach ($file in @(Get-ChildItem -LiteralPath $stageFull -File -Force -Recurse)) {
        $relativeFile = [System.IO.Path]::GetRelativePath($stageFull, $file.FullName).Replace("\", "/")
        if ($relativeFile -eq "src/project.generated.json") {
            # Los datos que consume TypeScript se serializan abajo; nunca se interpolan
            # como texto dentro de JSON porque comillas y saltos de linea lo romperian.
            continue
        }
        if (-not (Test-IsTemplateTextFile -Path $file.FullName)) {
            continue
        }

        $content = [System.IO.File]::ReadAllText($file.FullName)
        foreach ($token in $replacements.Keys) {
            $content = $content.Replace($token, $replacements[$token], [System.StringComparison]::Ordinal)
        }
        if ($content -match '__INVENTOR_[A-Z0-9_]+__') {
            throw "Quedo un token sin resolver en '$($file.FullName)'."
        }
        [System.IO.File]::WriteAllText($file.FullName, $content, $utf8NoBom)
    }

    $projectData = [ordered]@{
        schemaVersion = 2
        name          = $Name
        slug          = $Slug
        problem       = $Problem
        audience      = $Audience
        firstAction   = $FirstAction
        primaryUse    = $PrimaryUse
    }
    $projectDataPath = Join-Path $stageFull "src/project.generated.json"
    [System.IO.Directory]::CreateDirectory((Split-Path -Parent $projectDataPath)) | Out-Null
    $projectDataJson = ($projectData | ConvertTo-Json -Depth 3) + "`n"
    [System.IO.File]::WriteAllText($projectDataPath, $projectDataJson, $utf8NoBom)

    $manifest = [ordered]@{
        schemaVersion = 1
        kitVersion    = $kitVersion
        template      = "web-app"
    }
    $manifestJson = ($manifest | ConvertTo-Json -Depth 3) + "`n"
    [System.IO.File]::WriteAllText(
        (Join-Path $stageFull ".inventor-kit.json"),
        $manifestJson,
        $utf8NoBom
    )

    $gitCommand = Get-Command -Name 'git' -ErrorAction SilentlyContinue
    if ($null -eq $gitCommand) {
        throw "Git es obligatorio para crear el repositorio local de la aplicación."
    }
    & $gitCommand.Source -C $stageFull init --initial-branch=main *> $null
    if ($LASTEXITCODE -ne 0) {
        throw "Git no pudo inicializar el repositorio local de la aplicación."
    }

    # El staging es hermano del destino: Directory.Move es un rename en el mismo filesystem.
    # Tambien protege la carrera en la que otro proceso crea el destino a ultimo momento.
    [System.IO.Directory]::Move($stageFull, $targetFull)
    $stageCreated = $false
}
finally {
    if ($stageCreated -and [System.IO.Directory]::Exists($stageFull)) {
        $cleanupRelative = [System.IO.Path]::GetRelativePath($outputRootFull, $stageFull)
        if ($cleanupRelative -eq $stageName -and $stageName.StartsWith(".inventor-kit-tmp-", [System.StringComparison]::Ordinal)) {
            Remove-Item -LiteralPath $stageFull -Recurse -Force
        }
    }
}

$quotedTarget = $targetFull.Replace("'", "''", [System.StringComparison]::Ordinal)
@(
    "LISTO: aplicacion creada"
    "Nombre: $Name"
    "Experiencia principal: $primaryUseLabel"
    "Ruta: $targetFull"
    "Kit: v$kitVersion"
    "Siguiente:"
    "  Set-Location -LiteralPath '$quotedTarget'"
    "  npm ci"
    "  npm run dev"
)
