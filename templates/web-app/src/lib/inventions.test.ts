import { describe, expect, it } from 'vitest';
import { normalizeDraft, validateDraft } from './inventions';

describe('inventions', () => {
  it('normaliza espacios sin alterar la descripción interna', () => {
    expect(normalizeDraft({ title: '  Motor   solar ', description: '  Paso 1\nPaso 2  ' })).toEqual({
      title: 'Motor solar',
      description: 'Paso 1\nPaso 2',
    });
  });

  it('requiere un nombre útil', () => {
    expect(validateDraft({ title: '   ', description: '' })).toBe('Escribí un nombre para el invento.');
  });

  it('acepta una idea válida', () => {
    expect(validateDraft({ title: 'Riego solar', description: 'Primer prototipo' })).toBeNull();
  });
});
