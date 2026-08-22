import type { MemoryCapacity, MemoryTarget } from '@stitch/shared/memory/types';
import { MemoryCapacityError } from './file-store.js';

export class MemoryCapacityTracker {
  capacityFor(content: string, limit: number): MemoryCapacity {
    const used = content
      .split('\n')
      .filter((line) => !line.trimStart().startsWith('<!-- stitch-memory '))
      .join('\n').length;
    return { used, limit, remaining: Math.max(0, limit - used) };
  }

  assertCapacity(content: string, target: MemoryTarget, limits: { memory: number; user: number }): void {
    const capacity = this.capacityFor(content, target === 'memory' ? limits.memory : limits.user);
    if (capacity.used > capacity.limit) throw new MemoryCapacityError(capacity);
  }
}
