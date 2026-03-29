import { Router } from "express";
import type { Request, Response } from "express";
import { ScoreStore } from "../scoring/store.js";
import { generateCandleReview } from "../scoring/engine.js";
import type { CandleReview } from "../scoring/types.js";

const VALID_CATEGORIES = [
  "price_action",
  "on_chain",
  "derivatives",
  "etf_flows",
  "macro",
  "dominance",
  "sentiment",
] as const;

type ValidCategory = (typeof VALID_CATEGORIES)[number];

function isValidCategory(c: string): c is ValidCategory {
  return (VALID_CATEGORIES as readonly string[]).includes(c);
}

function todayDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

export function createRouter(scoreStore: ScoreStore): Router {
  const router = Router();

  // GET /health
  router.get("/health", (_req: Request, res: Response): void => {
    res.json({ ok: true, version: "4.0.0", timestamp: new Date().toISOString() });
  });

  // GET /candle/today
  router.get("/candle/today", async (req: Request, res: Response): Promise<void> => {
    try {
      const date = todayDateString();
      res.set("Cache-Control", "public, max-age=300");

      let review: CandleReview | null = scoreStore.getByDate(date);
      if (!review) {
        review = await generateCandleReview(date);
        scoreStore.saveReview(review);
      }

      if (req.tier === "pro") {
        res.json(review);
      } else {
        res.json({ date: review.date, score: review.score, label: review.label });
      }
    } catch (err) {
      res.status(500).json({ error: "Failed to generate candle review", detail: String(err) });
    }
  });

  // GET /candle/history
  router.get("/candle/history", (req: Request, res: Response): void => {
    try {
      const rawLimit = req.query["limit"];
      let limit = 30;
      if (rawLimit !== undefined) {
        const parsed = parseInt(String(rawLimit), 10);
        if (!isNaN(parsed)) {
          limit = Math.min(Math.max(parsed, 1), 365);
        }
      }

      res.set("Cache-Control", "public, max-age=300");
      const history = scoreStore.getHistory(limit);

      if (req.tier === "pro") {
        res.json(history);
      } else {
        res.json(history.map((r) => ({ date: r.date, score: r.score, label: r.label })));
      }
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch history", detail: String(err) });
    }
  });

  // GET /candle/category/:category
  router.get("/candle/category/:category", async (req: Request, res: Response): Promise<void> => {
    try {
      const category = String(req.params["category"] ?? "");

      if (!isValidCategory(category)) {
        res.status(400).json({ error: "Invalid category" });
        return;
      }

      if (req.tier !== "pro") {
        res.status(403).json({
          error: "Pro tier required",
          upgrade: "Pass X-API-Key header with a valid pro key",
        });
        return;
      }

      const date = todayDateString();
      let review: CandleReview | null = scoreStore.getByDate(date);
      if (!review) {
        review = await generateCandleReview(date);
        scoreStore.saveReview(review);
      }

      const catScore = review.categories[category];
      res.json({
        date: review.date,
        category,
        score: catScore.score,
        max: catScore.max,
        pct: Math.round((catScore.score / catScore.max) * 100),
        summary: catScore.summary,
        composite_score: review.score,
        label: review.label,
      });
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch category score", detail: String(err) });
    }
  });

  return router;
}
