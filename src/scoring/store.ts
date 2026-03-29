import Database from "better-sqlite3";
import type { CandleReview } from "./types.js";

export class ScoreStore {
  private db: Database.Database;

  constructor(dbPath: string = process.env["SCORE_DB_PATH"] ?? "./scores.db") {
    this.db = new Database(dbPath);
    this.init();
  }

  private init(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS candle_reviews (
        date TEXT PRIMARY KEY,
        review_json TEXT NOT NULL,
        generated_at TEXT NOT NULL
      )
    `);
  }

  saveReview(review: CandleReview): void {
    this.db
      .prepare(
        "INSERT OR REPLACE INTO candle_reviews (date, review_json, generated_at) VALUES (?, ?, ?)"
      )
      .run(review.date, JSON.stringify(review), review.generated_at);
  }

  getLatest(): CandleReview | null {
    const row = this.db
      .prepare("SELECT review_json FROM candle_reviews ORDER BY date DESC LIMIT 1")
      .get() as { review_json: string } | undefined;
    return row ? (JSON.parse(row.review_json) as CandleReview) : null;
  }

  getByDate(date: string): CandleReview | null {
    const row = this.db
      .prepare("SELECT review_json FROM candle_reviews WHERE date = ?")
      .get(date) as { review_json: string } | undefined;
    return row ? (JSON.parse(row.review_json) as CandleReview) : null;
  }

  getHistory(limit: number): CandleReview[] {
    const rows = this.db
      .prepare("SELECT review_json FROM candle_reviews ORDER BY date DESC LIMIT ?")
      .all(limit) as { review_json: string }[];
    return rows.map((r) => JSON.parse(r.review_json) as CandleReview);
  }
}
