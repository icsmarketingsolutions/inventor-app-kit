import { spawn } from 'node:child_process';
import { lstat, realpath } from 'node:fs/promises';
import { dirname, isAbsolute, join, parse, resolve } from 'node:path';
import { AppError } from '../core/errors.mjs';

const MAX_OUTPUT_BYTES = 16 * 1024;
const PICKER_TIMEOUT_MS = 10 * 60 * 1000;

async function regularFileRealPath(path) {
  if (!path || !isAbsolute(path)) return null;
  try {
    const metadata = await lstat(path);
    if (!metadata.isFile() || metadata.isSymbolicLink()) return null;
    return realpath(path);
  } catch {
    return null;
  }
}

async function resolvePowerShellExecutable(environment = process.env, preferredPath) {
  const candidates = [
    preferredPath,
    environment.INVENTOR_OS_PWSH,
    environment.ProgramFiles && join(environment.ProgramFiles, 'PowerShell', '7', 'pwsh.exe'),
  ];
  for (const candidate of candidates) {
    const executable = await regularFileRealPath(candidate);
    if (executable) return executable;
  }
  return null;
}

function abortedError() {
  const error = new Error('Folder picker aborted');
  error.name = 'AbortError';
  return error;
}

function executePicker(executable, args, { signal, input } = {}) {
  return new Promise((resolvePromise, reject) => {
    if (signal?.aborted) {
      reject(abortedError());
      return;
    }
    const child = spawn(executable, args, {
      cwd: dirname(executable),
      shell: false,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });
    const chunks = [];
    let outputBytes = 0;
    let finished = false;
    let forcedError = null;
    const stop = (error) => {
      if (finished) return;
      forcedError = error;
      child.kill();
    };
    const abort = () => stop(abortedError());
    const timeout = setTimeout(() => stop(new Error('Folder picker timeout')), PICKER_TIMEOUT_MS);
    signal?.addEventListener('abort', abort, { once: true });
    child.stdout.on('data', (chunk) => {
      outputBytes += chunk.length;
      if (outputBytes > MAX_OUTPUT_BYTES) {
        stop(new Error('Folder picker output limit'));
        return;
      }
      chunks.push(chunk);
    });
    child.stderr.on('data', () => {});
    child.once('error', (error) => {
      forcedError = forcedError || error;
    });
    child.once('close', (code) => {
      finished = true;
      clearTimeout(timeout);
      signal?.removeEventListener('abort', abort);
      if (forcedError) {
        reject(forcedError);
        return;
      }
      if (code !== 0) {
        reject(new Error('Folder picker failed'));
        return;
      }
      resolvePromise(Buffer.concat(chunks).toString('utf8'));
    });
    child.stdin.on('error', () => {});
    child.stdin.end(input, 'utf8');
  });
}

async function validateSelectedPath(selectedPath, localFixed) {
  if (typeof selectedPath !== 'string' || !selectedPath.trim() || !isAbsolute(selectedPath)) {
    throw new AppError(502, 'FOLDER_PICKER_INVALID_RESULT', 'Windows no devolvió una carpeta válida.');
  }
  if (selectedPath.startsWith('\\\\')) {
    throw new AppError(400, 'FOLDER_PICKER_UNC_REJECTED', 'Elegí una carpeta local de esta computadora.');
  }
  if (localFixed !== true) {
    throw new AppError(400, 'FOLDER_PICKER_NETWORK_REJECTED', 'Elegí una carpeta de una unidad local fija.');
  }
  let metadata;
  try {
    metadata = await lstat(selectedPath);
  } catch {
    throw new AppError(409, 'FOLDER_PICKER_PATH_GONE', 'La carpeta elegida ya no está disponible.');
  }
  if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
    throw new AppError(409, 'FOLDER_PICKER_NOT_DIRECTORY', 'Elegí una carpeta, no un archivo.');
  }
  let current = resolve(selectedPath);
  const root = parse(current).root;
  while (current) {
    const currentMetadata = await lstat(current);
    if (currentMetadata.isSymbolicLink()) {
      throw new AppError(400, 'FOLDER_PICKER_LINK_REJECTED', 'Elegí una carpeta local sin enlaces.');
    }
    if (current === root) break;
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  const canonical = await realpath(selectedPath);
  if (canonical.startsWith('\\\\')) {
    throw new AppError(400, 'FOLDER_PICKER_NETWORK_REJECTED', 'Elegí una carpeta de una unidad local fija.');
  }
  return canonical;
}

export function createNativeFolderPicker({
  platform = process.platform,
  environment = process.env,
  powerShellPath,
  scriptPath,
  run = executePicker,
  resolveExecutable = resolvePowerShellExecutable,
} = {}) {
  let active = false;

  return async function selectFolder(initialPath, { signal } = {}) {
    if (platform !== 'win32') {
      throw new AppError(501, 'WINDOWS_FOLDER_PICKER_ONLY', 'El selector nativo requiere Windows.');
    }
    if (active) {
      throw new AppError(409, 'FOLDER_PICKER_BUSY', 'Ya hay un selector de carpetas abierto.');
    }
    if (typeof initialPath === 'string' && initialPath.startsWith('\\\\')) {
      throw new AppError(400, 'FOLDER_PICKER_UNC_REJECTED', 'Elegí una carpeta local de esta computadora.');
    }
    if (initialPath !== undefined && initialPath !== '' &&
        (typeof initialPath !== 'string' || !isAbsolute(initialPath))) {
      throw new AppError(400, 'INVALID_FOLDER_PATH', 'La ruta inicial debe ser absoluta.');
    }

    active = true;
    try {
      const [executable, pickerScript] = await Promise.all([
        resolveExecutable(environment, powerShellPath),
        regularFileRealPath(scriptPath),
      ]);
      if (!executable || !pickerScript) {
        throw new AppError(501, 'FOLDER_PICKER_UNAVAILABLE', 'El selector nativo no está disponible.');
      }
      const stdout = await run(executable, [
        '-NoLogo',
        '-NoProfile',
        '-NonInteractive',
        '-STA',
        '-ExecutionPolicy', 'Bypass',
        '-File', resolve(pickerScript),
      ], { signal, input: JSON.stringify({ initialPath: initialPath || null }) });
      const lines = String(stdout).trim().split(/\r?\n/).filter(Boolean);
      if (lines.length !== 1) {
        throw new AppError(502, 'FOLDER_PICKER_INVALID_RESULT', 'Windows no devolvió una respuesta válida.');
      }
      let result;
      try {
        result = JSON.parse(lines[0]);
      } catch {
        throw new AppError(502, 'FOLDER_PICKER_INVALID_RESULT', 'Windows no devolvió una respuesta válida.');
      }
      if (result?.selected === false && result.path === null) {
        return { selected: false, path: null };
      }
      if (result?.selected !== true) {
        throw new AppError(502, 'FOLDER_PICKER_INVALID_RESULT', 'Windows no devolvió una respuesta válida.');
      }
      return { selected: true, path: await validateSelectedPath(result.path, result.localFixed) };
    } catch (error) {
      if (error instanceof AppError) throw error;
      if (signal?.aborted || error?.name === 'AbortError') {
        throw new AppError(499, 'FOLDER_PICKER_CANCELLED', 'El selector se cerró.');
      }
      throw new AppError(502, 'FOLDER_PICKER_FAILED', 'No se pudo abrir el selector nativo de Windows.');
    } finally {
      active = false;
    }
  };
}
