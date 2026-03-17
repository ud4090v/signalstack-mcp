import { z } from "zod/v3";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CacheManager } from "../cache.js";
import type { RateLimiter } from "../rate-limiter.js";
import { fetchJson } from "../utils.js";

const PROVIDER = "defillama";

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

export function registerDefiLlamaTools(
  server: McpServer,
  cache: CacheManager,
  limiter: RateLimiter
): void {
  // ── defillama.get_protocol ────────────────────────────────────────────────
  server.tool(
    "defillama.get_protocol",
    "Get protocol TVL, chain breakdown, and metadata from DefiLlama",
    {
      protocol_slug: z
        .string()
        .describe("The protocol slug (e.g. 'aave', 'uniswap')"),
    },
    async (args) => {
      try {
        limiter.assertLimit(PROVIDER);
        const key = makeCacheKey("defillama.get_protocol", { protocol_slug: args.protocol_slug });
        let data = cache.get(key);
        if (!data) {
          limiter.recordUsage(PROVIDER);
          data = await fetchJson(`https://api.llama.fi/protocol/${encodeURIComponent(args.protocol_slug)}`);
          cache.set(key, data, PROVIDER, 300);
        }
        return toolResponse(data);
      } catch (err) {
        return errorResponse(err);
      }
    }
  );

  // ── defillama.get_yields ──────────────────────────────────────────────────
  server.tool(
    "defillama.get_yields",
    "Get yield pool data from DefiLlama, optionally filtered by chain, project, or stablecoin",
    {
      chain: z.string().optional().describe("Filter pools by chain (e.g. 'Ethereum', 'Arbitrum')"),
      project: z.string().optional().describe("Filter pools by project slug (e.g. 'aave-v3')"),
      stablecoin_only: z.boolean().optional().describe("If true, return only stablecoin pools"),
    },
    async (args) => {
      try {
        limiter.assertLimit(PROVIDER);
        const key = makeCacheKey("defillama.get_yields", {
          chain: args.chain,
          project: args.project,
          stablecoin_only: args.stablecoin_only,
        });
        let data = cache.get(key);
        if (!data) {
          limiter.recordUsage(PROVIDER);
          const raw = await fetchJson<{ data: Array<Record<string, unknown>> }>(
            "https://yields.llama.fi/pools"
          );
          let pools = raw.data ?? [];
          if (args.chain) {
            const chain = args.chain.toLowerCase();
            pools = pools.filter((p) => String(p["chain"] ?? "").toLowerCase() === chain);
          }
          if (args.project) {
            const project = args.project.toLowerCase();
            pools = pools.filter((p) => String(p["project"] ?? "").toLowerCase() === project);
          }
          if (args.stablecoin_only) {
            pools = pools.filter((p) => Boolean(p["stablecoin"]));
          }
          data = { pools, count: pools.length };
          cache.set(key, data, PROVIDER, 900);
        }
        return toolResponse(data);
      } catch (err) {
        return errorResponse(err);
      }
    }
  );

  // ── defillama.get_fees ────────────────────────────────────────────────────
  server.tool(
    "defillama.get_fees",
    "Get protocol fee data from DefiLlama for a given time period",
    {
      protocol_slug: z.string().describe("The protocol slug (e.g. 'uniswap')"),
      period: z
        .enum(["24h", "7d", "30d"])
        .optional()
        .describe("Time period for fee aggregation: '24h', '7d', or '30d'. Defaults to '24h'."),
    },
    async (args) => {
      try {
        limiter.assertLimit(PROVIDER);
        const period = args.period ?? "24h";
        const key = makeCacheKey("defillama.get_fees", {
          protocol_slug: args.protocol_slug,
          period,
        });
        let data = cache.get(key);
        if (!data) {
          limiter.recordUsage(PROVIDER);
          data = await fetchJson(
            `https://api.llama.fi/summary/fees/${encodeURIComponent(args.protocol_slug)}?dataType=dailyFees`
          );
          cache.set(key, data, PROVIDER, 300);
        }
        return toolResponse(data);
      } catch (err) {
        return errorResponse(err);
      }
    }
  );

  // ── defillama.get_chain_tvl ───────────────────────────────────────────────
  server.tool(
    "defillama.get_chain_tvl",
    "Get TVL data for all chains or historical TVL for a specific chain",
    {
      chain: z
        .string()
        .optional()
        .describe("Chain name for historical TVL (e.g. 'Ethereum'). Omit to get all chains."),
    },
    async (args) => {
      try {
        limiter.assertLimit(PROVIDER);
        const key = makeCacheKey("defillama.get_chain_tvl", { chain: args.chain });
        let data = cache.get(key);
        if (!data) {
          limiter.recordUsage(PROVIDER);
          if (args.chain) {
            data = await fetchJson(
              `https://api.llama.fi/v2/historicalChainTvl/${encodeURIComponent(args.chain)}`
            );
          } else {
            data = await fetchJson("https://api.llama.fi/v2/chains");
          }
          cache.set(key, data, PROVIDER, 600);
        }
        return toolResponse(data);
      } catch (err) {
        return errorResponse(err);
      }
    }
  );

  // ── defillama.get_stablecoins ─────────────────────────────────────────────
  server.tool(
    "defillama.get_stablecoins",
    "Get stablecoin data including market caps and prices, optionally filtered by chain",
    {
      chain: z
        .string()
        .optional()
        .describe("Filter stablecoins by chain (e.g. 'Ethereum', 'Solana')"),
    },
    async (args) => {
      try {
        limiter.assertLimit(PROVIDER);
        const key = makeCacheKey("defillama.get_stablecoins", { chain: args.chain });
        let data = cache.get(key);
        if (!data) {
          limiter.recordUsage(PROVIDER);
          const raw = await fetchJson<{ peggedAssets: Array<Record<string, unknown>> }>(
            "https://stablecoins.llama.fi/stablecoins?includePrices=true"
          );
          let assets = raw.peggedAssets ?? [];
          if (args.chain) {
            const chain = args.chain.toLowerCase();
            assets = assets.filter((a) => {
              const chainBalances = a["chainBalances"] as Record<string, unknown> | undefined;
              if (!chainBalances) return false;
              return Object.keys(chainBalances).some((c) => c.toLowerCase() === chain);
            });
          }
          data = { stablecoins: assets, count: assets.length };
          cache.set(key, data, PROVIDER, 600);
        }
        return toolResponse(data);
      } catch (err) {
        return errorResponse(err);
      }
    }
  );

  // ── defillama.get_bridges ─────────────────────────────────────────────────
  server.tool(
    "defillama.get_bridges",
    "Get bridge data — all bridges or a specific bridge by ID, optionally filtered by chain",
    {
      bridge_id: z
        .number()
        .int()
        .optional()
        .describe("Numeric bridge ID to fetch a specific bridge"),
      chain: z
        .string()
        .optional()
        .describe("Filter bridges by supported chain (e.g. 'Ethereum')"),
    },
    async (args) => {
      try {
        limiter.assertLimit(PROVIDER);
        const key = makeCacheKey("defillama.get_bridges", {
          bridge_id: args.bridge_id,
          chain: args.chain,
        });
        let data = cache.get(key);
        if (!data) {
          limiter.recordUsage(PROVIDER);
          if (args.bridge_id !== undefined) {
            data = await fetchJson(`https://bridges.llama.fi/bridge/${args.bridge_id}`);
          } else {
            const raw = await fetchJson<{ bridges: Array<Record<string, unknown>> }>(
              "https://bridges.llama.fi/bridges?includeChains=true"
            );
            let bridges = raw.bridges ?? [];
            if (args.chain) {
              const chain = args.chain.toLowerCase();
              bridges = bridges.filter((b) => {
                const chains = b["chains"] as string[] | undefined;
                return chains?.some((c) => c.toLowerCase() === chain);
              });
            }
            data = { bridges, count: bridges.length };
          }
          cache.set(key, data, PROVIDER, 600);
        }
        return toolResponse(data);
      } catch (err) {
        return errorResponse(err);
      }
    }
  );

  // ── defillama.get_token_prices ────────────────────────────────────────────
  server.tool(
    "defillama.get_token_prices",
    "Get current or historical token prices from DefiLlama coins API",
    {
      coins: z
        .array(z.string())
        .min(1)
        .describe(
          "Array of coin identifiers in 'chain:address' format (e.g. ['ethereum:0xabcd...', 'coingecko:bitcoin'])"
        ),
      timestamp: z
        .number()
        .int()
        .optional()
        .describe("Unix timestamp for historical prices. Omit for current prices."),
    },
    async (args) => {
      try {
        limiter.assertLimit(PROVIDER);
        const key = makeCacheKey("defillama.get_token_prices", {
          coins: [...args.coins].sort(),
          timestamp: args.timestamp,
        });
        let data = cache.get(key);
        if (!data) {
          limiter.recordUsage(PROVIDER);
          const coinsParam = args.coins.map(encodeURIComponent).join(",");
          let url: string;
          if (args.timestamp !== undefined) {
            url = `https://coins.llama.fi/prices/historical/${args.timestamp}/${coinsParam}`;
          } else {
            url = `https://coins.llama.fi/prices/current/${coinsParam}`;
          }
          data = await fetchJson(url);
          cache.set(key, data, PROVIDER, 60);
        }
        return toolResponse(data);
      } catch (err) {
        return errorResponse(err);
      }
    }
  );
}
