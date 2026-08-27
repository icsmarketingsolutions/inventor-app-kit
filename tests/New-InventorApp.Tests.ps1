$ErrorActionPreference = "Stop"

$script:GeneratorSource = Join-Path (Split-Path -Parent $PSScriptRoot) "scripts/New-InventorApp.ps1"
$script:PwshPath = (Get-Command pwsh -ErrorAction Stop).Source
$script:Utf8NoBom = [System.Text.UTF8Encoding]::new($false)

# Adaptador mínimo para que la misma sintaxis de igualdad funcione en Pester 3
# (presente en Windows antiguos) y Pester 5 (fijado en CI). No reemplaza otras
# aserciones de Pester porque esta suite solo necesita igualdad exacta.
function Assert-Be {
    param(
        [Parameter(ValueFromPipeline = $true)][AllowNull()]$Actual,
        [Parameter(Mandatory = $true)][AllowNull()]$Be
    )
    process {
        if (-not ($Actual -eq $Be)) {
            throw "Se esperaba '$Be' pero se obtuvo '$Actual'."
        }
    }
}
Set-Alias -Name Should -Value Assert-Be -Scope Script

function Write-TestText {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][string]$Content
    )

    [System.IO.Directory]::CreateDirectory((Split-Path -Parent $Path)) | Out-Null
    [System.IO.File]::WriteAllText($Path, $Content, $script:Utf8NoBom)
}

function New-TestKit {
    param([Parameter(Mandatory = $true)][string]$Root)

    $scripts = Join-Path $Root "scripts"
    $template = Join-Path $Root "templates/web-app"
    $skill = Join-Path $template ".agents/skills/project"
    $foundry = Join-Path $Root "foundry/prompts"
    [System.IO.Directory]::CreateDirectory($scripts) | Out-Null
    [System.IO.Directory]::CreateDirectory($skill) | Out-Null
    [System.IO.Directory]::CreateDirectory($foundry) | Out-Null

    Copy-Item -LiteralPath $script:GeneratorSource -Destination (Join-Path $scripts "New-InventorApp.ps1")
    Write-TestText -Path (Join-Path $Root "VERSION") -Content "0.1.0`n"
    Write-TestText -Path (Join-Path $template "README.md") -Content @'
# __INVENTOR_APP_NAME__
Slug: __INVENTOR_APP_SLUG__
Problema: __INVENTOR_APP_PROBLEM__
Audiencia: __INVENTOR_APP_AUDIENCE__
Primera accion: __INVENTOR_APP_FIRST_ACTION__
Kit: __INVENTOR_KIT_VERSION__
'@
    Write-TestText -Path (Join-Path $template "package.json") -Content '{"name":"__INVENTOR_APP_SLUG__"}'
    Write-TestText -Path (Join-Path $template ".gitignore") -Content "node_modules/`n.env`n"
    Write-TestText -Path (Join-Path $template ".gitattributes") -Content "* text=auto eol=lf`n"
    Write-TestText -Path (Join-Path $skill "SKILL.md") -Content "# __INVENTOR_APP_NAME__`n"
    Write-TestText -Path (Join-Path $template "scripts/helper.ps1") -Content "# helper`n"
    Write-TestText -Path (Join-Path $template "src/project.generated.json") -Content '{"placeholder":true}'
    Write-TestText -Path (Join-Path $foundry "base.md") -Content "Proyecto: __INVENTOR_APP_NAME__`n"
    Write-TestText -Path (Join-Path $scripts "foundry.mjs") -Content "// __INVENTOR_APP_SLUG__`n"

    return $Root
}

function Invoke-TestGenerator {
    param(
        [Parameter(Mandatory = $true)][string]$KitRoot,
        [Parameter(Mandatory = $true)][string]$OutputRoot,
        [string]$Name = "Mis inventos",
        [string]$Slug = "mis-inventos",
        [string]$Problem = "Ordenar ideas",
        [string]$Audience = "Mi familia",
        [string]$FirstAction = "Registrar un invento"
    )

    $arguments = @(
        "-NoProfile",
        "-File", (Join-Path $KitRoot "scripts/New-InventorApp.ps1"),
        "-Name", $Name,
        "-Slug", $Slug,
        "-Problem", $Problem,
        "-Audience", $Audience,
        "-FirstAction", $FirstAction,
        "-OutputRoot", $OutputRoot
    )
    $output = @(& $script:PwshPath @arguments 2>&1)
    $exitCode = $LASTEXITCODE
    return [pscustomobject]@{
        ExitCode = $exitCode
        Output   = @($output | ForEach-Object { "$_" })
    }
}

function Get-NormalizedTree {
    param([Parameter(Mandatory = $true)][string]$Root)

    $entries = [System.Collections.Generic.List[string]]::new()
    foreach ($item in @(Get-ChildItem -LiteralPath $Root -Force -Recurse)) {
        $relative = [System.IO.Path]::GetRelativePath($Root, $item.FullName).Replace("\", "/")
        if ($relative -eq ".git" -or $relative.StartsWith(".git/", [System.StringComparison]::Ordinal)) {
            continue
        }
        if ($item.PSIsContainer) {
            $relative += "/"
        }
        $entries.Add($relative)
    }
    $result = $entries.ToArray()
    [System.Array]::Sort($result, [System.StringComparer]::Ordinal)
    return $result
}

Describe "New-InventorApp.ps1" {
    BeforeEach {
        $caseRoot = Join-Path $TestDrive ([System.Guid]::NewGuid().ToString("N"))
        $kitRoot = Join-Path $caseRoot "kit"
        $outputRoot = Join-Path $caseRoot "output"
        [System.IO.Directory]::CreateDirectory($outputRoot) | Out-Null
        New-TestKit -Root $kitRoot | Out-Null
    }

    It "genera la app, copia dotfiles y Foundry, escribe el manifest y muestra la salida exacta" {
        $result = Invoke-TestGenerator -KitRoot $kitRoot -OutputRoot $outputRoot
        $target = Join-Path $outputRoot "mis-inventos"

        $result.ExitCode | Should -Be 0
        [System.IO.File]::Exists((Join-Path $target ".gitignore")) | Should -Be $true
        [System.IO.File]::Exists((Join-Path $target ".agents/skills/project/SKILL.md")) | Should -Be $true
        [System.IO.File]::Exists((Join-Path $target "foundry/prompts/base.md")) | Should -Be $true
        [System.IO.File]::Exists((Join-Path $target "scripts/foundry.mjs")) | Should -Be $true
        [System.IO.Directory]::Exists((Join-Path $target ".git")) | Should -Be $true
        (& git -C $target branch --show-current).Trim() | Should -Be "main"

        $manifest = Get-Content -Raw -LiteralPath (Join-Path $target ".inventor-kit.json") | ConvertFrom-Json
        $manifest.schemaVersion | Should -Be 1
        $manifest.kitVersion | Should -Be "0.1.0"
        $manifest.template | Should -Be "web-app"

        $projectData = Get-Content -Raw -LiteralPath (Join-Path $target "src/project.generated.json") | ConvertFrom-Json
        $projectData.schemaVersion | Should -Be 1
        $projectData.name | Should -Be "Mis inventos"
        $projectData.problem | Should -Be "Ordenar ideas"
        $projectData.audience | Should -Be "Mi familia"
        $projectData.firstAction | Should -Be "Registrar un invento"

        $quotedTarget = $target.Replace("'", "''")
        $expected = @(
            "LISTO: aplicacion creada"
            "Nombre: Mis inventos"
            "Ruta: $target"
            "Kit: v0.1.0"
            "Siguiente:"
            "  Set-Location -LiteralPath '$quotedTarget'"
            "  npm ci"
            "  npm run dev"
        ) -join "`n"
        ($result.Output -join "`n") | Should -Be $expected
    }

    It "reemplaza los tokens de forma literal, incluso con Unicode y simbolos de regex" {
        $name = 'Inventos de Jose "el grande" $1 & compania'
        $problem = "Resolver 100% del problema (sin perder `$2)`ncon una segunda linea"
        $result = Invoke-TestGenerator -KitRoot $kitRoot -OutputRoot $outputRoot -Name $name -Problem $problem
        $target = Join-Path $outputRoot "mis-inventos"
        $readme = Get-Content -Raw -LiteralPath (Join-Path $target "README.md")
        $projectData = Get-Content -Raw -LiteralPath (Join-Path $target "src/project.generated.json") | ConvertFrom-Json

        $result.ExitCode | Should -Be 0
        $readme.Contains("# $name") | Should -Be $true
        $readme.Contains("Problema: $problem") | Should -Be $true
        $readme.Contains("__INVENTOR_") | Should -Be $false
        $projectData.name | Should -Be $name
        $projectData.problem | Should -Be $problem
    }

    It "nunca sobrescribe un destino existente" {
        $target = Join-Path $outputRoot "mis-inventos"
        [System.IO.Directory]::CreateDirectory($target) | Out-Null
        $sentinel = Join-Path $target "sentinel.txt"
        Write-TestText -Path $sentinel -Content "intacto"

        $result = Invoke-TestGenerator -KitRoot $kitRoot -OutputRoot $outputRoot

        ($result.ExitCode -ne 0) | Should -Be $true
        (Get-Content -Raw -LiteralPath $sentinel) | Should -Be "intacto"
        @(Get-ChildItem -LiteralPath $target -Force).Count | Should -Be 1
        @(Get-ChildItem -LiteralPath $outputRoot -Force -Filter ".inventor-kit-tmp-*").Count | Should -Be 0
    }

    It "no copia dependencias, builds ni configuracion local" {
        Write-TestText -Path (Join-Path $kitRoot "templates/web-app/node_modules/demo/index.js") -Content "privado"
        Write-TestText -Path (Join-Path $kitRoot "templates/web-app/dist/index.html") -Content "viejo"
        Write-TestText -Path (Join-Path $kitRoot "templates/web-app/.env.local") -Content "SECRET_VALUE=privado"
        Write-TestText -Path (Join-Path $kitRoot "templates/web-app/.mcp.json") -Content '{"token":"privado"}'
        Write-TestText -Path (Join-Path $kitRoot "templates/web-app/.codex/config.toml") -Content 'token = "privado"'
        Write-TestText -Path (Join-Path $kitRoot "templates/web-app/.vscode/settings.local.json") -Content '{"privado":true}'
        Write-TestText -Path (Join-Path $kitRoot "templates/web-app/.obsidian/workspace.json") -Content '{"privado":true}'

        $result = Invoke-TestGenerator -KitRoot $kitRoot -OutputRoot $outputRoot
        $target = Join-Path $outputRoot "mis-inventos"

        $result.ExitCode | Should -Be 0
        (Test-Path -LiteralPath (Join-Path $target "node_modules")) | Should -Be $false
        (Test-Path -LiteralPath (Join-Path $target "dist")) | Should -Be $false
        (Test-Path -LiteralPath (Join-Path $target ".env.local")) | Should -Be $false
        (Test-Path -LiteralPath (Join-Path $target ".mcp.json")) | Should -Be $false
        (Test-Path -LiteralPath (Join-Path $target ".codex")) | Should -Be $false
        (Test-Path -LiteralPath (Join-Path $target ".vscode/settings.local.json")) | Should -Be $false
        (Test-Path -LiteralPath (Join-Path $target ".obsidian/workspace.json")) | Should -Be $false
    }

    It "aborta y limpia el staging si queda un token desconocido" {
        Add-Content -LiteralPath (Join-Path $kitRoot "templates/web-app/README.md") -Value "Token: __INVENTOR_UNKNOWN__"

        $result = Invoke-TestGenerator -KitRoot $kitRoot -OutputRoot $outputRoot

        ($result.ExitCode -ne 0) | Should -Be $true
        (Test-Path -LiteralPath (Join-Path $outputRoot "mis-inventos")) | Should -Be $false
        @(Get-ChildItem -LiteralPath $outputRoot -Force -Filter ".inventor-kit-tmp-*").Count | Should -Be 0
    }

    It "rechaza slugs que intentan escapar de OutputRoot" {
        $result = Invoke-TestGenerator -KitRoot $kitRoot -OutputRoot $outputRoot -Slug "../escape"

        ($result.ExitCode -ne 0) | Should -Be $true
        (Test-Path -LiteralPath (Join-Path $caseRoot "escape")) | Should -Be $false
        @(Get-ChildItem -LiteralPath $outputRoot -Force -Filter ".inventor-kit-tmp-*").Count | Should -Be 0
    }

    It "produce el arbol golden normalizado en Windows y Unix" {
        $result = Invoke-TestGenerator -KitRoot $kitRoot -OutputRoot $outputRoot
        $tree = Get-NormalizedTree -Root (Join-Path $outputRoot "mis-inventos")
        $actual = ($tree -join "`n") + "`n"
        $expected = (Get-Content -Raw -LiteralPath (Join-Path $PSScriptRoot "golden/generator-fixture.tree.txt")).Replace("`r`n", "`n")

        $result.ExitCode | Should -Be 0
        $actual | Should -Be $expected
    }
}
