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
  assert.match(bootstrap, /Version = '24\.18\.0'/);
  assert.doesNotMatch(bootstrap, /npm.*install.*@openai\/codex/s);
  assert.match(computer, /@openai\/codex@0\.150\.1/);
  assert.match(mcp, /\.codex\/config\.toml/);
});
