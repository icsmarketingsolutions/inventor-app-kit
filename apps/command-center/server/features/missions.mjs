import { randomUUID } from 'node:crypto';
import { mkdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { AppError } from '../core/errors.mjs';
import { assertNoLinks } from '../core/security.mjs';
import { atomicWrite } from '../core/storage.mjs';

export const ROLE_PROFILES = Object.freeze({
  codex: {
    orchestrator: { label: 'GPT 6 Astra', model: 'gpt-6-astra' },
    builder: { label: 'Sol', model: 'gpt-5.6-sol' },
    researcher: { label: 'Terra', model: 'gpt-5.6-terra' },
  },
  claude: {
    orchestrator: { label: 'Fable 5.1', model: '' },
    builder: { label: 'Opus', model: 'opus' },
    researcher: { label: 'Sonnet', model: 'sonnet' },
  },
});
const ROLES = ['orchestrator', 'builder', 'researcher'];
const ROLE_NAMES = { orchestrator: 'orquestador', builder: 'constructor', researcher: 'investigador' };
const invalid = () => new AppError(400, 'INVALID_MISSION', 'La misión no es válida o no está disponible.');

export function validateModel(model = '') {
  if (typeof model !== 'string' || (model && !/^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,119}$/.test(model))) {
    throw new AppError(400, 'INVALID_MODEL', 'El identificador del modelo no es válido.');
  }
  return model;
}

export function createMissionStore({ runtimeRoot, foundryRoot }) {
  const root = join(runtimeRoot, 'missions');
  async function directory(id) {
    if (typeof id !== 'string' || !/^[a-f0-9-]{36}$/.test(id)) throw invalid();
    const path = join(root, id);
    await assertNoLinks(runtimeRoot, path);
    return path;
  }
  async function read(id) {
    try {
      const path = await directory(id);
      const text = async (name) => {
        const file = join(path, name);
        await assertNoLinks(runtimeRoot, file);
        if ((await stat(file)).size > 1_000_000) throw invalid();
        return readFile(file, 'utf8');
      };
      const meta = JSON.parse(await text('mission.json'));
      if (meta.id !== id || !Object.hasOwn(ROLE_PROFILES, meta.tool) || !['single', 'team'].includes(meta.workflow)
        || !Array.isArray(meta.projectIds) || meta.projectIds.length === 0
        || meta.projectIds.some((item) => typeof item !== 'string')) throw invalid();
      return {
        id, tool: meta.tool, workflow: meta.workflow, projectIds: meta.projectIds,
        profiles: ROLE_PROFILES[meta.tool],
        prompts: Object.fromEntries(await Promise.all(ROLES.map(async (role) => [role, await text(`${role}-start.md`)]))),
        state: await text('estado.md'), assignments: await text('encargos.md'),
        deliveries: Object.fromEntries(await Promise.all(ROLES.map(async (role) => [role, await text(`${ROLE_NAMES[role]}.md`)]))),
      };
    } catch { throw new AppError(404, 'MISSION_NOT_FOUND', 'La misión no está disponible.'); }
  }
  async function create({ contract, tool, workflow, projectIds }) {
    if (!Object.hasOwn(ROLE_PROFILES, tool) || !['single', 'team'].includes(workflow)
      || typeof contract !== 'string' || !contract.trim() || contract.length > 180_000
      || !Array.isArray(projectIds) || !projectIds.length || projectIds.some((id) => typeof id !== 'string')) throw invalid();
    const template = await readFile(join(foundryRoot, 'team.md'), 'utf8');
    await assertNoLinks(runtimeRoot, root, { targetMayBeMissing: true });
    await mkdir(root, { recursive: true });
    const id = randomUUID();
    const path = join(root, id);
    await mkdir(path);
    const meta = { id, tool, workflow, projectIds };
    await atomicWrite(join(path, 'mission.json'), JSON.stringify(meta));
    await atomicWrite(join(path, 'contrato.md'), contract);
    await atomicWrite(join(path, 'estado.md'), `# Misión ${id}\n\nPreparada; ninguna sesión confirmada.\nRevisión: 0.\n`);
    await atomicWrite(join(path, 'encargos.md'), '# Encargos\n\nPendientes de asignación por el orquestador.\n');
    for (const role of ROLES) {
      const coordination = template.replaceAll('__ROL__', ROLE_NAMES[role])
        .replaceAll('__MODELO__', ROLE_PROFILES[tool][role].label)
        .replaceAll('__MODALIDAD__', workflow === 'single' ? 'sesión única' : 'equipo');
      await atomicWrite(join(path, `${role}-start.md`), `${contract}\n\n${coordination}`);
      await atomicWrite(join(path, `${ROLE_NAMES[role]}.md`), `# ${ROLE_NAMES[role]}\n\nEstado: pendiente de inicio.\n`);
    }
    return read(id);
  }
  async function launchDirectory(id, tool, projectIds) {
    const mission = await read(id);
    if (mission.tool !== tool || JSON.stringify([...mission.projectIds].sort()) !== JSON.stringify([...projectIds].sort())) throw invalid();
    return directory(id);
  }
  return { create, read, launchDirectory };
}
