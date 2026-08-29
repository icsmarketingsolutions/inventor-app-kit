import { createReadStream } from 'node:fs';
import { lstat, realpath, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAgentOps } from '../features/agent-ops.mjs';
import { OllamaError, createOllamaClient } from '../features/ollama.mjs';
import { forgePrompt, listFoundryCatalog } from '../features/prompt-foundry.mjs';
import { AppError, publicError } from './errors.mjs';
import { projectsStatus } from './git.mjs';
import {
  buildGraph,
  captureNote,
  listNotes,
  readDirectives,
  readNote,
  searchNotes,
  updateDirectives,
  writeNote,
} from './memory.mjs';
import { allowedOrigin, readJsonBody, requestIsLocal } from './security.mjs';
import { addProject, initializeRuntime, readConfig } from './storage.mjs';

const CURRENT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const DEFAULT_APP_ROOT = resolve(CURRENT_DIRECTORY, '../..');
const DEFAULT_REPOSITORY_ROOT = resolve(DEFAULT_APP_ROOT, '../..');
const MIME_TYPES = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.ico', 'image/x-icon'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.map', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
  ['.txt', 'text/plain; charset=utf-8'],
  ['.webmanifest', 'application/manifest+json'],
  ['.woff2', 'font/woff2'],
]);
const SECURITY_HEADERS = Object.freeze({
  'Content-Security-Policy': "default-src 'self'; base-uri 'none'; connect-src 'self'; font-src 'self'; form-action 'none'; frame-ancestors 'none'; img-src 'self' data:; object-src 'none'; script-src 'self'; style-src 'self'",
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
});

function sendJson(response, status, value, extraHeaders = {}) {
  const body = Buffer.from(JSON.stringify(value));
  response.writeHead(status, {
    'Cache-Control': 'no-store',
    'Content-Length': body.length,
    'Content-Type': 'application/json; charset=utf-8',
    ...SECURITY_HEADERS,
    ...extraHeaders,
  });
  response.end(body);
}

function corsHeaders(request) {
  const origin = request.headers.origin;
  return origin && allowedOrigin(origin, request.headers.host)
    ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' }
    : {};
}

async function exists(path) {
  try {
    return await stat(path);
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

function staticTarget(distRoot, pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    throw new AppError(400, 'INVALID_URL', 'La URL no es válida.');
  }
  if (decoded.includes('\0') || decoded.includes('\\')) {
    throw new AppError(400, 'INVALID_URL', 'La URL no es válida.');
  }
  const target = resolve(distRoot, `.${decoded}`);
  const fromRoot = relative(resolve(distRoot), target);
  if (fromRoot.startsWith(`..${sep}`) || fromRoot === '..' || isAbsolute(fromRoot)) {
    throw new AppError(400, 'INVALID_URL', 'La URL no es válida.');
  }
  return target;
}

async function safeStaticFile(distRoot, pathname) {
  const target = staticTarget(distRoot, pathname === '/' ? '/index.html' : pathname);
  const info = await exists(target);
  if (!info?.isFile()) return null;
  const targetInfo = await lstat(target);
  if (targetInfo.isSymbolicLink()) return null;
  const [canonicalRoot, canonicalTarget] = await Promise.all([realpath(distRoot), realpath(target)]);
  const fromRoot = relative(canonicalRoot, canonicalTarget);
  if (fromRoot.startsWith(`..${sep}`) || fromRoot === '..' || isAbsolute(fromRoot)) return null;
  return { target, size: info.size };
}

async function serveStatic(request, response, distRoot, pathname) {
  if (!distRoot || !(await exists(distRoot))) return false;
  let file = await safeStaticFile(distRoot, pathname);
  let spaFallback = false;
  if (!file && !extname(pathname)) {
    file = await safeStaticFile(distRoot, '/index.html');
    spaFallback = Boolean(file);
  }
  if (!file) return false;
  const extension = extname(file.target).toLowerCase();
  response.writeHead(200, {
    'Cache-Control': spaFallback || extension === '.html' ? 'no-store' : 'public, max-age=31536000, immutable',
    'Content-Length': file.size,
    'Content-Type': MIME_TYPES.get(extension) || 'application/octet-stream',
    ...SECURITY_HEADERS,
  });
  if (request.method === 'HEAD') response.end();
  else createReadStream(file.target).pipe(response);
  return true;
}

async function apiStatus(context) {
  const [notes, config, directives] = await Promise.all([
    listNotes(context.memoryRoot),
    readConfig(context.configPath),
    readDirectives(context.memoryRoot),
  ]);
  const projects = await projectsStatus(config.projects);
  return {
    ok: true,
    storage: 'local',
    memory: {
      notes: notes.length,
      inbox: notes.filter((note) => note.path.startsWith('00-inbox/') && !note.path.endsWith('/README.md')).length,
    },
    projects: { total: projects.length, available: projects.filter((project) => project.available).length },
    directives,
  };
}

function registeredProjects(projects, projectIds, maximum = 25) {
  if (!Array.isArray(projectIds) || projectIds.length === 0 || projectIds.length > maximum
    || projectIds.some((id) => typeof id !== 'string' || !id)
    || new Set(projectIds).size !== projectIds.length) {
    throw new AppError(400, 'INVALID_PROJECT_SELECTION', `Seleccioná entre 1 y ${maximum} proyectos registrados.`);
  }
  const byId = new Map(projects.map((project) => [project.id, project]));
  const selected = projectIds.map((id) => byId.get(id));
  if (selected.some((project) => !project)) {
    throw new AppError(404, 'PROJECT_NOT_REGISTERED', 'Uno de los proyectos no está registrado.');
  }
  return selected;
}

function safeOllamaError(error) {
  if (error instanceof AppError) return error;
  if (error instanceof OllamaError) {
    const status = error.code === 'TIMEOUT' ? 504 : error.status && error.status >= 400 ? 502 : 503;
    return new AppError(status, `OLLAMA_${error.code}`, error.message);
  }
  if (error instanceof TypeError || error instanceof RangeError) {
    return new AppError(400, 'INVALID_OLLAMA_REQUEST', error.message);
  }
  return error;
}

async function handleApi(request, response, url, context) {
  const headers = corsHeaders(request);
  if (request.method === 'OPTIONS') {
    response.writeHead(204, {
      ...headers,
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Max-Age': '600',
    });
    response.end();
    return;
  }
  if (request.method === 'GET' && url.pathname === '/api/health') {
    sendJson(response, 200, { ok: true, product: 'inventor-os', version: 1 }, headers);
    return;
  }
  if (request.method === 'GET' && url.pathname === '/api/status') {
    sendJson(response, 200, await apiStatus(context), headers);
    return;
  }
  if (request.method === 'GET' && url.pathname === '/api/projects') {
    const config = await readConfig(context.configPath);
    sendJson(response, 200, { projects: await projectsStatus(config.projects) }, headers);
    return;
  }
  if (request.method === 'GET' && url.pathname === '/api/memory/notes') {
    sendJson(response, 200, { notes: await listNotes(context.memoryRoot) }, headers);
    return;
  }
  if (request.method === 'GET' && url.pathname === '/api/memory/search') {
    sendJson(response, 200, { results: await searchNotes(context.memoryRoot, url.searchParams.get('q') || '') }, headers);
    return;
  }
  if (request.method === 'GET' && url.pathname === '/api/memory/note') {
    sendJson(response, 200, { note: await readNote(context.memoryRoot, url.searchParams.get('path') || '') }, headers);
    return;
  }
  if (request.method === 'GET' && url.pathname === '/api/graph') {
    sendJson(response, 200, await buildGraph(context.memoryRoot), headers);
    return;
  }
  if (request.method === 'GET' && url.pathname === '/api/foundry/catalog') {
    sendJson(response, 200, await listFoundryCatalog({ foundryRoot: context.foundryRoot }), headers);
    return;
  }
  if (request.method === 'GET' && url.pathname === '/api/ollama/status') {
    sendJson(response, 200, await context.ollama.health(), headers);
    return;
  }
  if (request.method === 'GET' && url.pathname === '/api/agents/activity') {
    sendJson(response, 200, { activity: await context.agentOps.activity() }, headers);
    return;
  }
  if (request.method !== 'POST') {
    throw new AppError(404, 'API_NOT_FOUND', 'La ruta de API no existe.');
  }
  const input = await readJsonBody(request);
  if (url.pathname === '/api/projects') {
    const project = await addProject(context.configPath, input);
    sendJson(response, 201, { project: await projectsStatus([project]).then(([value]) => value) }, headers);
    return;
  }
  if (url.pathname === '/api/memory/note') {
    sendJson(response, 200, { note: await writeNote(context.memoryRoot, input.path, input.content) }, headers);
    return;
  }
  if (url.pathname === '/api/memory/capture') {
    sendJson(response, 201, { note: await captureNote(context.memoryRoot, input.text) }, headers);
    return;
  }
  if (url.pathname === '/api/directives') {
    sendJson(response, 200, { directives: await updateDirectives(context.memoryRoot, input) }, headers);
    return;
  }
  if (url.pathname === '/api/foundry/forge') {
    const config = await readConfig(context.configPath);
    const projects = registeredProjects(config.projects, input.projectIds);
    try {
      const catalog = await listFoundryCatalog({ foundryRoot: context.foundryRoot });
      if (!catalog.modes.some((mode) => mode.id === input.mode) || !catalog.tools.includes(input.tool)) {
        throw new AppError(400, 'INVALID_FOUNDRY_REQUEST', 'Elegí un modo y un agente disponibles.');
      }
      const prompt = await forgePrompt({
        mode: input.mode,
        objective: input.objective,
        tool: input.tool,
        projects,
        baseDirectory: context.repositoryRoot,
        foundryRoot: context.foundryRoot,
      });
      sendJson(response, 200, { prompt }, headers);
    } catch (error) {
      if (error instanceof AppError) throw error;
      if (error instanceof TypeError || error instanceof RangeError) {
        throw new AppError(400, 'INVALID_FOUNDRY_REQUEST', error.message);
      }
      throw error;
    }
    return;
  }
  if (url.pathname === '/api/foundry/refine') {
    try {
      sendJson(response, 200, await context.ollama.refine({ model: input.model, objective: input.objective }), headers);
    } catch (error) {
      throw safeOllamaError(error);
    }
    return;
  }
  if (url.pathname === '/api/ollama/chat') {
    try {
      const result = await context.ollama.chat({
        model: input.model,
        messages: [{ role: 'user', content: input.message }],
      });
      sendJson(response, 200, { content: result.content, model: result.model, done: result.done }, headers);
    } catch (error) {
      throw safeOllamaError(error);
    }
    return;
  }
  if (url.pathname === '/api/agents/launch') {
    const config = await readConfig(context.configPath);
    registeredProjects(config.projects, input.projectIds, 8);
    const launched = await context.agentOps.launch({
      tool: input.tool,
      projectIds: input.projectIds,
      prompt: input.prompt,
      confirm: input.confirm,
      registeredProjects: config.projects,
    });
    sendJson(response, 202, launched, headers);
    return;
  }
  throw new AppError(404, 'API_NOT_FOUND', 'La ruta de API no existe.');
}

export async function createCommandCenterServer(options = {}) {
  const appRoot = resolve(options.appRoot || DEFAULT_APP_ROOT);
  const repositoryRoot = resolve(options.repositoryRoot || DEFAULT_REPOSITORY_ROOT);
  const runtimeRoot = resolve(options.runtimeRoot || process.env.INVENTOR_OS_HOME || join(appRoot, '.runtime'));
  const seedRoot = resolve(options.seedRoot || join(repositoryRoot, 'memory-seed'));
  const distRoot = options.distRoot === null ? null : resolve(options.distRoot || join(appRoot, 'dist'));
  const context = await initializeRuntime({ runtimeRoot, seedRoot });
  context.repositoryRoot = repositoryRoot;
  context.foundryRoot = resolve(options.foundryRoot || join(repositoryRoot, 'foundry'));
  context.ollama = options.ollamaClient || createOllamaClient({
    baseUrl: options.ollamaUrl || process.env.OLLAMA_HOST || undefined,
    timeoutMs: options.ollamaTimeoutMs || 20_000,
  });
  context.agentOps = options.agentOps || createAgentOps({ memoryRoot: context.memoryRoot });
  const server = createServer(async (request, response) => {
    try {
      if (!requestIsLocal(request) || !allowedOrigin(request.headers.origin, request.headers.host)) {
        throw new AppError(403, 'LOCAL_ONLY', 'Este servicio solo acepta solicitudes locales.');
      }
      const url = new URL(request.url || '/', 'http://127.0.0.1');
      if (url.pathname.startsWith('/api/')) {
        await handleApi(request, response, url, context);
        return;
      }
      if ((request.method === 'GET' || request.method === 'HEAD')
        && await serveStatic(request, response, distRoot, url.pathname)) return;
      throw new AppError(404, 'NOT_FOUND', 'El recurso no existe.');
    } catch (error) {
      if (response.headersSent) {
        response.destroy();
        return;
      }
      const result = publicError(error);
      sendJson(response, result.status, result.body, corsHeaders(request));
    }
  });
  server.context = Object.freeze({ ...context, appRoot, repositoryRoot, distRoot });
  server.on('clientError', (_error, socket) => {
    socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');
  });
  return server;
}
