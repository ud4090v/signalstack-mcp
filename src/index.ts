import "dotenv/config";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CacheManager } from "./cache.js";
import { RateLimiter } from "./rate-limiter.js";
import { registerDefiLlamaTools } from "./providers/defillama.js";
import { registerCoinGeckoTools } from "./providers/coingecko.js";
import { registerDuneTools } from "./providers/dune.js";
import { ScoreStore } from "./scoring/store.js";
import { registerCandleTools } from "./scoring/mcp-tools.js";

async function main(): Promise<void> {
  const server = new McpServer(
    { name: "crypto-research", version: "2.0.0" },
    {
      capabilities: {
        tools: {},
        resources: {},
      },
    }
  );

  const cache = new CacheManager();
  const limiter = new RateLimiter();

  // Register rate limit configs
  limiter.registerProvider("defillama", { maxRequests: 500, windowMs: 60_000 });
  limiter.registerProvider("coingecko", { maxRequests: 30, windowMs: 60_000 });
  limiter.registerProvider("dune", { maxCredits: 2500, period: "month" as const });

  // Register provider tools
  registerDefiLlamaTools(server, cache, limiter);
  registerCoinGeckoTools(server, cache, limiter);
  registerDuneTools(server, cache, limiter);

  // Register candle review tools
  const scoreStore = new ScoreStore();
  registerCandleTools(server, scoreStore);

  // Budget status resource
  server.resource(
    "budget-status",
    "budget://status",
    { description: "Current rate limit usage per provider" },
    async () => {
      const usage = limiter.getEstimatedCost();
      const stats = cache.getStats();
      const report = {
        rateLimitUsage: usage,
        cacheStats: stats,
        timestamp: new Date().toISOString(),
      };
      return {
        contents: [
          {
            uri: "budget://status",
            mimeType: "application/json",
            text: JSON.stringify(report, null, 2),
          },
        ],
      };
    }
  );

  const transport = new StdioServerTransport();

  process.stderr.write(
    "[crypto-mcp-router] Starting crypto-research MCP server v2.0.0\n"
  );
  process.stderr.write(
    `[crypto-mcp-router] Cache DB: ${process.env["CACHE_DB_PATH"] ?? "./cache.db"}\n`
  );
  process.stderr.write(
    `[crypto-mcp-router] CoinGecko API key: ${process.env["COINGECKO_API_KEY"] ? "set" : "not set (free tier)"}\n`
  );
  process.stderr.write(
    `[crypto-mcp-router] Dune API key: ${process.env["DUNE_API_KEY"] ? "set" : "NOT SET — dune tools will fail"}\n`
  );
  process.stderr.write(
    `[crypto-mcp-router] Score DB: ${process.env["SCORE_DB_PATH"] ?? "./scores.db"}\n`
  );
  process.stderr.write(
    "[crypto-mcp-router] Candle Review tools: 3 registered\n"
  );

  await server.connect(transport);

  process.stderr.write("[crypto-mcp-router] Server connected via stdio\n");
}

main().catch((err) => {
  process.stderr.write(`[crypto-mcp-router] Fatal error: ${String(err)}\n`);
  process.exit(1);
});
