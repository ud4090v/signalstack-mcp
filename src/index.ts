import "dotenv/config";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CacheManager } from "./cache.js";
import { RateLimiter } from "./rate-limiter.js";
import { registerDefiLlamaTools } from "./providers/defillama.js";
import { registerCoinGeckoTools } from "./providers/coingecko.js";

async function main(): Promise<void> {
  const server = new McpServer(
    { name: "crypto-research", version: "1.0.0" },
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

  // Register provider tools
  registerDefiLlamaTools(server, cache, limiter);
  registerCoinGeckoTools(server, cache, limiter);

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
    "[crypto-mcp-router] Starting crypto-research MCP server v1.0.0\n"
  );
  process.stderr.write(
    `[crypto-mcp-router] Cache DB: ${process.env["CACHE_DB_PATH"] ?? "./cache.db"}\n`
  );
  process.stderr.write(
    `[crypto-mcp-router] CoinGecko API key: ${process.env["COINGECKO_API_KEY"] ? "set" : "not set (free tier)"}\n`
  );

  await server.connect(transport);

  process.stderr.write("[crypto-mcp-router] Server connected via stdio\n");
}

main().catch((err) => {
  process.stderr.write(`[crypto-mcp-router] Fatal error: ${String(err)}\n`);
  process.exit(1);
});
