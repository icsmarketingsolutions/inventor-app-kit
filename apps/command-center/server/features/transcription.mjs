import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { lstat, mkdir, readFile, realpath, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { AppError } from '../core/errors.mjs';

const TRANSCRIPTION_MAX_BYTES = 5 * 1024 * 1024;
const TRANSCRIPTION_MAX_SECONDS = 120;
const TRANSCRIPTION_TIMEOUT_MS = 180_000;
const MAX_PROCESS_OUTPUT_BYTES = 512 * 1024;
const EXPECTED_SAMPLE_RATE = 16_000;
const EXPECTED_CHANNELS = 1;
const EXPECTED_BITS = 16;
const MODEL_SHA256 = '60ed5bc3dd14eea856493d334349b405782ddcaf0028d4b5df4088345fba2efe';
const WINDOWS_BINARY_HASHES = Object.freeze({
  'ggml-base.dll': 'cb1dfa532b8bf14c3cd54d8bd7ef12b8d07d3f7d85dbef01c135c1475e08ed38',
  'ggml-cpu-alderlake.dll': '660886106a61537002c52cf0c7021bc8a8060174cc802ed650b9bfb77eb9183a',
  'ggml-cpu-cannonlake.dll': 'aab6d7e3c1707bd7cbb4da2061fd59fee5d6e3f4fe71606ab1a43ac814f1d89f',
  'ggml-cpu-cascadelake.dll': 'bef920f38f26432fa456ad7beda8a35b11d8719d10d198c08e61d1bc33c0ba40',
  'ggml-cpu-haswell.dll': 'f52a4824868b8d9ac48f814edeb4f7382e28371f093ef6e115077fb7125bf830',
  'ggml-cpu-icelake.dll': '161baa9fb0061df74d0f0d83339a68890b2be1ba22b6b406d9a0ea23dbf89628',
  'ggml-cpu-sandybridge.dll': 'e5cb5b8ecbc52ffc05d54f8456db41eb17036bb6848592f7df8666f0ade12cdb',
  'ggml-cpu-skylakex.dll': '4784b7f45e7b5199981e7ba8c391cd1b5d4aa74413a0929cfd0a6d909098c30e',
  'ggml-cpu-sse42.dll': '674320166d86f18573f8e0e99efcdb90cfa6b7b05b42d9465976ef5e70e5e4a3',
  'ggml-cpu-x64.dll': 'ffc1938f2ce3b52cef0e0935c6ce953bb5cc5593757ea55872ae4c4ee8bd577a',
  'ggml.dll': '4e77ead4ecc32324f9432acb06ee71444708880ca6780c918baa6903389ba257',
  'whisper-cli.exe': '800a0fd754afa75e109c7248286ad735670fb6b23d92ca5d12604647ef638a65',
  'whisper.dll': '0a29e5824c7495185b833ad07df7ab9cadf130a9be848f967c6b88aeca971566',
});

function publicUnavailable() {
  return {
    available: false,
    state: 'off',
    engine: 'whisper.cpp',
    model: 'base',
    language: 'es',
    message: 'Instalá el motor local una vez con: npm run voice:install',
  };
}

function readAscii(buffer, start, length) {
  return buffer.subarray(start, start + length).toString('ascii');
}

export function validatePcmWav(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 44) {
    throw new AppError(422, 'INVALID_WAV', 'El audio WAV no es válido.');
  }
  if (buffer.length > TRANSCRIPTION_MAX_BYTES) {
    throw new AppError(413, 'AUDIO_TOO_LARGE', 'La grabación supera el límite de 120 segundos.');
  }
  if (readAscii(buffer, 0, 4) !== 'RIFF' || readAscii(buffer, 8, 4) !== 'WAVE') {
    throw new AppError(422, 'INVALID_WAV', 'El audio WAV no es válido.');
  }
  const declaredRiffSize = buffer.readUInt32LE(4) + 8;
  if (declaredRiffSize !== buffer.length || declaredRiffSize < 44) {
    throw new AppError(422, 'INVALID_WAV', 'El audio WAV está incompleto.');
  }

  let format = null;
  let dataBytes = null;
  let formatChunks = 0;
  let dataChunks = 0;
  let offset = 12;
  while (offset + 8 <= declaredRiffSize) {
    const chunkId = readAscii(buffer, offset, 4);
    const chunkSize = buffer.readUInt32LE(offset + 4);
    const chunkStart = offset + 8;
    const chunkEnd = chunkStart + chunkSize;
    if (chunkEnd > declaredRiffSize || chunkEnd > buffer.length) {
      throw new AppError(422, 'INVALID_WAV', 'El audio WAV está incompleto.');
    }
    if (chunkId === 'fmt ') {
      formatChunks += 1;
      if (formatChunks > 1) throw new AppError(422, 'INVALID_WAV', 'El formato WAV está duplicado.');
      if (chunkSize < 16) throw new AppError(422, 'INVALID_WAV', 'El formato WAV no es válido.');
      format = {
        audioFormat: buffer.readUInt16LE(chunkStart),
        channels: buffer.readUInt16LE(chunkStart + 2),
        sampleRate: buffer.readUInt32LE(chunkStart + 4),
        byteRate: buffer.readUInt32LE(chunkStart + 8),
        blockAlign: buffer.readUInt16LE(chunkStart + 12),
        bitsPerSample: buffer.readUInt16LE(chunkStart + 14),
      };
    }
    if (chunkId === 'data') {
      dataChunks += 1;
      if (dataChunks > 1) throw new AppError(422, 'INVALID_WAV', 'El audio WAV contiene datos duplicados.');
      dataBytes = chunkSize;
    }
    offset = chunkEnd + (chunkSize % 2);
  }

  if (offset !== declaredRiffSize || formatChunks !== 1 || dataChunks !== 1
    || !format || dataBytes === null || dataBytes === 0) {
    throw new AppError(422, 'INVALID_WAV', 'La grabación WAV no contiene audio.');
  }
  if (format.audioFormat !== 1 || format.channels !== EXPECTED_CHANNELS
    || format.sampleRate !== EXPECTED_SAMPLE_RATE || format.bitsPerSample !== EXPECTED_BITS
    || format.blockAlign !== 2 || format.byteRate !== 32_000) {
    throw new AppError(422, 'UNSUPPORTED_WAV', 'Usá audio WAV PCM mono de 16 kHz y 16 bits.');
  }
  if (dataBytes % format.blockAlign !== 0) {
    throw new AppError(422, 'INVALID_WAV', 'La grabación WAV está dañada.');
  }
  const durationSeconds = dataBytes / format.byteRate;
  if (durationSeconds > TRANSCRIPTION_MAX_SECONDS) {
    throw new AppError(413, 'AUDIO_TOO_LONG', 'La grabación supera el límite de 120 segundos.');
  }
  if (durationSeconds < 0.15) {
    throw new AppError(422, 'AUDIO_TOO_SHORT', 'Grabá al menos un instante antes de transcribir.');
  }
  return { durationSeconds, dataBytes };
}

export async function readWavBody(request, limit = TRANSCRIPTION_MAX_BYTES) {
  const contentType = String(request.headers['content-type'] || '').split(';', 1)[0].trim().toLowerCase();
  if (contentType !== 'audio/wav') {
    throw new AppError(415, 'WAV_REQUIRED', 'Se requiere Content-Type audio/wav.');
  }
  const declared = Number(request.headers['content-length'] || 0);
  if (Number.isFinite(declared) && declared > limit) {
    throw new AppError(413, 'AUDIO_TOO_LARGE', 'La grabación supera el límite permitido.');
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > limit) {
      throw new AppError(413, 'AUDIO_TOO_LARGE', 'La grabación supera el límite permitido.');
    }
    chunks.push(chunk);
  }
  const buffer = Buffer.concat(chunks);
  validatePcmWav(buffer);
  return buffer;
}

async function trustedFile(root, path) {
  const info = await lstat(path);
  if (!info.isFile() || info.isSymbolicLink()) throw new Error('not a trusted file');
  const [canonicalRoot, canonicalPath] = await Promise.all([realpath(root), realpath(path)]);
  const fromRoot = relative(canonicalRoot, canonicalPath);
  if (!fromRoot || fromRoot.startsWith(`..${sep}`) || fromRoot === '..' || isAbsolute(fromRoot)) {
    throw new Error('outside trusted root');
  }
  return canonicalPath;
}

async function trustedDirectory(root, path) {
  const info = await lstat(path);
  if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('not a trusted directory');
  const [canonicalRoot, canonicalPath] = await Promise.all([realpath(root), realpath(path)]);
  const fromRoot = relative(canonicalRoot, canonicalPath);
  if (!fromRoot || fromRoot.startsWith(`..${sep}`) || fromRoot === '..' || isAbsolute(fromRoot)) {
    throw new Error('outside trusted root');
  }
  return canonicalPath;
}

function sha256File(path) {
  return new Promise((resolvePromise, rejectPromise) => {
    const hash = createHash('sha256');
    const stream = createReadStream(path);
    stream.on('error', rejectPromise);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolvePromise(hash.digest('hex')));
  });
}

async function safeJobsRoot(voiceRoot) {
  const jobsRoot = join(voiceRoot, 'jobs');
  await mkdir(jobsRoot, { recursive: true, mode: 0o700 });
  const info = await lstat(jobsRoot);
  if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('unsafe jobs root');
  const [canonicalRoot, canonicalJobs] = await Promise.all([realpath(voiceRoot), realpath(jobsRoot)]);
  const fromRoot = relative(canonicalRoot, canonicalJobs);
  if (!fromRoot || fromRoot.startsWith(`..${sep}`) || fromRoot === '..' || isAbsolute(fromRoot)) {
    throw new Error('unsafe jobs root');
  }
  return canonicalJobs;
}

async function removeJob(path) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      await rm(path, { force: true, recursive: true, maxRetries: 2, retryDelay: 100 });
      await lstat(path);
    } catch (error) {
      if (error?.code === 'ENOENT') return;
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 100 * (attempt + 1)));
  }
  throw new AppError(500, 'TRANSCRIPTION_CLEANUP_FAILED', 'No se pudo eliminar el audio temporal local.');
}

function minimalEnvironment() {
  return Object.fromEntries(['SystemRoot', 'SYSTEMROOT', 'WINDIR', 'TEMP', 'TMP', 'LANG']
    .map((key) => [key, process.env[key]])
    .filter(([, value]) => typeof value === 'string' && value));
}

function runWhisper({ executable, model, input, outputPrefix, cwd, signal, timeoutMs }) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(executable, [
      '-m', model,
      '-f', input,
      '-l', 'es',
      '-otxt',
      '-of', outputPrefix,
      '-nt',
      '-np',
    ], {
      cwd,
      env: minimalEnvironment(),
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    let settled = false;
    let outputBytes = 0;
    let stopError = null;
    let timer;
    const settle = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      if (error) rejectPromise(error);
      else resolvePromise();
    };
    const stop = (error) => {
      if (settled || stopError) return;
      stopError = error;
      try { child.kill('SIGKILL'); } catch { /* el evento error/close termina la promesa */ }
    };
    const abort = () => stop(new AppError(499, 'TRANSCRIPTION_CANCELLED', 'La transcripción fue cancelada.'));
    const collect = (chunk) => {
      outputBytes += chunk.length;
      if (outputBytes > MAX_PROCESS_OUTPUT_BYTES) {
        stop(new AppError(502, 'TRANSCRIPTION_OUTPUT_LIMIT', 'El motor local produjo una salida inválida.'));
      }
    };
    child.stdout.on('data', collect);
    child.stderr.on('data', collect);
    child.once('error', () => settle(stopError
      || new AppError(503, 'TRANSCRIPTION_ENGINE_FAILED', 'El motor local no pudo iniciarse.')));
    child.once('close', (code) => {
      settle(stopError || (code === 0 ? null
        : new AppError(502, 'TRANSCRIPTION_ENGINE_FAILED', 'El motor local no pudo transcribir la grabación.')));
    });
    timer = setTimeout(() => stop(
      new AppError(504, 'TRANSCRIPTION_TIMEOUT', 'La transcripción local tardó demasiado.'),
    ), timeoutMs);
    timer.unref?.();
    if (signal?.aborted) abort();
    else signal?.addEventListener('abort', abort, { once: true });
  });
}

export function createTranscriptionService(options = {}) {
  const voiceRoot = resolve(options.voiceRoot || join(process.cwd(), '.runtime', 'voice'));
  const binaryName = process.platform === 'win32' ? 'whisper-cli.exe' : 'whisper-cli';
  const binRoot = join(voiceRoot, 'bin');
  const modelsRoot = join(voiceRoot, 'models');
  const executablePath = join(binRoot, binaryName);
  const modelPath = join(modelsRoot, 'ggml-base.bin');
  const manifestPath = join(voiceRoot, 'manifest.json');
  const timeoutMs = options.timeoutMs || TRANSCRIPTION_TIMEOUT_MS;
  const runner = options.runner || runWhisper;
  const integrity = options.integrity || (process.platform === 'win32' ? {
    release: 'b4938',
    binaries: WINDOWS_BINARY_HASHES,
    modelSha256: MODEL_SHA256,
  } : null);
  let active = false;

  async function assets() {
    try {
      if (!integrity || !integrity.binaries?.[binaryName]) return null;
      const rootInfo = await stat(voiceRoot);
      if (!rootInfo.isDirectory()) return null;
      await Promise.all([
        trustedDirectory(voiceRoot, binRoot),
        trustedDirectory(voiceRoot, modelsRoot),
      ]);
      const entries = await readdir(binRoot, { withFileTypes: true });
      const expectedNames = Object.keys(integrity.binaries).sort();
      const actualNames = entries.map((entry) => entry.name).sort();
      if (actualNames.length !== expectedNames.length
        || actualNames.some((name, index) => name !== expectedNames[index])
        || entries.some((entry) => !entry.isFile() || entry.isSymbolicLink())) return null;
      const [executable, model, manifest] = await Promise.all([
        trustedFile(voiceRoot, executablePath),
        trustedFile(voiceRoot, modelPath),
        trustedFile(voiceRoot, manifestPath),
      ]);
      const manifestInfo = await lstat(manifest);
      if (manifestInfo.size > 16 * 1024) return null;
      const manifestValue = JSON.parse(await readFile(manifest, 'utf8'));
      if (manifestValue.release !== integrity.release
        || manifestValue.executableSha256 !== integrity.binaries[binaryName]
        || manifestValue.modelSha256 !== integrity.modelSha256) return null;
      const hashes = await Promise.all([
        ...expectedNames.map(async (name) => [name, await sha256File(join(binRoot, name))]),
        sha256File(model),
      ]);
      const modelHash = hashes.pop();
      if (modelHash !== integrity.modelSha256
        || hashes.some(([name, hash]) => integrity.binaries[name] !== hash)) return null;
      return { executable, model };
    } catch {
      return null;
    }
  }

  return {
    async initialize() {
      try {
        const rootInfo = await stat(voiceRoot);
        if (!rootInfo.isDirectory()) return;
        const jobsRoot = await safeJobsRoot(voiceRoot);
        const entries = await readdir(jobsRoot, { withFileTypes: true });
        await Promise.all(entries
          .filter((entry) => /^job-[a-f0-9-]+$/i.test(entry.name))
          .map((entry) => rm(join(jobsRoot, entry.name), { force: true, recursive: true })));
      } catch {
        // Motor opcional todavía no instalado o carpeta no confiable: no bloquea el arranque.
      }
    },
    async status() {
      if (active) {
        return {
          available: true,
          busy: true,
          state: 'checking',
          engine: 'whisper.cpp',
          model: 'base',
          language: 'es',
          maxSeconds: TRANSCRIPTION_MAX_SECONDS,
          message: 'Transcripción local en curso.',
        };
      }
      if (!(await assets())) return publicUnavailable();
      return {
        available: true,
        busy: false,
        state: 'ready',
        engine: 'whisper.cpp',
        model: 'base',
        language: 'es',
        maxSeconds: TRANSCRIPTION_MAX_SECONDS,
        message: 'Transcripción local y offline lista.',
      };
    },
    async transcribe(buffer, { signal } = {}) {
      const wav = validatePcmWav(buffer);
      if (active) throw new AppError(429, 'TRANSCRIPTION_BUSY', 'Ya hay una transcripción local en curso.');
      active = true;
      let jobRoot;
      try {
        const configured = await assets();
        if (!configured) {
          throw new AppError(501, 'TRANSCRIPTION_NOT_INSTALLED', 'Instalá el motor local con: npm run voice:install');
        }
        const jobsRoot = await safeJobsRoot(voiceRoot);
        jobRoot = join(jobsRoot, `job-${randomUUID()}`);
        await mkdir(jobRoot, { recursive: false, mode: 0o700 });
        const input = join(jobRoot, 'input.wav');
        const outputPrefix = join(jobRoot, 'result');
        await writeFile(input, buffer, { flag: 'wx', mode: 0o600 });
        await runner({
          executable: configured.executable,
          model: configured.model,
          input,
          outputPrefix,
          cwd: jobRoot,
          signal,
          timeoutMs,
        });
        const transcriptInfo = await lstat(`${outputPrefix}.txt`);
        if (!transcriptInfo.isFile() || transcriptInfo.isSymbolicLink()
          || transcriptInfo.size > 128 * 1024) {
          throw new AppError(502, 'TRANSCRIPT_TOO_LARGE', 'El motor local produjo una transcripción inválida.');
        }
        const transcript = (await readFile(`${outputPrefix}.txt`, 'utf8')).replaceAll('\0', '').trim();
        if (!transcript) throw new AppError(422, 'NO_SPEECH', 'No se detectó voz clara en la grabación.');
        return { transcript, durationSeconds: wav.durationSeconds, language: 'es', model: 'base' };
      } catch (error) {
        if (error instanceof AppError) throw error;
        throw new AppError(502, 'TRANSCRIPTION_FAILED', 'No se pudo completar la transcripción local.');
      } finally {
        try {
          if (jobRoot) await removeJob(jobRoot);
        } finally {
          active = false;
        }
      }
    },
  };
}
