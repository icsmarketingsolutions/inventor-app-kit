import { pathToFileURL } from 'node:url';
import { createCommandCenterServer } from './core/app.mjs';

function positivePort(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 && parsed <= 65535 ? parsed : fallback;
}

export { createCommandCenterServer };

export async function startCommandCenter(options = {}) {
  const development = options.development === undefined
    ? process.env.INVENTOR_OS_DEV === '1' || process.argv.includes('--dev')
    : Boolean(options.development);
  const defaultPort = development ? 8322 : 8421;
  const port = positivePort(options.port ?? process.env.INVENTOR_OS_PORT, defaultPort);
  const server = await createCommandCenterServer(options);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });
  return server;
}

const launchedDirectly = process.argv[1]
  && import.meta.url === pathToFileURL(process.argv[1]).href;

if (launchedDirectly) {
  const server = await startCommandCenter();
  const address = server.address();
  process.stdout.write(`Inventor OS local listo en http://127.0.0.1:${address.port}\n`);
}
