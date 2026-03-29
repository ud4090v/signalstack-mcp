#!/usr/bin/env node
// Usage: tsx src/scoring/cron.ts
// Set FORCE_REGENERATE=true to overwrite an existing review.
// Set OUTPUT_DIR=/path/to/dir to also write JSON files.
import "dotenv/config";
import { ScoreStore } from "./store.js";
import { generateCandleReview } from "./engine.js";
import fs from "node:fs";
import path from "node:path";

function log(msg: string): void {
  process.stderr.write(`[cron] ${msg}\n`);
}

function todayDate(): string {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

async function main(): Promise<void> {
  const date = todayDate();
  const force = process.env["FORCE_REGENERATE"] === "true";
  const outputDir = process.env["OUTPUT_DIR"];

  log(`Starting candle review cron for ${date} (force=${force})`);

  const store = new ScoreStore();

  // Check if already exists
  if (!force) {
    const existing = store.getByDate(date);
    if (existing) {
      log(`Review for ${date} already exists (score=${existing.score} ${existing.label}). Skipping.`);
      log("Set FORCE_REGENERATE=true to overwrite.");
      return;
    }
  }

  log(`Generating review for ${date}...`);
  const review = await generateCandleReview(date);

  store.saveReview(review);
  log(`Saved to SQLite: ${review.score}/100 — ${review.label}`);

  // Optionally write JSON file
  if (outputDir) {
    const filePath = path.join(outputDir, `candle-${date}.json`);
    fs.mkdirSync(outputDir, { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(review, null, 2));
    log(`Written to ${filePath}`);
  }

  log("Done.");
}

main().catch((err) => {
  process.stderr.write(`[cron] Fatal: ${String(err)}\n`);
  process.exit(1);
});
