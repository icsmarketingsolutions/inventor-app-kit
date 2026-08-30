import assert from 'node:assert/strict';
import { mkdir, readFile, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import { AppError } from '../core/errors.mjs';
import { createTranscriptionService, validatePcmWav } from '../features/transcription.mjs';
import { cleanup, temporaryDirectory } from './helpers.mjs';

const FIXTURE_SHA256 = 'f16d05ec6b29248d2c61adb1e9263f78e4f7bace1b955014a2d17872cfe4064d';

function wav(seconds = 1, options = {}) {
  const sampleRate = options.sampleRate || 16_000;
  const channels = options.channels || 1;
  const bits = options.bits || 16;
  const bytesPerSample = bits / 8;
  const dataBytes = Math.floor(seconds * sampleRate * channels * bytesPerSample);
  const buffer = Buffer.alloc(44 + dataBytes);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(buffer.length - 8, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(channels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * channels * bytesPerSample, 28);
  buffer.writeUInt16LE(channels * bytesPerSample, 32);
  buffer.writeUInt16LE(bits, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataBytes, 40);
  return buffer;
}

function wavWithTwoDataChunks(secondsEach = 80) {
  const samples = Buffer.alloc(secondsEach * 16_000 * 2);
  const buffer = Buffer.alloc(12 + 24 + 8 + samples.length + 8 + samples.length);
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
  let offset = 36;
  for (let index = 0; index < 2; index += 1) {
    buffer.write('data', offset);
    buffer.writeUInt32LE(samples.length, offset + 4);
    samples.copy(buffer, offset + 8);
    offset += 8 + samples.length;
  }
  return buffer;
}

async function voiceFixture(context, runner) {
  const root = await temporaryDirectory('inventor-voice-');
  const voiceRoot = join(root, 'voice');
  await mkdir(join(voiceRoot, 'bin'), { recursive: true });
  await mkdir(join(voiceRoot, 'models'), { recursive: true });
  const binaryName = process.platform === 'win32' ? 'whisper-cli.exe' : 'whisper-cli';
  await writeFile(join(voiceRoot, 'bin', binaryName), 'fixture');
  await writeFile(join(voiceRoot, 'models', 'ggml-base.bin'), 'fixture');
  await writeFile(join(voiceRoot, 'manifest.json'), JSON.stringify({
    release: 'fixture', executableSha256: FIXTURE_SHA256, modelSha256: FIXTURE_SHA256,
  }));
  context.after(() => cleanup(root));
  return {
    voiceRoot,
    service: createTranscriptionService({
      voiceRoot,
      runner,
      integrity: {
        release: 'fixture', binaries: { [binaryName]: FIXTURE_SHA256 }, modelSha256: FIXTURE_SHA256,
      },
    }),
  };
}

test('valida WAV PCM mono, 16 kHz y 16 bits con duración acotada', () => {
  assert.equal(validatePcmWav(wav(1)).durationSeconds, 1);
  for (const invalid of [Buffer.from('no es wav'), wav(1, { channels: 2 }), wav(1, { sampleRate: 44_100 }), wav(1, { bits: 8 })]) {
    assert.throws(() => validatePcmWav(invalid), AppError);
  }
  assert.throws(() => validatePcmWav(wav(121)), (error) => error.code === 'AUDIO_TOO_LONG');
  assert.throws(() => validatePcmWav(wavWithTwoDataChunks()), (error) => error.code === 'INVALID_WAV');
  assert.throws(() => validatePcmWav(Buffer.concat([wav(1), Buffer.alloc(2)])), (error) => error.code === 'INVALID_WAV');
});

test('transcribe con rutas internas fijas y elimina audio temporal', async (context) => {
  let observed;
  const fixture = await voiceFixture(context, async (input) => {
    observed = input;
    await writeFile(`${input.outputPrefix}.txt`, '  una idea local  ');
  });
  const result = await fixture.service.transcribe(wav(1));
  assert.equal(result.transcript, 'una idea local');
  assert.equal(result.language, 'es');
  assert.match(observed.executable, /voice[\\/]bin[\\/]whisper-cli/);
  assert.match(observed.model, /voice[\\/]models[\\/]ggml-base\.bin$/);
  assert.equal((await readFile(observed.input).catch(() => null)), null);
});

test('rechaza concurrencia y limpia temporales después de una falla', async (context) => {
  let release;
  let ready;
  const running = new Promise((resolve) => { ready = resolve; });
  const fixture = await voiceFixture(context, () => new Promise((resolve) => {
    release = resolve;
    ready();
  }));
  const first = fixture.service.transcribe(wav(1));
  await running;
  await assert.rejects(() => fixture.service.transcribe(wav(1)), (error) => error.code === 'TRANSCRIPTION_BUSY');
  release();
  await assert.rejects(first, (error) => error.code === 'TRANSCRIPTION_FAILED');
});

test('rechaza modelo enlazado y no filtra rutas en el estado', async (context) => {
  const root = await temporaryDirectory('inventor-voice-link-');
  const voiceRoot = join(root, 'voice');
  await mkdir(join(voiceRoot, 'bin'), { recursive: true });
  const external = join(root, 'external-models');
  await mkdir(external);
  await writeFile(join(external, 'ggml-base.bin'), 'external');
  const binaryName = process.platform === 'win32' ? 'whisper-cli.exe' : 'whisper-cli';
  await writeFile(join(voiceRoot, 'bin', binaryName), 'fixture');
  await writeFile(join(voiceRoot, 'manifest.json'), JSON.stringify({
    release: 'fixture', executableSha256: FIXTURE_SHA256, modelSha256: FIXTURE_SHA256,
  }));
  await symlink(external, join(voiceRoot, 'models'), process.platform === 'win32' ? 'junction' : 'dir');
  context.after(() => cleanup(root));
  const status = await createTranscriptionService({
    voiceRoot,
    integrity: {
      release: 'fixture', binaries: { [binaryName]: FIXTURE_SHA256 }, modelSha256: FIXTURE_SHA256,
    },
  }).status();
  assert.equal(status.available, false);
  assert.equal(JSON.stringify(status).includes(root), false);
});
