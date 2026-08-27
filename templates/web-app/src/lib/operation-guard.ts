export class LatestRequestGuard {
  private generation = 0;

  next() {
    this.generation += 1;
    return this.generation;
  }

  invalidate() {
    this.generation += 1;
  }

  isCurrent(candidate: number) {
    return candidate === this.generation;
  }
}

export class ExclusiveOperationGuard {
  private active = false;

  tryEnter() {
    if (this.active) return false;
    this.active = true;
    return true;
  }

  leave() {
    this.active = false;
  }
}
