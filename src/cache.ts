import Database from "better-sqlite3";
import path from "node:path";
import type { CacheStats } from "./types/index.js";

const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

export class CacheManager {
  private db: Database.Database;
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    const dbPath = process.env["CACHE_DB_PATH"] ?? path.resolve("./cache.db");
    this.db = new Database(dbPath);
    this.init();
  }

  private init(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS cache_entries (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        provider TEXT NOT NULL,
        ttl_seconds INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_provider ON cache_entries(provider);
      CREATE INDEX IF NOT EXISTS idx_expires_at ON cache_entries(expires_at);
    `);

    this.cleanup();

    this.cleanupTimer = setInterval(() => {
      this.cleanup();
    }, CLEANUP_INTERVAL_MS);

    // Allow the process to exit even if the timer is active
    if (this.cleanupTimer.unref) {
      this.cleanupTimer.unref();
    }
  }

  private cleanup(): void {
    const now = Math.floor(Date.now() / 1000);
    const stmt = this.db.prepare("DELETE FROM cache_entries WHERE expires_at <= ?");
    stmt.run(now);
  }

  get(key: string): unknown | null {
    const now = Math.floor(Date.now() / 1000);
    const stmt = this.db.prepare<[string, number], { value: string }>(
      "SELECT value FROM cache_entries WHERE key = ? AND expires_at > ?"
    );
    const row = stmt.get(key, now);
    if (!row) return null;
    try {
      return JSON.parse(row.value) as unknown;
    } catch {
      return null;
    }
  }

  set(key: string, value: unknown, provider: string, ttlSeconds: number): void {
    const now = Math.floor(Date.now() / 1000);
    const expiresAt = now + ttlSeconds;
    const serialized = JSON.stringify(value);
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO cache_entries (key, value, provider, ttl_seconds, created_at, expires_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    stmt.run(key, serialized, provider, ttlSeconds, now, expiresAt);
  }

  clear(provider?: string): void {
    if (provider) {
      const stmt = this.db.prepare("DELETE FROM cache_entries WHERE provider = ?");
      stmt.run(provider);
    } else {
      this.db.exec("DELETE FROM cache_entries");
    }
  }

  getStats(): CacheStats {
    const totalRow = this.db
      .prepare<[], { count: number }>("SELECT COUNT(*) as count FROM cache_entries")
      .get();
    const total = totalRow?.count ?? 0;

    const byProviderRows = this.db
      .prepare<[], { provider: string; count: number }>(
        "SELECT provider, COUNT(*) as count FROM cache_entries GROUP BY provider"
      )
      .all();

    const byProvider: Record<string, number> = {};
    for (const row of byProviderRows) {
      byProvider[row.provider] = row.count;
    }

    return { total, byProvider };
  }

  close(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    this.db.close();
  }
}
