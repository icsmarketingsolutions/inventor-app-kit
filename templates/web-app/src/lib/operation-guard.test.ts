import { describe, expect, it } from 'vitest';
import { ExclusiveOperationGuard, LatestRequestGuard } from './operation-guard';

describe('LatestRequestGuard', () => {
  it('solo acepta la respuesta de la solicitud más reciente', () => {
    const guard = new LatestRequestGuard();
    const first = guard.next();
    const second = guard.next();
    expect(guard.isCurrent(first)).toBe(false);
    expect(guard.isCurrent(second)).toBe(true);
    guard.invalidate();
    expect(guard.isCurrent(second)).toBe(false);
  });
});

describe('ExclusiveOperationGuard', () => {
  it('rechaza un doble envío hasta liberar la operación', () => {
    const guard = new ExclusiveOperationGuard();
    expect(guard.tryEnter()).toBe(true);
    expect(guard.tryEnter()).toBe(false);
    guard.leave();
    expect(guard.tryEnter()).toBe(true);
  });
});
