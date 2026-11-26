export interface Poolable {
  active: boolean;
}

/**
 * Fixed-capacity pre-allocated Object Pool (PRD Section 8).
 * Guarantees zero runtime heap allocation (`new`, `.filter()`, `.map()`) during active updates.
 */
export class ObjectPool<T extends Poolable> {
  private readonly items: T[];
  private readonly resetFn: (item: T) => void;
  private readonly capacity: number;
  private activeCount = 0;

  constructor(capacity: number, factory: () => T, reset: (item: T) => void) {
    this.capacity = Math.max(1, Math.floor(capacity));
    this.resetFn = reset;
    this.items = new Array<T>(this.capacity);
    for (let i = 0; i < this.capacity; i++) {
      const entry = factory();
      entry.active = false;
      this.items[i] = entry;
    }
  }

  public getCapacity(): number {
    return this.capacity;
  }

  public getActiveCount(): number {
    return this.activeCount;
  }

  /**
   * Acquires an inactive slot from the fixed pool or returns null if exhausted.
   */
  public acquire(): T | null {
    for (let i = 0; i < this.capacity; i++) {
      const entry = this.items[i];
      if (!entry.active) {
        this.resetFn(entry);
        entry.active = true;
        this.activeCount += 1;
        return entry;
      }
    }
    return null;
  }

  public release(item: T): void {
    if (!item.active) return;
    item.active = false;
    this.resetFn(item);
    if (this.activeCount > 0) {
      this.activeCount -= 1;
    }
  }

  /**
   * Iterates only active items without allocating temporary arrays.
   */
  public forEachActive(callback: (item: T, index: number) => void): void {
    for (let i = 0; i < this.capacity; i++) {
      const entry = this.items[i];
      if (entry.active) {
        callback(entry, i);
      }
    }
  }

  /**
   * Releases all pooled objects cleanly during scene transitions (PRD Section 6.1).
   */
  public releaseAll(): void {
    for (let i = 0; i < this.capacity; i++) {
      const entry = this.items[i];
      entry.active = false;
      this.resetFn(entry);
    }
    this.activeCount = 0;
  }
}
