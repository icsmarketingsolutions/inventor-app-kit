import assert from 'node:assert/strict';
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';
import { createNativeFolderPicker } from '../features/native-folder-picker.mjs';

async function fixture(context) {
  const root = await mkdtemp(join(tmpdir(), 'inventor-native-picker-'));
  const selected = join(root, 'Proyecto con espacios');
  const scriptPath = join(root, 'select-folder.ps1');
  await mkdir(selected);
  await writeFile(scriptPath, '# test');
  context.after(() => rm(root, { recursive: true, force: true }));
  return { root, selected, scriptPath };
}

function picker(options, output) {
  const calls = [];
  return {
    calls,
    select: createNativeFolderPicker({
      platform: 'win32',
      resolveExecutable: async () => 'C:\\Program Files\\PowerShell\\7\\pwsh.exe',
      run: async (...args) => {
        calls.push(args);
        if (output instanceof Error) throw output;
        return typeof output === 'function' ? output(...args) : output;
      },
      ...options,
    }),
  };
}

test('devuelve una carpeta real y pasa la ruta inicial solo por stdin', async (context) => {
  const files = await fixture(context);
  const instance = picker({ scriptPath: files.scriptPath },
    `${JSON.stringify({ selected: true, path: files.selected, localFixed: true })}\n`);
  const result = await instance.select(files.root);
  assert.deepEqual(result, { selected: true, path: await realpath(files.selected) });
  const [executable, args, execution] = instance.calls[0];
  assert.equal(executable, 'C:\\Program Files\\PowerShell\\7\\pwsh.exe');
  assert.ok(args.includes('-STA'));
  assert.ok(args.includes('-NonInteractive'));
  assert.equal(args.some((argument) => argument.includes(files.root)), false);
  assert.deepEqual(JSON.parse(execution.input), { initialPath: files.root });
});

test('trata cancelar como resultado normal', async (context) => {
  const files = await fixture(context);
  const instance = picker({ scriptPath: files.scriptPath }, '{"selected":false,"path":null}');
  assert.deepEqual(await instance.select(), { selected: false, path: null });
});

test('rechaza salida inválida y no filtra detalles del proceso', async (context) => {
  const files = await fixture(context);
  let instance = picker({ scriptPath: files.scriptPath }, 'texto ajeno\n{"selected":false,"path":null}');
  await assert.rejects(instance.select(), (error) => error.code === 'FOLDER_PICKER_INVALID_RESULT');
  instance = picker({ scriptPath: files.scriptPath }, new Error(`falló en ${files.root}`));
  await assert.rejects(instance.select(), (error) => {
    assert.equal(error.code, 'FOLDER_PICKER_FAILED');
    assert.equal(error.message.includes(files.root), false);
    return true;
  });
});

test('exige que el helper confirme una unidad local fija', async (context) => {
  const files = await fixture(context);
  const instance = picker({ scriptPath: files.scriptPath },
    JSON.stringify({ selected: true, path: files.selected }));
  await assert.rejects(instance.select(), (error) => error.code === 'FOLDER_PICKER_NETWORK_REJECTED');
});

test('impide dos selectores simultáneos y libera el mutex', async (context) => {
  const files = await fixture(context);
  let release;
  const pending = new Promise((resolvePromise) => { release = resolvePromise; });
  const instance = picker({ scriptPath: files.scriptPath }, async () => {
    await pending;
    return '{"selected":false,"path":null}';
  });
  const first = instance.select();
  await assert.rejects(instance.select(), (error) => error.code === 'FOLDER_PICKER_BUSY');
  release();
  assert.deepEqual(await first, { selected: false, path: null });
  assert.deepEqual(await instance.select(), { selected: false, path: null });
});

test('rechaza rutas iniciales relativas y UNC antes de abrir Windows', async (context) => {
  const files = await fixture(context);
  const instance = picker({ scriptPath: files.scriptPath }, '{"selected":false,"path":null}');
  await assert.rejects(instance.select('relativa'), (error) => error.code === 'INVALID_FOLDER_PATH');
  await assert.rejects(instance.select('\\\\servidor\\carpeta'),
    (error) => error.code === 'FOLDER_PICKER_UNC_REJECTED');
  assert.equal(instance.calls.length, 0);
});
