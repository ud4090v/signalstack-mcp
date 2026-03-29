import { z } from "zod/v3";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CacheManager } from "../cache.js";
import type { RateLimiter } from "../rate-limiter.js";
import { fetchJson } from "../utils.js";

const PROVIDER = "coingecko";
const BASE_URL = "https://api.coingecko.com/api/v3";

function getHeaders(): Record<string, string> {
  const apiKey = process.env["COINGECKO_API_KEY"];
  if (apiKey) {
    return { "x-cg-demo-key": apiKey };
  }
  return {};
}

function makeCacheKey(tool: string, params: Record<string, unknown>): string {
  const sorted = Object.fromEntries(
    Object.entries(params)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
  );
  return `${tool}:${JSON.stringify(sorted)}`;
}

function toolResponse(data: unknown): { content: Array<{ type: "text"; text: string }> } {
  return {
    content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
  };
}

function errorResponse(err: unknown): { content: Array<{ type: "text"; text: string }>; isError: true } {
  const message = err instanceof Error ? err.message : String(err);
  return {
    content: [{ type: "text", text: `Error: ${message}` }],
    isError: true,
  };
}

export function registerCoinGeckoTools(
  server: McpServer,
  cache: CacheManager,
  limiter: RateLimiter
): void {
  // ── coingecko.get_price ───────────────────────────────────────────────────
  server.tool(
    "coingecko.get_price",
    "Get current prices and market data for one or more coins from CoinGecko",
    {
      ids: z
        .array(z.string())
        .min(1)
        .describe("List of CoinGecko coin IDs (e.g. ['bitcoin', 'ethereum'])"),
      vs_currencies: z
        .array(z.string())
        .optional()
        .describe("List of target currencies (e.g. ['usd', 'eur']). Defaults to ['usd']."),
      include_market_cap: z.boolean().optional().describe("Include market cap data"),
      include_24h_vol: z.boolean().optional().describe("Include 24h volume data"),
      include_24h_change: z.boolean().optional().describe("Include 24h price change data"),
    },
    async (args) => {
      try {
        limiter.assertLimit(PROVIDER);
        const vsCurrencies = (args.vs_currencies ?? ["usd"]).join(",");
        const key = makeCacheKey("coingecko.get_price", {
          ids: [...args.ids].sort(),
          vs_currencies: vsCurrencies,
          include_market_cap: args.include_market_cap,
          include_24h_vol: args.include_24h_vol,
          include_24h_change: args.include_24h_change,
        });
        let data = cache.get(key);
        if (!data) {
          limiter.recordUsage(PROVIDER);
          const params = new URLSearchParams({
            ids: args.ids.join(","),
            vs_currencies: vsCurrencies,
            include_market_cap: String(args.include_market_cap ?? true),
            include_24hr_vol: String(args.include_24h_vol ?? true),
            include_24hr_change: String(args.include_24h_change ?? true),
          });
          data = await fetchJson(`${BASE_URL}/simple/price?${params}`, {
            headers: getHeaders(),
          });
          cache.set(key, data, PROVIDER, 60);
        }
        return toolResponse(data);
      } catch (err) {
        return errorResponse(err);
      }
    }
  );

  // ── coingecko.get_market_chart ────────────────────────────────────────────
  server.tool(
    "coingecko.get_market_chart",
    "Get historical market chart data (price, market cap, volume) for a coin from CoinGecko",
    {
      id: z.string().describe("CoinGecko coin ID (e.g. 'bitcoin')"),
      vs_currency: z
        .string()
        .optional()
        .describe("Target currency (e.g. 'usd'). Defaults to 'usd'."),
      days: z.number().int().min(1).describe("Number of days of historical data to retrieve"),
    },
    async (args) => {
      try {
        limiter.assertLimit(PROVIDER);
        const vsCurrency = args.vs_currency ?? "usd";
        const key = makeCacheKey("coingecko.get_market_chart", {
          id: args.id,
          vs_currency: vsCurrency,
          days: args.days,
        });
        let data = cache.get(key);
        if (!data) {
          limiter.recordUsage(PROVIDER);
          const params = new URLSearchParams({
            vs_currency: vsCurrency,
            days: String(args.days),
          });
          data = await fetchJson(
            `${BASE_URL}/coins/${encodeURIComponent(args.id)}/market_chart?${params}`,
            { headers: getHeaders() }
          );
          cache.set(key, data, PROVIDER, 120);
        }
        return toolResponse(data);
      } catch (err) {
        return errorResponse(err);
      }
    }
  );

  // ── coingecko.get_trending ────────────────────────────────────────────────
  server.tool(
    "coingecko.get_trending",
    "Get currently trending coins on CoinGecko (top 7 searched in last 24h)",
    {},
    async () => {
      try {
        limiter.assertLimit(PROVIDER);
        const key = "coingecko.get_trending:{}";
        let data = cache.get(key);
        if (!data) {
          limiter.recordUsage(PROVIDER);
          data = await fetchJson(`${BASE_URL}/search/trending`, {
            headers: getHeaders(),
          });
          cache.set(key, data, PROVIDER, 300);
        }
        return toolResponse(data);
      } catch (err) {
        return errorResponse(err);
      }
    }
  );

  // ── coingecko.get_token_info ──────────────────────────────────────────────
  server.tool(
    "coingecko.get_token_info",
    "Get detailed token information including community and developer data from CoinGecko",
    {
      id: z.string().describe("CoinGecko coin ID (e.g. 'bitcoin', 'ethereum')"),
    },
    async (args) => {
      try {
        limiter.assertLimit(PROVIDER);
        const key = makeCacheKey("coingecko.get_token_info", { id: args.id });
        let data = cache.get(key);
        if (!data) {
          limiter.recordUsage(PROVIDER);
          const params = new URLSearchParams({
            localization: "false",
            tickers: "false",
            community_data: "true",
            developer_data: "true",
          });
          data = await fetchJson(
            `${BASE_URL}/coins/${encodeURIComponent(args.id)}?${params}`,
            { headers: getHeaders() }
          );
          cache.set(key, data, PROVIDER, 86400);
        }
        return toolResponse(data);
      } catch (err) {
        return errorResponse(err);
      }
    }
  );

  // ── coingecko.search ──────────────────────────────────────────────────────
  server.tool(
    "coingecko.search",
    "Search for coins, exchanges, and categories on CoinGecko",
    {
      query: z.string().min(1).describe("Search query string (e.g. 'bitcoin', 'uniswap')"),
    },
    async (args) => {
      try {
        limiter.assertLimit(PROVIDER);
        const key = makeCacheKey("coingecko.search", { query: args.query });
        let data = cache.get(key);
        if (!data) {
          limiter.recordUsage(PROVIDER);
          const params = new URLSearchParams({ query: args.query });
          data = await fetchJson(`${BASE_URL}/search?${params}`, {
            headers: getHeaders(),
          });
          cache.set(key, data, PROVIDER, 300);
        }
        return toolResponse(data);
      } catch (err) {
        return errorResponse(err);
      }
    }
  );

  // ── coingecko.get_ohlcv ───────────────────────────────────────────────────
  server.tool(
    "coingecko.get_ohlcv",
    "Get OHLCV candlestick data for a coin from CoinGecko. Returns array of [timestamp, open, high, low, close].",
    {
      id: z.string().describe("CoinGecko coin ID (e.g. 'bitcoin', 'ethereum')"),
      vs_currency: z
        .string()
        .optional()
        .describe("Target currency (e.g. 'usd'). Defaults to 'usd'."),
      days: z
        .union([
          z.literal(1),
          z.literal(7),
          z.literal(14),
          z.literal(30),
          z.literal(90),
          z.literal(180),
          z.literal(365),
        ])
        .describe("Number of days of OHLCV data: 1, 7, 14, 30, 90, 180, or 365"),
    },
    async (args) => {
      try {
        limiter.assertLimit(PROVIDER);
        const vsCurrency = args.vs_currency ?? "usd";
        const key = makeCacheKey("coingecko.get_ohlcv", {
          id: args.id,
          vs_currency: vsCurrency,
          days: args.days,
        });
        let data = cache.get(key);
        if (!data) {
          limiter.recordUsage(PROVIDER);
          const params = new URLSearchParams({
            vs_currency: vsCurrency,
            days: String(args.days),
          });
          data = await fetchJson(
            `${BASE_URL}/coins/${encodeURIComponent(args.id)}/ohlc?${params}`,
            { headers: getHeaders() }
          );
          cache.set(key, data, PROVIDER, 60);
        }
        return toolResponse(data);
      } catch (err) {
        return errorResponse(err);
      }
    }
  );
}
