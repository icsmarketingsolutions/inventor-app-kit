import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '..');
const scripts = ['bootstrap-windows.ps1', 'check-machine.ps1', 'test-powershell.ps1'];

test('los scripts de preparación tienen sintaxis PowerShell válida', () => {
  for (const name of scripts) {
    const path = join(root, 'scripts', name);
    const result = spawnSync('pwsh', [
      '-NoProfile',
      '-Command',
      '$tokens=$null;$errors=$null;$path=[Environment]::GetEnvironmentVariable("INVENTOR_SETUP_PATH");[Management.Automation.Language.Parser]::ParseFile($path,[ref]$tokens,[ref]$errors)|Out-Null;if($errors.Count){$errors|ForEach-Object{$_.Message};exit 1}',
    ], {
      encoding: 'utf8',
      env: { ...process.env, INVENTOR_SETUP_PATH: path },
      windowsHide: true,
    });
    assert.equal(result.status, 0, `${name}: ${result.stderr}${result.stdout}`);
  }
});

test('el bootstrap sin -Install es un dry-run y no exige elevación', {
  skip: process.platform !== 'win32',
}, () => {
  const path = join(root, 'scripts', 'bootstrap-windows.ps1');
  const result = spawnSync('pwsh', ['-NoProfile', '-File', path], {
    encoding: 'utf8',
    windowsHide: true,
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /DRY-RUN: no se realiz/);
  assert.match(result.stdout, /OpenJS\.NodeJS\.LTS/);
});

test('la guía fija Node 24, separa Codex de elevación y usa MCP por proyecto', () => {
  const bootstrap = readFileSync(join(root, 'scripts', 'bootstrap-windows.ps1'), 'utf8');
  const computer = readFileSync(join(root, 'setup', 'COMPUTADORA_NUEVA.md'), 'utf8');
  const mcp = readFileSync(join(root, 'setup', 'MCP_Y_CUENTAS.md'), 'utf8');
  assert.match(bootstrap, /Version = '24\.20\.0'/);
  assert.match(bootstrap, /IncludeAppTooling/);
  assert.match(readFileSync(join(root, 'scripts', 'check-machine.ps1'), 'utf8'), /24\.18\.1/);
  assert.doesNotMatch(bootstrap, /npm.*install.*@openai\/codex/s);
  assert.match(computer, /@openai\/codex@0\.151\.0/);
  assert.match(mcp, /\.codex\/config\.toml/);
});

test('VERSION coincide con el paquete y el changelog publicados', () => {
  const version = readFileSync(join(root, 'VERSION'), 'utf8').trim();
  const packageValue = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  const changelog = readFileSync(join(root, 'CHANGELOG.md'), 'utf8');
  assert.equal(version, packageValue.version);
  assert.match(changelog, new RegExp(`^## ${version.replaceAll('.', '\\.')}`, 'm'));
});

test('el primer prompt clona el repo público y exige la verificación local completa', () => {
  const prompt = readFileSync(join(root, 'setup', 'PROMPT_COMPUTADORA_NUEVA.md'), 'utf8');
  assert.match(prompt, /https:\/\/github\.com\/icsmarketingsolutions\/inventor-app-kit/);
  assert.match(prompt, /npm run verify/);
  assert.match(prompt, /npm run os:verify/);
  assert.match(prompt, /npm run os:install/);
  assert.match(prompt, /read_only=true/);
  assert.match(prompt, /360, 768 y 1440/);
  assert.match(prompt, /sin Supabase ni Docker/);
  assert.match(prompt, /Supabase.*solo si el producto necesita/s);
  assert.match(prompt, /acceso directo/i);
  assert.ok(prompt.indexOf('Microsoft.PowerShell') < prompt.indexOf('CLON SEGURO'));
  assert.match(prompt, /No hagas deploy, compras, DNS, repos remotos ni proyectos Supabase/);
  assert.doesNotMatch(prompt, /peg(?:á|a).*(?:token|contraseña|clave).*chat/i);
});

test('check-machine convierte herramientas no ejecutables en diagnóstico', {
  skip: process.platform !== 'win32',
}, () => {
  const path = join(root, 'scripts', 'check-machine.ps1');
  const result = spawnSync('pwsh', ['-NoProfile', '-File', path], {
    encoding: 'utf8',
    windowsHide: true,
  });
  assert.ok([0, 1].includes(result.status ?? -1), result.stderr);
  assert.match(result.stdout, /Resultado:/);
  assert.doesNotMatch(`${result.stdout}\n${result.stderr}`, /Invoke-ExternalCapture:|Exception calling/);
});
