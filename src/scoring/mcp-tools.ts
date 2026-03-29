import { z } from "zod/v3";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ScoreStore } from "./store.js";
import { generateCandleReview } from "./engine.js";

function todayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function toolResponse(data: unknown): { content: Array<{ type: "text"; text: string }> } {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

function errorResponse(err: unknown): { content: Array<{ type: "text"; text: string }>; isError: true } {
  const message = err instanceof Error ? err.message : String(err);
  return { content: [{ type: "text", text: `Error: ${message}` }], isError: true };
}

export function registerCandleTools(server: McpServer, store: ScoreStore): void {
  // ── candle.get_today ───────────────────────────────────────────────────────
  server.tool(
    "candle.get_today",
    "Get today's Candle Review score — a composite 0-100 score covering price action, on-chain flows, derivatives, ETF/staking, macro, dominance, and sentiment",
    {},
    async () => {
      try {
        const date = todayDate();
        let review = store.getByDate(date);
        if (!review) {
          process.stderr.write(`[candle] No cached review for ${date}, generating live...\n`);
          review = await generateCandleReview(date);
          store.saveReview(review);
        }
        return toolResponse(review);
      } catch (err) {
        return errorResponse(err);
      }
    }
  );

  // ── candle.get_history ─────────────────────────────────────────────────────
  server.tool(
    "candle.get_history",
    "Get historical Candle Review scores from the local SQLite store, most recent first",
    {
      limit: z
        .number()
        .int()
        .min(1)
        .max(365)
        .optional()
        .describe("Number of reviews to return (default 30, max 365)"),
    },
    async (args) => {
      try {
        const limit = args.limit ?? 30;
        const reviews = store.getHistory(limit);
        return toolResponse({
          count: reviews.length,
          reviews,
        });
      } catch (err) {
        return errorResponse(err);
      }
    }
  );

  // ── candle.get_category ────────────────────────────────────────────────────
  server.tool(
    "candle.get_category",
    "Get the detailed score for a single category from today's Candle Review",
    {
      category: z
        .enum(["price_action", "on_chain", "derivatives", "etf_flows", "macro", "dominance", "sentiment"])
        .describe("The scoring category to inspect"),
    },
    async (args) => {
      try {
        const date = todayDate();
        let review = store.getByDate(date);
        if (!review) {
          process.stderr.write(`[candle] No cached review for ${date}, generating live...\n`);
          review = await generateCandleReview(date);
          store.saveReview(review);
        }

        const cat = review.categories[args.category];
        return toolResponse({
          date: review.date,
          category: args.category,
          score: cat.score,
          max: cat.max,
          pct: Math.round((cat.score / cat.max) * 100),
          summary: cat.summary,
          composite_score: review.score,
          label: review.label,
        });
      } catch (err) {
        return errorResponse(err);
      }
    }
  );
}
