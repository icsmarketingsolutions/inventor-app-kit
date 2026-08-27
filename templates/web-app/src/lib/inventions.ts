import type { Invention, InventionDraft } from '../types';

export function normalizeDraft(draft: InventionDraft): InventionDraft {
  return {
    title: draft.title.trim().replace(/\s+/g, ' '),
    description: draft.description.trim(),
  };
}

export function validateDraft(draft: InventionDraft): string | null {
  const normalized = normalizeDraft(draft);
  if (normalized.title.length === 0) return 'Escribí un nombre para el invento.';
  if (normalized.title.length > 120) return 'El nombre debe tener 120 caracteres o menos.';
  if (normalized.description.length > 2000) return 'La descripción debe tener 2000 caracteres o menos.';
  return null;
}

export function makeDemoInvention(draft: InventionDraft): Invention {
  const now = new Date().toISOString();
  const normalized = normalizeDraft(draft);
  return {
    id: globalThis.crypto.randomUUID(),
    ...normalized,
    status: 'idea',
    created_at: now,
    updated_at: now,
  };
}
