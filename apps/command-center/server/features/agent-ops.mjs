import { spawn as nodeSpawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import {
  access,
  constants,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  rmdir,
  stat,
  writeFile,
} from 'node:fs/promises';
import { delimiter, extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { AppError } from '../core/errors.mjs';
import { assertNoLinks } from '../core/security.mjs';

const MAX_PROMPT_CHARS = 200_000;
const MAX_PROJECTS_PER_LAUNCH = 8;
const SESSION_MARKER = '<!-- inventor-agent-session:';

export const AGENT_COMMANDS = Object.freeze({
  codex: Object.freeze({ command: 'codex', args: Object.freeze(['exec', '-']) }),
  claude: Object.freeze({ command: 'claude', args: Object.freeze(['--print']) }),
});

function executableNames(command, platform, environment) {
  if (platform !== 'win32' || extname(command)) return [command];
  const extensions = String(environment.PATHEXT || '.EXE;.COM;.CMD;.BAT')
    .split(';')
    .map((value) => value.trim())
    .filter(Boolean);
  return extensions.map((extension) => `${command}${extension.toLowerCase()}`);
}

export async function resolveAgentCommand(command, {
  environment = process.env,
  platform = process.platform,
} = {}) {
  if (typeof command !== 'string' || !command || command.includes('/') || command.includes('\\')) {
    throw new AppError(503, 'AGENT_NOT_INSTALLED', 'El agente local no está instalado o no es confiable.');
  }
  const pathDirectories = String(environment.PATH || '')
    .split(delimiter)
    .map((value) => value.trim().replace(/^"|"$/g, ''))
    .filter((value) => value && isAbsolute(value));
  const names = executableNames(command, platform, environment);
  for (const directory of pathDirectories) {
    for (const name of names) {
      const candidate = resolve(directory, name);
      try {
        const info = await stat(candidate);
        if (!info.isFile()) continue;
        if (platform !== 'win32') await access(candidate, constants.X_OK);
        return await realpath(candidate);
      } catch (error) {
        if (['ENOENT', 'EACCES', 'EPERM'].includes(error?.code)) continue;
        throw error;
      }
    }
  }
  throw new AppError(503, 'AGENT_NOT_INSTALLED', 'El agente local no está instalado o no es confiable.');
}

function pathInside(root, candidate) {
  const fromRoot = relative(root, candidate);
  return !fromRoot || (!fromRoot.startsWith(`..${sep}`) && fromRoot !== '..' && !isAbsolute(fromRoot));
}

function safeInline(value, fallback) {
  const withoutControls = Array.from(String(value ?? ''), (character) => {
    const code = character.codePointAt(0);
    return code <= 31 || code === 127 ? ' ' : character;
  }).join('');
  const text = withoutControls
    .replace(/[<>`]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
  return text || fallback;
}

function validatePrompt(value) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new AppError(400, 'INVALID_AGENT_PROMPT', 'El prompt del agente no puede estar vacío.');
  }
  if (value.length > MAX_PROMPT_CHARS || value.includes('\0')) {
    throw new AppError(400, 'INVALID_AGENT_PROMPT', 'El prompt del agente no es válido.');
  }
  return value;
}

function validateTool(tool, commands) {
  if (typeof tool !== 'string' || !Object.hasOwn(commands, tool)) {
    throw new AppError(400, 'INVALID_AGENT_TOOL', `Elegí uno de estos agentes: ${Object.keys(commands).join(', ')}.`);
  }
  const definition = commands[tool];
  if (!definition || typeof definition.command !== 'string' || !definition.command
    || !Array.isArray(definition.args) || definition.args.some((item) => typeof item !== 'string')) {
    throw new TypeError(`La definición del agente ${tool} no es válida`);
  }
  return definition;
}

function validateProjectIds(value) {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_PROJECTS_PER_LAUNCH
    || value.some((id) => typeof id !== 'string' || !id)) {
    throw new AppError(
      400,
      'INVALID_AGENT_PROJECTS',
      `Seleccioná entre 1 y ${MAX_PROJECTS_PER_LAUNCH} proyectos registrados.`,
    );
  }
  if (new Set(value).size !== value.length) {
    throw new AppError(400, 'INVALID_AGENT_PROJECTS', 'No repitás proyectos en un lanzamiento.');
  }
  return value;
}

async function selectedRegisteredProjects(registeredProjects, projectIds) {
  if (!Array.isArray(registeredProjects)) throw new TypeError('registeredProjects debe ser un arreglo');
  const registeredById = new Map();
  for (const project of registeredProjects) {
    if (!project || typeof project.id !== 'string' || registeredById.has(project.id)) continue;
    registeredById.set(project.id, project);
  }
  const selected = [];
  const canonicalPaths = new Set();
  for (const id of validateProjectIds(projectIds)) {
    const project = registeredById.get(id);
    if (!project) {
      throw new AppError(404, 'AGENT_PROJECT_NOT_REGISTERED', 'Uno de los proyectos no está registrado.');
    }
    if (typeof project.path !== 'string' || !isAbsolute(project.path)) {
      throw new AppError(409, 'AGENT_PROJECT_UNAVAILABLE', 'La carpeta registrada no está disponible.');
    }
    let canonicalPath;
    try {
      const info = await stat(project.path);
      if (!info.isDirectory()) throw new Error('not a directory');
      canonicalPath = await realpath(project.path);
    } catch {
      throw new AppError(409, 'AGENT_PROJECT_UNAVAILABLE', 'La carpeta registrada no está disponible.');
    }
    const pathKey = process.platform === 'win32' ? canonicalPath.toLowerCase() : canonicalPath;
    if (canonicalPaths.has(pathKey)) {
      throw new AppError(400, 'INVALID_AGENT_PROJECTS', 'Dos registros apuntan a la misma carpeta.');
    }
    canonicalPaths.add(pathKey);
    selected.push({
      id: project.id,
      name: safeInline(project.name, 'Proyecto local'),
      path: canonicalPath,
    });
  }
  return selected;
}

function timestampForFile(date) {
  return date.toISOString().replace(/[-:]/g, '').replace('T', '-').replace(/\.\d{3}Z$/, 'Z');
}

function markdownForSession(session) {
  const metadata = JSON.stringify(session);
  const status = session.status === 'running'
    ? 'iniciada'
    : session.status === 'completed'
      ? 'completada'
      : 'fallida';
  const exit = session.exitCode === null ? 'pendiente' : String(session.exitCode);
  return [
    `${SESSION_MARKER}${metadata} -->`,
    '',
    `# Sesión ${safeInline(session.tool, 'agente')} ${status}`,
    '',
    `- Proyecto: ${safeInline(session.project, 'Proyecto local')}`,
    `- Agente: ${safeInline(session.tool, 'local')}`,
    `- Inicio: ${session.at}`,
    `- Estado: ${session.status}`,
    `- Código de salida: ${exit}`,
    `- Huella del prompt: \`${session.promptSha256}\``,
    '',
    'El prompt y la ruta local se omiten deliberadamente de este registro.',
    '',
  ].join('\n');
}

async function atomicSessionWrite(path, content) {
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, content, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
    await rename(temporary, path);
  } catch (error) {
    await rm(temporary, { force: true }).catch(() => {});
    throw error;
  }
}

function parseSession(content) {
  const firstLine = content.split(/\r?\n/, 1)[0];
  if (!firstLine.startsWith(SESSION_MARKER) || !firstLine.endsWith(' -->')) return null;
  try {
    const parsed = JSON.parse(firstLine.slice(SESSION_MARKER.length, -4));
    if (!parsed || parsed.version !== 1 || typeof parsed.id !== 'string'
      || typeof parsed.at !== 'string' || typeof parsed.project !== 'string'
      || typeof parsed.tool !== 'string' || !['running', 'completed', 'failed'].includes(parsed.status)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

async function removeTemporaryDirectory(directory, temporaryRoot) {
  await rm(directory, { recursive: true, force: true });
  await rmdir(temporaryRoot).catch((error) => {
    if (!['ENOENT', 'ENOTEMPTY', 'EEXIST'].includes(error?.code)) throw error;
  });
}

export function createAgentOps({
  memoryRoot,
  spawnImpl = nodeSpawn,
  commands = AGENT_COMMANDS,
  now = () => new Date(),
  idFactory = randomUUID,
  resolveCommand = resolveAgentCommand,
} = {}) {
  if (typeof memoryRoot !== 'string' || !isAbsolute(memoryRoot)) {
    throw new TypeError('memoryRoot debe ser una ruta absoluta');
  }
  if (typeof spawnImpl !== 'function') throw new TypeError('spawnImpl debe ser una función');
  if (typeof resolveCommand !== 'function') throw new TypeError('resolveCommand debe ser una función');
  if (typeof now !== 'function' || typeof idFactory !== 'function') {
    throw new TypeError('now e idFactory deben ser funciones');
  }

  const sessionsRoot = resolve(memoryRoot, '50-sessions');
  const temporaryRoot = resolve(memoryRoot, '.agent-tmp');
  const active = new Map();

  async function updateReport(reportPath, session) {
    await atomicSessionWrite(reportPath, markdownForSession(session));
  }

  async function startOne({ commandPath, definition, project, prompt, tool }) {
    const startedAt = now();
    if (!(startedAt instanceof Date) || Number.isNaN(startedAt.valueOf())) {
      throw new TypeError('now debe devolver una fecha válida');
    }
    const id = String(idFactory());
    if (!/^[A-Za-z0-9-]{8,80}$/.test(id)) throw new TypeError('idFactory devolvió un identificador inválido');
    const promptSha256 = createHash('sha256').update(prompt, 'utf8').digest('hex');
    const session = {
      version: 1,
      id,
      at: startedAt.toISOString(),
      completedAt: null,
      projectId: project.id,
      project: project.name,
      tool,
      status: 'running',
      exitCode: null,
      promptSha256,
    };
    await Promise.all([
      mkdir(sessionsRoot, { recursive: true }),
      mkdir(temporaryRoot, { recursive: true }),
    ]);
    await Promise.all([
      assertNoLinks(memoryRoot, sessionsRoot),
      assertNoLinks(memoryRoot, temporaryRoot),
    ]);
    const reportPath = join(sessionsRoot, `${timestampForFile(startedAt)}-${id}.md`);
    const temporaryDirectory = await mkdtemp(join(temporaryRoot, 'launch-'));
    const promptPath = join(temporaryDirectory, 'prompt.md');
    try {
      await writeFile(promptPath, prompt, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
      await updateReport(reportPath, session);
    } catch (error) {
      await removeTemporaryDirectory(temporaryDirectory, temporaryRoot).catch(() => {});
      throw error;
    }

    let child;
    try {
      child = spawnImpl(commandPath, [...definition.args], {
        cwd: project.path,
        shell: false,
        windowsHide: true,
        stdio: ['pipe', 'ignore', 'ignore'],
      });
      if (!child || typeof child.once !== 'function' || typeof child.stdin?.end !== 'function') {
        throw new TypeError('spawnImpl no devolvió un proceso compatible');
      }
    } catch {
      const failed = { ...session, status: 'failed', completedAt: now().toISOString() };
      await Promise.allSettled([
        updateReport(reportPath, failed),
        removeTemporaryDirectory(temporaryDirectory, temporaryRoot),
      ]);
      throw new AppError(503, 'AGENT_START_FAILED', 'No se pudo iniciar el agente local.');
    }

    let finishProcess;
    const completion = new Promise((completionResolve) => {
      let settled = false;
      finishProcess = async (status, exitCode) => {
        if (settled) return;
        settled = true;
        const finishedAt = now();
        const finished = {
          ...session,
          status,
          exitCode,
          completedAt: finishedAt instanceof Date && !Number.isNaN(finishedAt.valueOf())
            ? finishedAt.toISOString()
            : session.at,
        };
        await updateReport(reportPath, finished).catch(() => {});
        active.delete(id);
        completionResolve(finished);
      };
      child.once('error', () => { void finishProcess('failed', null); });
      child.once('close', (code) => {
        const normalizedCode = Number.isInteger(code) ? code : null;
        void finishProcess(normalizedCode === 0 ? 'completed' : 'failed', normalizedCode);
      });
    });
    active.set(id, { child, completion });

    try {
      const promptBytes = await readFile(promptPath);
      child.stdin.end(promptBytes);
    } catch {
      child.kill?.();
      await removeTemporaryDirectory(temporaryDirectory, temporaryRoot).catch(() => {});
      await finishProcess('failed', null);
      throw new AppError(503, 'AGENT_START_FAILED', 'No se pudo entregar el prompt al agente local.');
    }
    await removeTemporaryDirectory(temporaryDirectory, temporaryRoot);
    return { id, projectId: project.id, project: project.name, tool, status: 'running' };
  }

  async function launch({
    tool,
    projectIds,
    prompt,
    confirm,
    registeredProjects,
  } = {}) {
    if (confirm !== true) {
      throw new AppError(409, 'AGENT_CONFIRMATION_REQUIRED', 'Confirmá explícitamente el lanzamiento del agente.');
    }
    const definition = validateTool(tool, commands);
    const cleanPrompt = validatePrompt(prompt);
    const projects = await selectedRegisteredProjects(registeredProjects, projectIds);
    let commandPath;
    try {
      commandPath = await resolveCommand(definition.command);
      if (typeof commandPath !== 'string' || !isAbsolute(commandPath)) throw new Error('absolute path required');
      commandPath = await realpath(commandPath);
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(503, 'AGENT_NOT_INSTALLED', 'El agente local no está instalado o no es confiable.');
    }
    if (projects.some((project) => pathInside(project.path, commandPath))) {
      throw new AppError(409, 'AGENT_COMMAND_UNTRUSTED', 'El ejecutable del agente no puede vivir dentro del proyecto.');
    }
    const sessions = [];
    try {
      for (const project of projects) {
        sessions.push(await startOne({ commandPath, definition, project, prompt: cleanPrompt, tool }));
      }
    } catch (error) {
      const started = sessions.map((session) => active.get(session.id)).filter(Boolean);
      started.forEach(({ child }) => child.kill?.());
      await Promise.allSettled(started.map(({ completion }) => completion));
      throw error;
    }
    return { ok: true, sessions };
  }

  async function activity() {
    let entries;
    try {
      entries = await readdir(sessionsRoot, { withFileTypes: true });
    } catch (error) {
      if (error?.code === 'ENOENT') return [];
      throw error;
    }
    const reports = await Promise.all(entries
      .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
      .map(async (entry) => parseSession(await readFile(join(sessionsRoot, entry.name), 'utf8'))));
    return reports.filter(Boolean).sort((left, right) => right.at.localeCompare(left.at)).map((session) => ({
      id: session.id,
      at: session.at,
      project: session.project,
      subject: session.status === 'running'
        ? 'Sesión iniciada'
        : session.status === 'completed'
          ? 'Sesión completada'
          : 'Sesión fallida',
      kind: 'session',
      agent: session.tool,
      status: session.status,
      exitCode: session.exitCode,
    }));
  }

  async function waitForIdle() {
    await Promise.all([...active.values()].map(({ completion }) => completion));
  }

  return Object.freeze({ activity, launch, waitForIdle });
}
