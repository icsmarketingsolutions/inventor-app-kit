import { cp, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const TEST_DIRECTORY = dirname(fileURLToPath(import.meta.url));
export const APP_ROOT = resolve(TEST_DIRECTORY, '../..');
export const REPOSITORY_ROOT = resolve(APP_ROOT, '../..');
export const SEED_ROOT = join(REPOSITORY_ROOT, 'memory-seed');

export async function temporaryDirectory(prefix = 'inventor-os-test-') {
  return mkdtemp(join(tmpdir(), prefix));
}

export async function withSeed() {
  const root = await temporaryDirectory();
  const seed = join(root, 'seed');
  await cp(SEED_ROOT, seed, { recursive: true });
  return { root, seed, runtime: join(root, 'runtime') };
}

export async function cleanup(path) {
  await rm(path, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
}

export async function listen(server) {
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });
  const address = server.address();
  return `http://127.0.0.1:${address.port}`;
}

export async function close(server) {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}
