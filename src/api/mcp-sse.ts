import { Router } from "express";
import type { Request, Response } from "express";
import { z } from "zod/v3";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ScoreStore } from "../scoring/store.js";
import { ApiKeyStore } from "./key-store.js";
import type { Tier } from "./key-store.js";
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

function todayDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

function resolveTier(apiKey: string | undefined, keyStore: ApiKeyStore): Tier {
  if (!apiKey) return "free";
  const tier = keyStore.verifyKey(apiKey);
  return tier ?? "free";
}

function toolResponse(data: unknown): { content: Array<{ type: "text"; text: string }> } {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

function errorResponse(data: unknown): { content: Array<{ type: "text"; text: string }>; isError: true } {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }], isError: true as const };
}

function createMcpServer(scoreStore: ScoreStore, keyStore: ApiKeyStore): McpServer {
  const server = new McpServer({
    name: "signalstack-public",
    version: "4.0.0",
  });

  // Tool: candle.get_today
  server.tool(
    "candle.get_today",
    "Get today's Bitcoin market candle review score. Free tier returns summary; Pro returns full review.",
    {
      api_key: z.string().optional().describe("Optional pro API key for full data access"),
    },
    async ({ api_key }: { api_key?: string }) => {
      const tier = resolveTier(api_key, keyStore);
      const date = todayDateString();

      let review: CandleReview | null = scoreStore.getByDate(date);
      if (!review) {
        review = await generateCandleReview(date);
        scoreStore.saveReview(review);
      }

      if (tier === "pro") {
        return toolResponse(review);
      }
      return toolResponse({ date: review.date, score: review.score, label: review.label });
    }
  );

  // Tool: candle.get_history
  server.tool(
    "candle.get_history",
    "Get historical candle review scores. Free tier returns summary fields only; Pro returns full reviews.",
    {
      api_key: z.string().optional().describe("Optional pro API key for full data access"),
      limit: z.number().int().min(1).max(365).optional().describe("Number of records to return (default 30, max 365)"),
    },
    async ({ api_key, limit: rawLimit }: { api_key?: string; limit?: number }) => {
      const tier = resolveTier(api_key, keyStore);
      const limit = rawLimit !== undefined
        ? Math.min(Math.max(Math.round(rawLimit), 1), 365)
        : 30;

      const history = scoreStore.getHistory(limit);

      if (tier === "pro") {
        return toolResponse(history);
      }
      return toolResponse(history.map((r) => ({ date: r.date, score: r.score, label: r.label })));
    }
  );

  // Tool: candle.get_category
  server.tool(
    "candle.get_category",
    "Get a specific category score from today's candle review. Requires Pro tier.",
    {
      category: z
        .enum(["price_action", "on_chain", "derivatives", "etf_flows", "macro", "dominance", "sentiment"])
        .describe("Category to retrieve"),
      api_key: z.string().optional().describe("Pro API key required for category access"),
    },
    async ({ category, api_key }: { category: ValidCategory; api_key?: string }) => {
      const tier = resolveTier(api_key, keyStore);

      if (tier !== "pro") {
        return errorResponse({
          error: "Pro tier required",
          upgrade: "Pass a valid pro api_key parameter",
        });
      }

      const date = todayDateString();
      let review: CandleReview | null = scoreStore.getByDate(date);
      if (!review) {
        review = await generateCandleReview(date);
        scoreStore.saveReview(review);
      }

      const catScore = review.categories[category];
      return toolResponse({
        date: review.date,
        category,
        score: catScore.score,
        max: catScore.max,
        pct: Math.round((catScore.score / catScore.max) * 100),
        summary: catScore.summary,
        composite_score: review.score,
        label: review.label,
      });
    }
  );

  return server;
}

export function createMcpRouter(scoreStore: ScoreStore, keyStore: ApiKeyStore): Router {
  const router = Router();
  const transports = new Map<string, SSEServerTransport>();

  // GET /mcp — establish new SSE connection
  router.get("/mcp", async (_req: Request, res: Response): Promise<void> => {
    try {
      const transport = new SSEServerTransport("/mcp", res);
      const server = createMcpServer(scoreStore, keyStore);

      transports.set(transport.sessionId, transport);
      res.on("close", () => {
        transports.delete(transport.sessionId);
      });

      await server.connect(transport);
    } catch (err) {
      process.stderr.write(`[mcp-sse] connection error: ${String(err)}\n`);
      if (!res.headersSent) {
        res.status(500).json({ error: "MCP connection failed" });
      }
    }
  });

  // POST /mcp — client messages
  router.post("/mcp", async (req: Request, res: Response): Promise<void> => {
    try {
      const sessionId = req.query["sessionId"] as string | undefined;
      if (!sessionId) {
        res.status(400).json({ error: "Missing sessionId query parameter" });
        return;
      }

      const transport = transports.get(sessionId);
      if (!transport) {
        res.status(404).json({ error: "Session not found" });
        return;
      }

      await transport.handlePostMessage(req, res);
    } catch (err) {
      process.stderr.write(`[mcp-sse] message error: ${String(err)}\n`);
      if (!res.headersSent) {
        res.status(500).json({ error: "MCP message handling failed" });
      }
    }
  });

  return router;
}
