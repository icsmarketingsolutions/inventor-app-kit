import { randomUUID } from 'node:crypto';
import { cp, lstat, mkdir, readFile, realpath, rename, rm, stat, writeFile } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';
import { AppError } from './errors.mjs';
import { safeProjectName } from './security.mjs';

const EMPTY_CONFIG = { version: 1, projects: [] };
const configQueues = new Map();

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

export async function atomicWrite(path, content) {
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, content, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
    await rename(temporary, path);
  } catch (error) {
    await rm(temporary, { force: true }).catch(() => {});
    throw error;
  }
}

export async function initializeRuntime({ runtimeRoot, seedRoot }) {
  const resolvedRuntime = resolve(runtimeRoot);
  const memoryRoot = join(resolvedRuntime, 'vault');
  const configPath = join(resolvedRuntime, 'config.local.json');
  await mkdir(resolvedRuntime, { recursive: true });
  if (!(await exists(memoryRoot))) {
    await cp(seedRoot, memoryRoot, { recursive: true, errorOnExist: true, force: false });
  } else {
    const info = await lstat(memoryRoot);
    if (!info.isDirectory() || info.isSymbolicLink()) {
      throw new AppError(500, 'INVALID_RUNTIME', 'La memoria local no es una carpeta segura.');
    }
  }
  if (!(await exists(configPath))) {
    await atomicWrite(configPath, `${JSON.stringify(EMPTY_CONFIG, null, 2)}\n`);
  } else {
    const info = await lstat(configPath);
    if (!info.isFile() || info.isSymbolicLink()) {
      throw new AppError(500, 'INVALID_RUNTIME', 'La configuración local no es un archivo seguro.');
    }
  }
  return { runtimeRoot: resolvedRuntime, memoryRoot, configPath };
}

export async function readConfig(configPath) {
  try {
    const parsed = JSON.parse(await readFile(configPath, 'utf8'));
    if (parsed?.version !== 1 || !Array.isArray(parsed.projects)) throw new Error('invalid shape');
    const ids = new Set();
    for (const project of parsed.projects) {
      if (!project || typeof project !== 'object'
        || typeof project.id !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$/.test(project.id)
        || ids.has(project.id)
        || typeof project.name !== 'string' || project.name.length === 0 || project.name.length > 80
        || typeof project.path !== 'string' || project.path.length === 0 || project.path.length > 1024
        || project.path.includes('\0') || !isAbsolute(project.path)) {
        throw new Error('invalid project');
      }
      ids.add(project.id);
    }
    return parsed;
  } catch {
    throw new AppError(500, 'INVALID_LOCAL_CONFIG', 'La configuración local no es válida.');
  }
}

export async function writeConfig(configPath, config) {
  await atomicWrite(configPath, `${JSON.stringify(config, null, 2)}\n`);
}

export async function addProject(configPath, input) {
  const previous = configQueues.get(configPath) || Promise.resolve();
  const operation = previous.then(() => addProjectUnlocked(configPath, input));
  const queued = operation.catch(() => {});
  configQueues.set(configPath, queued);
  try {
    return await operation;
  } finally {
    if (configQueues.get(configPath) === queued) configQueues.delete(configPath);
  }
}

async function addProjectUnlocked(configPath, input) {
  const name = safeProjectName(input?.name);
  const rawPath = typeof input?.path === 'string' ? input.path.trim() : '';
  if (!rawPath || rawPath.length > 1024 || !isAbsolute(rawPath)) {
    throw new AppError(400, 'INVALID_PROJECT_PATH', 'Elegí una carpeta local absoluta válida.');
  }
  let canonicalPath;
  try {
    const info = await stat(rawPath);
    if (!info.isDirectory()) throw new Error('not a directory');
    canonicalPath = await realpath(rawPath);
  } catch {
    throw new AppError(400, 'INVALID_PROJECT_PATH', 'La carpeta local no existe o no está disponible.');
  }
  const config = await readConfig(configPath);
  const normalized = process.platform === 'win32' ? canonicalPath.toLowerCase() : canonicalPath;
  if (config.projects.some((project) => {
    const candidate = process.platform === 'win32' ? project.path.toLowerCase() : project.path;
    return candidate === normalized || project.name.toLocaleLowerCase('es') === name.toLocaleLowerCase('es');
  })) {
    throw new AppError(409, 'PROJECT_EXISTS', 'Ese proyecto ya está registrado.');
  }
  const project = { id: randomUUID(), name, path: canonicalPath };
  config.projects.push(project);
  await writeConfig(configPath, config);
  return project;
}
