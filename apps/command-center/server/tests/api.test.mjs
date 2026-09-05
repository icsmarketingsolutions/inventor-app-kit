import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, realpath, writeFile } from 'node:fs/promises';
import { request as httpRequest } from 'node:http';
import { join } from 'node:path';
import test from 'node:test';
import { createCommandCenterServer } from '../index.mjs';
import { cleanup, close, listen, withSeed } from './helpers.mjs';

async function json(response) {
  const value = await response.json();
  return { status: response.status, value };
}

async function rawJson(url, headers) {
  return new Promise((resolve, reject) => {
    const request = httpRequest(url, { headers }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => resolve({
        status: response.statusCode,
        value: JSON.parse(Buffer.concat(chunks).toString('utf8')),
      }));
    });
    request.once('error', reject);
    request.end();
  });
}

async function fixtureServer(context, options = {}) {
  const fixture = await withSeed();
  const server = await createCommandCenterServer({
    runtimeRoot: fixture.runtime,
    seedRoot: fixture.seed,
    distRoot: null,
    ...options,
  });
  const baseUrl = await listen(server);
  context.after(async () => {
    await close(server);
    await cleanup(fixture.root);
  });
  return { ...fixture, server, baseUrl };
}

function pcmWav(seconds = 1) {
  const dataBytes = Math.floor(seconds * 16_000 * 2);
  const buffer = Buffer.alloc(44 + dataBytes);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(buffer.length - 8, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(16_000, 24);
  buffer.writeUInt32LE(32_000, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataBytes, 40);
  return buffer;
}

test('health identifica el producto sin exponer datos privados', async (context) => {
  const { baseUrl, runtime } = await fixtureServer(context);
  const result = await json(await fetch(`${baseUrl}/api/health`));
  assert.deepEqual(result, { status: 200, value: { ok: true, product: 'inventor-os', version: 1 } });
  assert.equal(JSON.stringify(result).includes(runtime), false);
});

test('API persiste notas, búsquedas, capturas, directivas y grafo', async (context) => {
  const { baseUrl } = await fixtureServer(context);
  const headers = { 'content-type': 'application/json', origin: baseUrl };
  let result = await json(await fetch(`${baseUrl}/api/memory/note`, {
    method: 'POST', headers, body: JSON.stringify({ path: '20-knowledge/api.md', content: '# API\n\nMarca-cobalto-731 [[INDEX]].\n' }),
  }));
  assert.equal(result.status, 200);
  result = await json(await fetch(`${baseUrl}/api/memory/note?path=20-knowledge%2Fapi.md`, { headers: { origin: headers.origin } }));
  assert.equal(result.value.note.title, 'API');
  result = await json(await fetch(`${baseUrl}/api/memory/search?q=marca-cobalto-731`));
  assert.deepEqual(result.value.results.map((entry) => entry.path), ['20-knowledge/api.md']);
  result = await json(await fetch(`${baseUrl}/api/memory/capture`, {
    method: 'POST', headers, body: JSON.stringify({ text: 'Idea desde API' }),
  }));
  assert.equal(result.status, 201);
  result = await json(await fetch(`${baseUrl}/api/directives`, {
    method: 'POST', headers, body: JSON.stringify({ action: 'add', text: 'Revisar [[api]]' }),
  }));
  assert.equal(result.value.directives[0].text, 'Revisar [[api]]');
  result = await json(await fetch(`${baseUrl}/api/graph`));
  assert.equal(result.value.nodes.some((node) => node.id === '20-knowledge/api'), true);
  result = await json(await fetch(`${baseUrl}/api/status`));
  assert.equal(result.value.memory.inbox >= 1, true);
  assert.equal(result.value.directives.length, 1);
});

test('registro de proyecto devuelve estado Git pero nunca la ruta local', async (context) => {
  const { baseUrl, root } = await fixtureServer(context);
  const project = join(root, 'repo privado');
  execFileSync('git', ['init', '--initial-branch=main', project], { windowsHide: true });
  execFileSync('git', ['-C', project, 'config', 'user.name', 'Inventor']);
  execFileSync('git', ['-C', project, 'config', 'user.email', 'inventor@users.noreply.github.com']);
  execFileSync('git', ['-C', project, 'config', 'core.autocrlf', 'false']);
  await writeFile(join(project, 'README.md'), '# Demo\n');
  execFileSync('git', ['-C', project, 'add', 'README.md']);
  execFileSync('git', ['-C', project, 'commit', '-m', 'inicio']);
  const result = await json(await fetch(`${baseUrl}/api/projects`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Proyecto Demo', path: project }),
  }));
  assert.equal(result.status, 201);
  assert.equal(result.value.project.git.repository, true);
  assert.equal(JSON.stringify(result.value).includes(project), false);
  const listed = await json(await fetch(`${baseUrl}/api/projects`));
  assert.equal(listed.value.projects.length, 1);
  assert.equal(JSON.stringify(listed.value).includes(project), false);
});

test('bloquea Origin/Host externos, traversal, tipos y cuerpos excesivos', async (context) => {
  const { baseUrl, runtime } = await fixtureServer(context);
  let result = await json(await fetch(`${baseUrl}/api/status`, { headers: { origin: 'https://malicioso.example' } }));
  assert.equal(result.status, 403);
  assert.equal(result.value.error.code, 'LOCAL_ONLY');
  assert.equal(result.value.error.message.includes(runtime), false);
  result = await json(await fetch(`${baseUrl}/api/status`, { headers: { origin: 'http://127.0.0.1:9999' } }));
  assert.equal(result.status, 403);
  assert.equal(result.value.error.code, 'LOCAL_ONLY');
  const externalHost = await rawJson(`${baseUrl}/api/health`, { host: 'malicioso.example' });
  assert.equal(externalHost.status, 403);
  assert.equal(externalHost.value.error.code, 'LOCAL_ONLY');
  result = await json(await fetch(`${baseUrl}/api/memory/note?path=..%2Fsecret.md`));
  assert.equal(result.status, 400);
  assert.equal(result.value.error.code, 'INVALID_NOTE_PATH');
  result = await json(await fetch(`${baseUrl}/api/memory/note`, { method: 'POST', body: '{}' }));
  assert.equal(result.status, 415);
  const huge = JSON.stringify({ text: 'x'.repeat(300_000) });
  result = await json(await fetch(`${baseUrl}/api/memory/capture`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: huge,
  }));
  assert.equal(result.status, 413);
});

test('integra Foundry, Ollama y agentes usando solo IDs registrados', async (context) => {
  const calls = { chat: [], refine: [], launch: [] };
  const ollamaClient = {
    health: async () => ({ available: true, models: [{ name: 'qwen-demo', size: 1, modifiedAt: null }] }),
    chat: async (input) => {
      calls.chat.push(input);
      return { content: 'Respuesta local', model: input.model, done: true };
    },
    refine: async (input) => {
      calls.refine.push(input);
      return { objective: 'Objetivo verificable', changed: true, model: input.model };
    },
  };
  const agentOps = {
    activity: async () => [{ id: 'session-1', subject: 'Sesión completada', status: 'completed' }],
    launch: async (input) => {
      calls.launch.push(input);
      return { ok: true, sessions: [{ id: 'session-2', status: 'running' }] };
    },
  };
  const fixture = await fixtureServer(context, { ollamaClient, agentOps });
  const project = join(fixture.root, 'repo-local');
  await mkdir(project);
  let result = await json(await fetch(`${fixture.baseUrl}/api/projects`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Repo Local', path: project }),
  }));
  const projectId = result.value.project.id;
  result = await json(await fetch(`${fixture.baseUrl}/api/foundry/catalog`));
  assert.equal(result.value.modes.some((mode) => mode.id === 'plan'), true);
  result = await json(await fetch(`${fixture.baseUrl}/api/foundry/forge`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      mode: 'plan', objective: 'Diseñar el flujo', tool: 'codex', projectIds: [projectId],
      path: 'C:\\ruta\\que-no-debe-usarse',
    }),
  }));
  assert.equal(result.status, 200);
  assert.match(result.value.prompt, /Diseñar el flujo/);
  assert.equal(result.value.prompt.includes('ruta\\que-no-debe-usarse'), false);
  result = await json(await fetch(`${fixture.baseUrl}/api/ollama/status`));
  assert.equal(result.value.available, true);
  result = await json(await fetch(`${fixture.baseUrl}/api/ollama/chat`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model: 'qwen-demo', message: 'Hola local' }),
  }));
  assert.equal(result.value.content, 'Respuesta local');
  assert.equal(calls.chat[0].messages[0].content, 'Hola local');
  result = await json(await fetch(`${fixture.baseUrl}/api/foundry/refine`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model: 'qwen-demo', objective: 'hacer cosa' }),
  }));
  assert.equal(result.value.objective, 'Objetivo verificable');
  result = await json(await fetch(`${fixture.baseUrl}/api/agents/activity`));
  assert.equal(result.value.activity[0].status, 'completed');
  result = await json(await fetch(`${fixture.baseUrl}/api/agents/launch`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ tool: 'codex', projectIds: [projectId], prompt: 'Prompt seguro', confirm: true, path: 'C:\\mal' }),
  }));
  assert.equal(result.status, 202);
  assert.equal(calls.launch[0].registeredProjects[0].path, await realpath(project));
  assert.equal(Object.hasOwn(calls.launch[0], 'path'), false);
  const missionResponse = await json(await fetch(`${fixture.baseUrl}/api/foundry/forge`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ mode: 'plan', objective: 'Coordinar', tool: 'codex', projectIds: [projectId], workflow: 'team' }),
  }));
  assert.equal(missionResponse.status, 200);
  const missionId = missionResponse.value.mission.id;
  const recovered = await json(await fetch(`${fixture.baseUrl}/api/foundry/mission?id=${missionId}`));
  assert.equal(recovered.value.profiles.researcher.model, 'gpt-5.6-terra');
  const launchedMission = await json(await fetch(`${fixture.baseUrl}/api/agents/launch`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ tool: 'codex', projectIds: [projectId], prompt: missionResponse.value.prompt,
      confirm: true, model: 'gpt-6-astra', missionId, missionDirectory: 'untrusted' }),
  }));
  assert.equal(launchedMission.status, 202);
  assert.equal(calls.launch[1].model, 'gpt-6-astra');
  assert.equal(await realpath(calls.launch[1].missionDirectory), join(await realpath(fixture.runtime), 'missions', missionId));
  const mismatch = await json(await fetch(`${fixture.baseUrl}/api/agents/launch`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ tool: 'claude', projectIds: [projectId], prompt: 'x', confirm: true, missionId }),
  }));
  assert.equal(mismatch.status, 400);
  assert.equal(calls.launch.length, 2);
  result = await json(await fetch(`${fixture.baseUrl}/api/foundry/forge`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ mode: 'plan', objective: 'x', tool: 'codex', projectIds: ['no-registrado'] }),
  }));
  assert.equal(result.status, 404);
});

test('integra voz raw y selector nativo solo desde el origen local exacto', async (context) => {
  const calls = [];
  const transcriptionClient = {
    initialize: async () => {},
    status: async () => ({ available: true, state: 'ready', engine: 'whisper.cpp', model: 'base', language: 'es' }),
    transcribe: async (audio) => {
      calls.push(audio);
      return { transcript: 'idea hablada', durationSeconds: 1, language: 'es', model: 'base' };
    },
  };
  const fixture = await fixtureServer(context, {
    transcriptionClient,
    folderPicker: async (path) => ({ selected: true, path: path || 'C:\\Inventos\\Proyecto uno' }),
  });
  let result = await json(await fetch(`${fixture.baseUrl}/api/transcription/status`));
  assert.equal(result.value.available, true);
  result = await json(await fetch(`${fixture.baseUrl}/api/transcription`, {
    method: 'POST', headers: { 'content-type': 'audio/wav' }, body: pcmWav(),
  }));
  assert.equal(result.status, 403);
  result = await json(await fetch(`${fixture.baseUrl}/api/transcription`, {
    method: 'POST', headers: { 'content-type': 'application/octet-stream', origin: fixture.baseUrl }, body: pcmWav(),
  }));
  assert.equal(result.status, 415);
  result = await json(await fetch(`${fixture.baseUrl}/api/transcription`, {
    method: 'POST', headers: { 'content-type': 'audio/wav', origin: fixture.baseUrl }, body: Buffer.from('RIFF roto'),
  }));
  assert.equal(result.status, 422);
  result = await json(await fetch(`${fixture.baseUrl}/api/transcription`, {
    method: 'POST', headers: { 'content-type': 'audio/wav', origin: fixture.baseUrl }, body: pcmWav(),
  }));
  assert.equal(result.status, 200);
  assert.equal(result.value.transcript, 'idea hablada');
  assert.equal(calls.length, 1);
  result = await json(await fetch(`${fixture.baseUrl}/api/system/select-folder`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
  }));
  assert.equal(result.status, 403);
  result = await json(await fetch(`${fixture.baseUrl}/api/system/select-folder`, {
    method: 'POST', headers: { origin: fixture.baseUrl, 'content-type': 'application/json' }, body: '{}',
  }));
  assert.equal(result.value.selected, true);
  assert.equal(result.value.path, 'C:\\Inventos\\Proyecto uno');
});

test('cerrar el cliente aborta el selector pendiente', async (context) => {
  let announceStarted;
  const started = new Promise((resolvePromise) => { announceStarted = resolvePromise; });
  let aborted = false;
  const fixture = await fixtureServer(context, {
    folderPicker: async (_path, { signal }) => new Promise((_resolve, reject) => {
      announceStarted();
      signal.addEventListener('abort', () => {
        aborted = true;
        reject(new Error('aborted by client'));
      }, { once: true });
    }),
  });
  const controller = new AbortController();
  const pending = fetch(`${fixture.baseUrl}/api/system/select-folder`, {
    method: 'POST',
    headers: { origin: fixture.baseUrl, 'content-type': 'application/json' },
    body: '{}',
    signal: controller.signal,
  });
  await started;
  controller.abort();
  await assert.rejects(pending, (error) => error.name === 'AbortError');
  await new Promise((resolvePromise) => setTimeout(resolvePromise, 20));
  assert.equal(aborted, true);
});

test('sirve dist y usa index.html como fallback sin permitir salir de dist', async (context) => {
  const fixture = await withSeed();
  const dist = join(fixture.root, 'dist');
  await mkdir(join(dist, 'assets'), { recursive: true });
  await writeFile(join(dist, 'index.html'), '<!doctype html><title>Inventor OS</title>');
  await writeFile(join(dist, 'assets', 'app.js'), 'globalThis.app = true;');
  const server = await createCommandCenterServer({ runtimeRoot: fixture.runtime, seedRoot: fixture.seed, distRoot: dist });
  const baseUrl = await listen(server);
  context.after(async () => { await close(server); await cleanup(fixture.root); });
  let response = await fetch(`${baseUrl}/assets/app.js`);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /javascript/);
  assert.match(response.headers.get('content-security-policy'), /default-src 'self'/);
  assert.equal(response.headers.get('x-frame-options'), 'DENY');
  assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
  assert.equal(response.headers.get('permissions-policy'), 'microphone=(self), camera=(), geolocation=()');
  response = await fetch(`${baseUrl}/pantalla/local`);
  assert.equal(response.status, 200);
  assert.match(await response.text(), /Inventor OS/);
  response = await fetch(`${baseUrl}/%2e%2e%2f%2e%2e%2fsecret.txt`);
  assert.notEqual(response.status, 200);
});
