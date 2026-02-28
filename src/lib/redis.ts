import { Redis } from "@upstash/redis";

/**
 * In-memory KV store used when Upstash Redis is not configured.
 * Supports basic get/set/del/exists/expire/scan operations.
 */
class MemoryKV {
  private store = new Map<string, { value: unknown; expiresAt?: number }>();

  private isExpired(key: string): boolean {
    const entry = this.store.get(key);
    if (!entry) return true;
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return true;
    }
    return false;
  }

  async get<T = unknown>(key: string): Promise<T | null> {
    if (this.isExpired(key)) return null;
    return (this.store.get(key)?.value as T) ?? null;
  }

  async set(
    key: string,
    value: unknown,
    opts?: { ex?: number; nx?: boolean }
  ): Promise<string | null> {
    if (opts?.nx && this.store.has(key) && !this.isExpired(key)) {
      return null;
    }
    const expiresAt = opts?.ex ? Date.now() + opts.ex * 1000 : undefined;
    this.store.set(key, { value, expiresAt });
    return "OK";
  }

  async del(key: string): Promise<number> {
    return this.store.delete(key) ? 1 : 0;
  }

  async exists(key: string): Promise<number> {
    return this.isExpired(key) ? 0 : 1;
  }

  async expire(key: string, seconds: number): Promise<number> {
    const entry = this.store.get(key);
    if (!entry || this.isExpired(key)) return 0;
    entry.expiresAt = Date.now() + seconds * 1000;
    return 1;
  }

  async scan(
    cursor: number,
    _opts?: { match?: string; count?: number }
  ): Promise<[number, string[]]> {
    // Simple implementation: return all matching keys in one pass
    const pattern = _opts?.match?.replace("*", "") || "";
    const keys: string[] = [];
    for (const key of this.store.keys()) {
      if (!this.isExpired(key) && key.startsWith(pattern)) {
        keys.push(key);
      }
    }
    return [0, keys];
  }
}

const hasRedis =
  process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN;

export const redis: MemoryKV | Redis = hasRedis
  ? new Redis({
      url: process.env.KV_REST_API_URL!,
      token: process.env.KV_REST_API_TOKEN!,
    })
  : new MemoryKV();
