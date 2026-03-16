import { createHash } from 'node:crypto';

interface CacheEntry<T> {
  value: T;
  insertedAt: number;
  ttlMs: number;
}

interface CacheOptions {
  maxSize?: number;
  natalTtlMs?: number;
  transitTtlMs?: number;
}

const DEFAULT_MAX_SIZE = 1000;
const DEFAULT_NATAL_TTL_MS = 86_400_000; // 24h
const DEFAULT_TRANSIT_TTL_MS = 3_600_000; // 1h

export class ChartCache {
  private map = new Map<string, CacheEntry<unknown>>();
  private maxSize: number;
  private hits = 0;
  private misses = 0;

  readonly natalTtlMs: number;
  readonly transitTtlMs: number;

  constructor(options?: CacheOptions) {
    this.maxSize = options?.maxSize ?? DEFAULT_MAX_SIZE;
    this.natalTtlMs = options?.natalTtlMs ?? DEFAULT_NATAL_TTL_MS;
    this.transitTtlMs = options?.transitTtlMs ?? DEFAULT_TRANSIT_TTL_MS;
  }

  get<T>(key: string): T | undefined {
    const entry = this.map.get(key);
    if (!entry) {
      this.misses++;
      return undefined;
    }
    if (Date.now() - entry.insertedAt > entry.ttlMs) {
      this.map.delete(key);
      this.misses++;
      return undefined;
    }
    // Move to end for LRU ordering (most recently used)
    this.map.delete(key);
    this.map.set(key, entry);
    this.hits++;
    return entry.value as T;
  }

  set<T>(key: string, value: T, ttlMs?: number): void {
    // Delete first so re-insertion moves to end
    if (this.map.has(key)) {
      this.map.delete(key);
    }
    // Evict oldest entries if at capacity
    while (this.map.size >= this.maxSize) {
      const oldest = this.map.keys().next().value;
      if (oldest !== undefined) {
        this.map.delete(oldest);
      }
    }
    this.map.set(key, {
      value,
      insertedAt: Date.now(),
      ttlMs: ttlMs ?? this.natalTtlMs,
    });
  }

  async getOrSet<T>(key: string, compute: () => T | Promise<T>, ttlMs?: number): Promise<T> {
    const cached = this.get<T>(key);
    if (cached !== undefined) return cached;
    const result = await compute();
    this.set(key, result, ttlMs);
    return result;
  }

  generateKey(params: Record<string, unknown>): string {
    const sorted = JSON.stringify(sortObject(params));
    return createHash('sha256').update(sorted).digest('hex');
  }

  clear(): void {
    this.map.clear();
    this.hits = 0;
    this.misses = 0;
  }

  stats(): { size: number; hits: number; misses: number } {
    return { size: this.map.size, hits: this.hits, misses: this.misses };
  }
}

function sortObject(obj: unknown): unknown {
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(sortObject);
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(obj as Record<string, unknown>).sort()) {
    sorted[key] = sortObject((obj as Record<string, unknown>)[key]);
  }
  return sorted;
}

export const chartCache = new ChartCache();
