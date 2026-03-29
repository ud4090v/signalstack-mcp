import Database from "better-sqlite3";
import { randomBytes } from "crypto";

export type Tier = "free" | "pro";

interface ApiKeyRow {
  key: string;
  tier: string;
  label: string;
  created_at: string;
}

export class ApiKeyStore {
  private db: Database.Database;

  constructor(dbPath: string = process.env["API_KEY_DB_PATH"] ?? "./api-keys.db") {
    this.db = new Database(dbPath);
    this.init();
  }

  private init(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS api_keys (
        key TEXT PRIMARY KEY,
        tier TEXT NOT NULL,
        created_at TEXT NOT NULL,
        label TEXT NOT NULL
      )
    `);
  }

  verifyKey(key: string): Tier | null {
    const row = this.db
      .prepare("SELECT tier FROM api_keys WHERE key = ?")
      .get(key) as { tier: string } | undefined;
    if (!row) return null;
    return row.tier as Tier;
  }

  createKey(tier: Tier, label: string): string {
    const key = randomBytes(32).toString("hex");
    const created_at = new Date().toISOString();
    this.db
      .prepare("INSERT INTO api_keys (key, tier, created_at, label) VALUES (?, ?, ?, ?)")
      .run(key, tier, created_at, label);
    return key;
  }

  listKeys(): Array<{ key: string; tier: string; label: string; created_at: string }> {
    const rows = this.db
      .prepare("SELECT key, tier, label, created_at FROM api_keys ORDER BY created_at DESC")
      .all() as ApiKeyRow[];
    return rows;
  }
}
