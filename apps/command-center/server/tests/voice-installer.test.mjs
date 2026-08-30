import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import test from 'node:test';

const execFileAsync = promisify(execFile);

test('instalador de voz fija orígenes, versión y verificaciones de integridad', async () => {
  const source = await readFile(resolve('scripts/voice/install-voice.ps1'), 'utf8');
  const transactionSource = await readFile(resolve('scripts/voice/voice-runtime-transaction.ps1'), 'utf8');
  assert.match(source, /github\.com\/ggml-org\/whisper\.cpp\/releases\/download/);
  assert.match(source, /modelRevision = '[a-f0-9]{40}'/);
  assert.match(source, /huggingface\.co\/ggerganov\/whisper\.cpp\/resolve\/\$modelRevision\/ggml-base\.bin/);
  assert.match(source, /binarySha256 = '[a-f0-9]{64}'/);
  assert.match(source, /modelSha1 = '[a-f0-9]{40}'/);
  assert.match(source, /modelSha256 = '[a-f0-9]{64}'/);
  assert.match(source, /\.install-/);
  assert.match(source, /\.inventor-os-voice-runtime/);
  assert.match(source, /debe estar vacío o ser un runtime administrado/);
  assert.match(source, /ReparsePoint/);
  assert.match(source, /DriveType.*Fixed/);
  assert.match(source, /Install-InventorVoiceRuntime/);
  assert.match(transactionSource, /backedUpNames/);
  assert.match(transactionSource, /installedNames/);
  assert.match(transactionSource, /respaldo anterior se conservó/);
  assert.match(source, /Assert-FileHash/);
  assert.doesNotMatch(source, /Invoke-Expression|Start-Process|\.\s+\$whisperCli/);
});

test('rollback preserva originales si falla a mitad del respaldo', {
  skip: process.platform !== 'win32',
}, async (context) => {
  const root = await mkdtemp(join(tmpdir(), 'inventor-voice-transaction-'));
  const voiceRoot = join(root, 'voice');
  const stageRoot = join(voiceRoot, '.install-test');
  const transactionScript = resolve('scripts/voice/voice-runtime-transaction.ps1');
  await mkdir(join(voiceRoot, 'bin'), { recursive: true });
  await mkdir(join(voiceRoot, 'models'), { recursive: true });
  await mkdir(join(stageRoot, 'bin'), { recursive: true });
  await mkdir(join(stageRoot, 'models'), { recursive: true });
  await writeFile(join(voiceRoot, 'bin', 'original.txt'), 'bin original');
  await writeFile(join(voiceRoot, 'models', 'original.txt'), 'modelo original');
  await writeFile(join(stageRoot, 'bin', 'new.txt'), 'bin nuevo');
  await writeFile(join(stageRoot, 'models', 'new.txt'), 'modelo nuevo');
  const harness = join(root, 'transaction-test.ps1');
  await writeFile(harness, `param([string]$Transaction,[string]$Voice,[string]$Stage)\n` +
    `. $Transaction\n` +
    `$failed=$false\n` +
    `try { Install-InventorVoiceRuntime -VoiceRoot $Voice -StageRoot $Stage ` +
    `-InstallNames @('bin','models') -VerifyInstalled {} ` +
    `-AfterBackupStep { param($name,$count) if ($count -eq 1) { throw 'falla inyectada' } } } ` +
    `catch { $failed=$true }\n` +
    `if (-not $failed) { throw 'La falla de prueba no ocurrió.' }\n` +
    `if ((Get-Content -Raw -LiteralPath (Join-Path $Voice 'bin\\original.txt')) -ne 'bin original') { throw 'bin no se restauró' }\n` +
    `if ((Get-Content -Raw -LiteralPath (Join-Path $Voice 'models\\original.txt')) -ne 'modelo original') { throw 'models fue alterado' }\n` +
    `if (Get-ChildItem -LiteralPath $Voice -Filter '.backup-*' -Force) { throw 'quedó backup tras rollback verificado' }\n`,
  );
  context.after(() => rm(root, { recursive: true, force: true }));
  const result = await execFileAsync('pwsh', [
    '-NoLogo', '-NoProfile', '-File', harness,
    '-Transaction', transactionScript,
    '-Voice', voiceRoot,
    '-Stage', stageRoot,
  ], { windowsHide: true });
  assert.equal(result.stderr, '');
});
