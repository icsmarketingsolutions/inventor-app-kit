import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { runInNewContext } from 'node:vm';

const root = resolve(import.meta.dirname, '..');
const desktopRoot = join(root, 'templates', 'web-app', 'scripts', 'desktop');

test('todos los scripts de escritorio tienen sintaxis PowerShell válida', () => {
  for (const name of readdirSync(desktopRoot).filter((entry) => entry.endsWith('.ps1'))) {
    const path = join(desktopRoot, name);
    const result = spawnSync('pwsh', [
      '-NoProfile',
      '-Command',
      '$tokens=$null;$errors=$null;$path=$env:INVENTOR_DESKTOP_SCRIPT;[Management.Automation.Language.Parser]::ParseFile($path,[ref]$tokens,[ref]$errors)|Out-Null;if($errors.Count){$errors|ForEach-Object{$_.Message};exit 1}',
    ], {
      encoding: 'utf8',
      env: { ...process.env, INVENTOR_DESKTOP_SCRIPT: path },
      windowsHide: true,
    });
    assert.equal(result.status, 0, `${name}: ${result.stderr}${result.stdout}`);
  }
});

test('solo acepta URL y llave publicable del Supabase local', () => {
  const common = join(desktopRoot, 'desktop-common.ps1');
  const command = [
    '. $env:INVENTOR_DESKTOP_COMMON',
    "$key = 'sb_' + 'publishable_' + ('A' * 24)",
    "$local = ConvertFrom-InventorSupabaseStatus -Json ((@{API_URL='http://127.0.0.1:54321';PUBLISHABLE_KEY=$key}) | ConvertTo-Json -Compress)",
    "$blocked=$false;try{ConvertFrom-InventorSupabaseStatus -Json ((@{API_URL='https://example.supabase.co';PUBLISHABLE_KEY=$key}) | ConvertTo-Json -Compress)|Out-Null}catch{$blocked=$true}",
    "@{local=($local.ApiUrl -eq 'http://127.0.0.1:54321');blocked=$blocked;length=$local.PublishableKey.Length}|ConvertTo-Json -Compress",
  ].join(';');
  const result = spawnSync('pwsh', ['-NoProfile', '-Command', command], {
    encoding: 'utf8',
    env: { ...process.env, INVENTOR_DESKTOP_COMMON: common },
    windowsHide: true,
  });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout.trim()), { blocked: true, length: 39, local: true });
});

test('solo acepta el motor Docker Desktop local', () => {
  const common = join(desktopRoot, 'desktop-common.ps1');
  const command = [
    '. $env:INVENTOR_DESKTOP_COMMON',
    "$local=Test-InventorDockerEndpointValue -Endpoint 'npipe:////./pipe/dockerDesktopLinuxEngine'",
    "$remote=Test-InventorDockerEndpointValue -Endpoint 'ssh://builder.example.test'",
    '@{local=$local;remote=$remote}|ConvertTo-Json -Compress',
  ].join(';');
  const result = spawnSync('pwsh', ['-NoProfile', '-Command', command], {
    encoding: 'utf8',
    env: { ...process.env, INVENTOR_DESKTOP_COMMON: common },
    windowsHide: true,
  });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout.trim()), { local: true, remote: false });
});

test('conserva la hora UTC aunque ConvertFrom-Json la convierta en DateTime', () => {
  const common = join(desktopRoot, 'desktop-common.ps1');
  const command = [
    '. $env:INVENTOR_DESKTOP_COMMON',
    "$value=('{\"startedAtUtc\":\"2026-08-27T20:47:55.3940068Z\"}'|ConvertFrom-Json).startedAtUtc",
    '$utc=ConvertTo-InventorUtcDate -Value $value',
    "$utc.ToString('O')",
  ].join(';');
  const result = spawnSync('pwsh', ['-NoProfile', '-Command', command], {
    encoding: 'utf8',
    env: { ...process.env, INVENTOR_DESKTOP_COMMON: common },
    windowsHide: true,
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), '2026-08-27T20:47:55.3940068Z');
});

test('el service worker usa shell solo para navegación y nunca como JavaScript', async () => {
  const source = readFileSync(join(root, 'templates', 'web-app', 'public', 'service-worker.js'), 'utf8');
  let fetchHandler;
  const shell = new Response('<main>offline</main>', { headers: { 'content-type': 'text/html' } });
  const caches = {
    delete: async () => true,
    keys: async () => [],
    match: async (request) => request === '/' ? shell.clone() : undefined,
    open: async () => ({ addAll: async () => undefined, put: async () => undefined }),
  };
  const self = {
    addEventListener: (name, handler) => { if (name === 'fetch') fetchHandler = handler; },
    clients: { claim: () => undefined },
    location: { origin: 'http://127.0.0.1:5173' },
    skipWaiting: () => undefined,
  };
  runInNewContext(source, {
    URL,
    Response,
    caches,
    fetch: async () => { throw new Error('offline'); },
    self,
  });
  assert.equal(typeof fetchHandler, 'function');

  async function dispatch(request) {
    let responsePromise;
    fetchHandler({
      request,
      respondWith: (promise) => { responsePromise = promise; },
      waitUntil: () => undefined,
    });
    return responsePromise;
  }

  const scriptResponse = await dispatch({
    destination: 'script', method: 'GET', mode: 'no-cors', url: 'http://127.0.0.1:5173/assets/app.js',
  });
  assert.equal(scriptResponse.type, 'error');

  const navigationResponse = await dispatch({
    destination: 'document', method: 'GET', mode: 'navigate', url: 'http://127.0.0.1:5173/otra-ruta',
  });
  assert.equal(await navigationResponse.text(), '<main>offline</main>');
});

test('el primer install del service worker precachea JS y CSS hasheados', async () => {
  const source = readFileSync(join(root, 'templates', 'web-app', 'public', 'service-worker.js'), 'utf8');
  let installHandler;
  const added = [];
  const stored = [];
  const cache = {
    addAll: async (paths) => { added.push(...paths); },
    put: async (key) => { stored.push(key); },
  };
  const self = {
    addEventListener: (name, handler) => { if (name === 'install') installHandler = handler; },
    clients: { claim: () => undefined },
    location: { origin: 'https://app.example.test' },
    skipWaiting: () => undefined,
  };
  const buildHtml = [
    '<!doctype html><html><head>',
    '<script type="module" src="/assets/index-abc123.js"></script>',
    '<link rel="stylesheet" href="/assets/index-def456.css">',
    '</head></html>',
  ].join('');
  runInNewContext(source, {
    URL,
    Response,
    caches: {
      delete: async () => true,
      keys: async () => [],
      match: async () => undefined,
      open: async () => cache,
    },
    fetch: async () => new Response(buildHtml, { status: 200 }),
    self,
  });
  assert.equal(typeof installHandler, 'function');
  let installPromise;
  installHandler({ waitUntil: (promise) => { installPromise = promise; } });
  await installPromise;
  assert.ok(added.includes('/assets/index-abc123.js'));
  assert.ok(added.includes('/assets/index-def456.css'));
  assert.ok(stored.includes('/'));
});

test('el lanzador conserva credenciales en memoria y nunca borra datos al detener', () => {
  const start = readFileSync(join(desktopRoot, 'start-app.ps1'), 'utf8');
  const stop = readFileSync(join(desktopRoot, 'stop-app.ps1'), 'utf8');
  const bridge = readFileSync(join(desktopRoot, 'start-app.vbs'), 'utf8');
  const gitignore = readFileSync(join(root, 'templates', 'web-app', '.gitignore'), 'utf8');
  const viteConfig = readFileSync(join(root, 'templates', 'web-app', 'vite.config.ts'), 'utf8');

  assert.match(start, /PUBLISHABLE_KEY/);
  assert.doesNotMatch(start, /SERVICE_ROLE_KEY/);
  assert.match(start, /--no-install', 'supabase', 'start/);
  assert.match(start, /'migration', 'up', '--local'/);
  assert.match(start, /\$quotedVite = '\"' \+ \$vite \+ '\"'/);
  assert.match(start, /-ArgumentList @\(\$quotedVite/);
  assert.match(stop, /--no-install', 'supabase', 'stop/);
  assert.doesNotMatch(stop, /--no-backup/);
  assert.match(start, /\$supabaseStartedHere = \$true/);
  assert.match(start, /Reversion: Supabase iniciado por esta llamada fue detenido/);
  assert.match(start, /\$viteProcess\.Kill\(\$true\)/);
  assert.match(start, /Local\\InventorApp-DesktopServices/);
  assert.match(stop, /Local\\InventorApp-DesktopServices/);
  assert.match(start, /--user-data-dir=/);
  assert.match(readFileSync(join(desktopRoot, 'desktop-common.ps1'), 'utf8'), /\$env:DOCKER_HOST/);
  const common = readFileSync(join(desktopRoot, 'desktop-common.ps1'), 'utf8');
  assert.match(common, /\.Equals\(\$script:inventorDesktopTitle/);
  assert.doesNotMatch(common, /StartsWith\(\$script:inventorDesktopTitle/);
  assert.match(common, /PostMessage/);
  assert.match(start, /--disable-background-mode/);
  assert.match(stop, /Close-InventorAppWindow/);
  assert.match(stop, /Apagado incompleto/);
  assert.match(stop, /exit 1/);
  assert.match(stop, /Test-InventorDockerEndpointLocal/);
  assert.match(stop, /windowCloseResult -eq 'failed'/);
  assert.match(stop, /Vite no termino en 10 segundos/);
  assert.match(start, /El contexto Docker dejo de ser local/);
  assert.doesNotMatch(`${start}\n${stop}`, /Invoke-Expression/);
  assert.match(bridge, /shell\.Run command, 0, False/);
  assert.match(gitignore, /^\.desktop\/$/m);
  assert.match(viteConfig, /ignored: \['\*\*\/\.desktop\/\*\*'\]/);
  assert.match(start, /La ventana se abrio, pero Vite dejo de responder/);
});

test('el manifiesto PWA declara identidad, modo standalone e icono vectorial', () => {
  const manifest = JSON.parse(readFileSync(
    join(root, 'templates', 'web-app', 'public', 'manifest.webmanifest'),
    'utf8',
  ));
  assert.equal(manifest.id, '/apps/__INVENTOR_APP_SLUG__');
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.prefer_related_applications, false);
  assert.ok(manifest.icons.some((icon) => icon.sizes === '192x192' && icon.type === 'image/png'));
  assert.ok(manifest.icons.some((icon) => icon.sizes === '512x512' && icon.type === 'image/png'));
  assert.ok(manifest.icons.some((icon) => icon.sizes === 'any' && icon.type === 'image/svg+xml'));
  const serviceWorker = readFileSync(join(root, 'templates', 'web-app', 'public', 'service-worker.js'), 'utf8');
  const entry = readFileSync(join(root, 'templates', 'web-app', 'src', 'main.tsx'), 'utf8');
  assert.match(serviceWorker, /addEventListener\('fetch'/);
  assert.match(serviceWorker, /if \(event\.request\.mode === 'navigate'\)/);
  assert.match(serviceWorker, /return Response\.error\(\)/);
  assert.match(serviceWorker, /requestUrl\.pathname\.startsWith\('\/assets\/'\)/);
  assert.doesNotMatch(serviceWorker, /cached \|\| caches\.match\('\/'\)/);
  assert.match(entry, /serviceWorker\.register\('\/service-worker\.js'\)/);
});
