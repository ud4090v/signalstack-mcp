import { z } from "zod/v3";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CacheManager } from "../cache.js";
import type { RateLimiter } from "../rate-limiter.js";
import { fetchJson } from "../utils.js";

const PROVIDER = "dune";
const BASE_URL = "https://api.dune.com/api/v1";

// Polling config for execute-and-wait
const POLL_INTERVAL_MS = 2_000;
const MAX_POLL_ATTEMPTS = 90; // 3 minutes max wait

// Pre-built query library — curated Dune query IDs for crypto research
const QUERY_LIBRARY: Record<string, { queryId: number; description: string; params?: Record<string, string> }> = {
  // Exchange flows — net CEX deposits/withdrawals
  "btc_exchange_flows": {
    queryId: 2363421,
    description: "BTC net exchange inflows/outflows over the last 30 days",
  },
  "eth_exchange_flows": {
    queryId: 2363422,
    description: "ETH net exchange inflows/outflows over the last 30 days",
  },
  // DEX volumes
  "dex_weekly_volume": {
    queryId: 1847,
    description: "Weekly DEX trading volume across all major DEXes",
  },
  // Stablecoin supply
  "stablecoin_supply": {
    queryId: 3239060,
    description: "Total stablecoin supply by issuer (USDT, USDC, DAI, etc.)",
  },
  // Gas & activity
  "eth_gas_tracker": {
    queryId: 2340658,
    description: "Ethereum gas price statistics over the last 24 hours",
  },
  // NFT market
  "nft_marketplace_volume": {
    queryId: 2353545,
    description: "NFT marketplace trading volume by platform",
  },
  // L2 activity
  "l2_transaction_count": {
    queryId: 3106677,
    description: "Daily transaction counts across L2 rollups (Arbitrum, Optimism, Base, etc.)",
  },
};

function getApiKey(): string {
  const key = process.env["DUNE_API_KEY"];
  if (!key) throw new Error("DUNE_API_KEY is not set. Add it to your environment.");
  return key;
}

function getHeaders(): Record<string, string> {
  return { "X-Dune-API-Key": getApiKey() };
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

interface ExecuteResponse {
  execution_id: string;
  state: string;
}

interface ExecutionStatus {
  execution_id: string;
  query_id: number;
  state: string;
  result_metadata?: {
    column_names: string[];
    result_set_bytes: number;
    total_row_count: number;
  };
  error?: {
    type: string;
    message: string;
  };
}

interface QueryResult {
  execution_id: string;
  query_id: number;
  state: string;
  result: {
    rows: Record<string, unknown>[];
    metadata: {
      column_names: string[];
      result_set_bytes: number;
      total_row_count: number;
    };
  };
}

/**
 * Polls execution status until complete, failed, or timeout.
 */
async function pollExecution(executionId: string): Promise<ExecutionStatus> {
  for (let i = 0; i < MAX_POLL_ATTEMPTS; i++) {
    const status = await fetchJson<ExecutionStatus>(
      `${BASE_URL}/execution/${executionId}/status`,
      { headers: getHeaders() }
    );

    if (status.state === "QUERY_STATE_COMPLETED" || status.state === "QUERY_STATE_COMPLETED_PARTIAL") {
      return status;
    }
    if (status.state === "QUERY_STATE_FAILED") {
      const errMsg = status.error?.message ?? "Query execution failed";
      throw new Error(`Dune query failed: ${errMsg}`);
    }
    if (status.state === "QUERY_STATE_CANCELED") {
      throw new Error("Dune query was canceled");
    }
    if (status.state === "QUERY_STATE_EXPIRED") {
      throw new Error("Dune query result expired");
    }

    // Still pending or executing — wait and retry
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }

  throw new Error(`Dune query timed out after ${(MAX_POLL_ATTEMPTS * POLL_INTERVAL_MS) / 1000}s`);
}

export function registerDuneTools(
  server: McpServer,
  cache: CacheManager,
  limiter: RateLimiter
): void {
  // ── dune.execute_query ────────────────────────────────────────────────────
  server.tool(
    "dune.execute_query",
    "Execute a Dune Analytics saved query by ID. Triggers execution, polls until complete, and returns results. Consumes Dune API credits.",
    {
      query_id: z
        .number()
        .int()
        .positive()
        .describe("The Dune query ID to execute"),
      parameters: z
        .record(z.string(), z.union([z.string(), z.number()]))
        .optional()
        .describe("Query parameters as key-value pairs (e.g. {\"address\": \"0x123...\", \"days\": 30})"),
      performance: z
        .enum(["medium", "large"])
        .optional()
        .describe("Execution tier — 'medium' (default) or 'large' for complex queries"),
    },
    async (args) => {
      try {
        limiter.assertLimit(PROVIDER);

        const key = makeCacheKey("dune.execute_query", {
          query_id: args.query_id,
          parameters: args.parameters,
        });
        const cached = cache.get(key);
        if (cached) return toolResponse(cached);

        limiter.recordUsage(PROVIDER, 10); // Execute costs ~10 credits

        // Trigger execution
        const body: Record<string, unknown> = {};
        if (args.parameters) body.query_parameters = args.parameters;
        if (args.performance) body.performance = args.performance;

        const postResponse = await fetch(
          `${BASE_URL}/query/${args.query_id}/execute`,
          {
            method: "POST",
            headers: {
              ...getHeaders(),
              "Content-Type": "application/json",
            },
            body: JSON.stringify(body),
          }
        );

        if (!postResponse.ok) {
          const errText = await postResponse.text().catch(() => "");
          throw new Error(`Dune execute failed: HTTP ${postResponse.status} ${errText.slice(0, 200)}`);
        }

        const executeResult = (await postResponse.json()) as ExecuteResponse;
        const executionId = executeResult.execution_id;

        process.stderr.write(
          `[crypto-mcp-router] Dune query ${args.query_id} executing (${executionId})\n`
        );

        // Poll until complete
        await pollExecution(executionId);

        // Fetch results
        limiter.recordUsage(PROVIDER, 1); // Result fetch costs credits based on size
        const result = await fetchJson<QueryResult>(
          `${BASE_URL}/execution/${executionId}/results?limit=1000`,
          { headers: getHeaders() }
        );

        const responseData = {
          query_id: args.query_id,
          execution_id: executionId,
          state: result.state,
          rows: result.result?.rows ?? [],
          row_count: result.result?.metadata?.total_row_count ?? 0,
          columns: result.result?.metadata?.column_names ?? [],
        };

        // Cache for 5 minutes (Dune data doesn't change that frequently)
        cache.set(key, responseData, PROVIDER, 300);

        return toolResponse(responseData);
      } catch (err) {
        return errorResponse(err);
      }
    }
  );

  // ── dune.get_latest_result ────────────────────────────────────────────────
  server.tool(
    "dune.get_latest_result",
    "Get the latest cached result for a Dune query by ID. Does NOT trigger a new execution — returns the most recent result available. Cheaper than execute_query.",
    {
      query_id: z
        .number()
        .int()
        .positive()
        .describe("The Dune query ID to fetch latest results for"),
      limit: z
        .number()
        .int()
        .min(1)
        .max(1000)
        .optional()
        .describe("Maximum number of rows to return (default 100, max 1000)"),
    },
    async (args) => {
      try {
        limiter.assertLimit(PROVIDER);

        const limit = args.limit ?? 100;
        const key = makeCacheKey("dune.get_latest_result", {
          query_id: args.query_id,
          limit,
        });
        const cached = cache.get(key);
        if (cached) return toolResponse(cached);

        limiter.recordUsage(PROVIDER, 1);

        const result = await fetchJson<QueryResult>(
          `${BASE_URL}/query/${args.query_id}/results?limit=${limit}`,
          { headers: getHeaders() }
        );

        const responseData = {
          query_id: args.query_id,
          execution_id: result.execution_id,
          state: result.state,
          rows: result.result?.rows ?? [],
          row_count: result.result?.metadata?.total_row_count ?? 0,
          columns: result.result?.metadata?.column_names ?? [],
        };

        // Cache for 5 minutes
        cache.set(key, responseData, PROVIDER, 300);

        return toolResponse(responseData);
      } catch (err) {
        return errorResponse(err);
      }
    }
  );

  // ── dune.get_execution_status ─────────────────────────────────────────────
  server.tool(
    "dune.get_execution_status",
    "Check the status of a Dune query execution by execution ID. Free — does not consume credits.",
    {
      execution_id: z
        .string()
        .describe("The execution ID returned from dune.execute_query"),
    },
    async (args) => {
      try {
        // Status checks are free — no rate limit needed
        const status = await fetchJson<ExecutionStatus>(
          `${BASE_URL}/execution/${args.execution_id}/status`,
          { headers: getHeaders() }
        );

        return toolResponse(status);
      } catch (err) {
        return errorResponse(err);
      }
    }
  );

  // ── dune.list_queries ─────────────────────────────────────────────────────
  server.tool(
    "dune.list_queries",
    "List available pre-built Dune queries in the crypto research library. These are curated queries for common crypto research tasks.",
    {},
    async () => {
      try {
        const queries = Object.entries(QUERY_LIBRARY).map(([slug, q]) => ({
          slug,
          query_id: q.queryId,
          description: q.description,
        }));

        return toolResponse({
          queries,
          usage: "Use dune.get_latest_result or dune.execute_query with the query_id to fetch data",
          count: queries.length,
        });
      } catch (err) {
        return errorResponse(err);
      }
    }
  );

  // ── dune.run_library_query ────────────────────────────────────────────────
  server.tool(
    "dune.run_library_query",
    "Execute a pre-built query from the crypto research library by slug name. Fetches the latest cached result (cheaper) unless force_execute is true.",
    {
      slug: z
        .string()
        .describe(`Query slug from the library. Available: ${Object.keys(QUERY_LIBRARY).join(", ")}`),
      force_execute: z
        .boolean()
        .optional()
        .describe("If true, triggers a fresh execution instead of using cached results. Default: false."),
      limit: z
        .number()
        .int()
        .min(1)
        .max(1000)
        .optional()
        .describe("Maximum rows to return (default 100)"),
    },
    async (args) => {
      try {
        const queryDef = QUERY_LIBRARY[args.slug];
        if (!queryDef) {
          const available = Object.keys(QUERY_LIBRARY).join(", ");
          return errorResponse(new Error(`Unknown query slug '${args.slug}'. Available: ${available}`));
        }

        limiter.assertLimit(PROVIDER);

        const limit = args.limit ?? 100;
        const key = makeCacheKey("dune.run_library_query", {
          slug: args.slug,
          limit,
        });

        if (!args.force_execute) {
          const cached = cache.get(key);
          if (cached) return toolResponse(cached);
        }

        if (args.force_execute) {
          // Execute fresh
          limiter.recordUsage(PROVIDER, 10);

          const postResponse = await fetch(
            `${BASE_URL}/query/${queryDef.queryId}/execute`,
            {
              method: "POST",
              headers: {
                ...getHeaders(),
                "Content-Type": "application/json",
              },
              body: JSON.stringify(queryDef.params ? { query_parameters: queryDef.params } : {}),
            }
          );

          if (!postResponse.ok) {
            const errText = await postResponse.text().catch(() => "");
            throw new Error(`Dune execute failed: HTTP ${postResponse.status} ${errText.slice(0, 200)}`);
          }

          const executeResult = (await postResponse.json()) as ExecuteResponse;
          process.stderr.write(
            `[crypto-mcp-router] Dune library query '${args.slug}' (${queryDef.queryId}) executing\n`
          );

          await pollExecution(executeResult.execution_id);

          limiter.recordUsage(PROVIDER, 1);
          const result = await fetchJson<QueryResult>(
            `${BASE_URL}/execution/${executeResult.execution_id}/results?limit=${limit}`,
            { headers: getHeaders() }
          );

          const responseData = {
            slug: args.slug,
            description: queryDef.description,
            query_id: queryDef.queryId,
            execution_id: executeResult.execution_id,
            rows: result.result?.rows ?? [],
            row_count: result.result?.metadata?.total_row_count ?? 0,
            columns: result.result?.metadata?.column_names ?? [],
          };

          cache.set(key, responseData, PROVIDER, 300);
          return toolResponse(responseData);
        }

        // Default: get latest cached result (cheaper)
        limiter.recordUsage(PROVIDER, 1);
        const result = await fetchJson<QueryResult>(
          `${BASE_URL}/query/${queryDef.queryId}/results?limit=${limit}`,
          { headers: getHeaders() }
        );

        const responseData = {
          slug: args.slug,
          description: queryDef.description,
          query_id: queryDef.queryId,
          execution_id: result.execution_id,
          rows: result.result?.rows ?? [],
          row_count: result.result?.metadata?.total_row_count ?? 0,
          columns: result.result?.metadata?.column_names ?? [],
        };

        cache.set(key, responseData, PROVIDER, 300);
        return toolResponse(responseData);
      } catch (err) {
        return errorResponse(err);
      }
    }
  );
}
