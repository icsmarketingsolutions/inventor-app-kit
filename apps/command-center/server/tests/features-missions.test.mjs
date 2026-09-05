import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createMissionStore, validateModel } from '../features/missions.mjs';
import { DEFAULT_FOUNDRY_ROOT } from '../features/prompt-foundry.mjs';

test('misión persiste roles, entrega y alcance sin publicar directorios locales', async (context) => {
  const runtimeRoot = await mkdtemp(join(tmpdir(), 'inventor-mission-'));
  context.after(() => rm(runtimeRoot, { recursive: true, force: true }));
  const store = createMissionStore({ runtimeRoot, foundryRoot: DEFAULT_FOUNDRY_ROOT });
  const mission = await store.create({ contract: '# Contrato genérico', tool: 'codex', workflow: 'team', projectIds: ['a', 'b'] });
  assert.equal(mission.profiles.builder.model, 'gpt-5.6-sol');
  assert.equal(JSON.stringify(mission).includes(runtimeRoot), false);
  for (const prompt of Object.values(mission.prompts)) {
    assert.ok(prompt.includes('INVENTOR_MISSION_DIR'));
    assert.equal(/__ROL__|__MODELO__|__MODALIDAD__/.test(prompt), false);
  }
  const directory = await store.launchDirectory(mission.id, 'codex', ['b', 'a']);
  await writeFile(join(directory, 'constructor.md'), 'Entrega revisión 1');
  assert.equal((await store.read(mission.id)).deliveries.builder, 'Entrega revisión 1');
  await assert.rejects(store.launchDirectory(mission.id, 'claude', ['a', 'b']));
  await assert.rejects(store.launchDirectory(mission.id, 'codex', ['a']));
  await assert.rejects(store.read('../config.json'));
  await assert.rejects(store.create({ contract: 'x', tool: 'codex', workflow: 'inventado', projectIds: ['a'] }));
});

test('modelo es un argumento validado y permite conservar el predeterminado', () => {
  assert.equal(validateModel(''), '');
  assert.equal(validateModel('gpt-6-astra'), 'gpt-6-astra');
  for (const value of ['--help', 'opus --debug', 'a\nb', 1, null]) assert.throws(() => validateModel(value));
});
