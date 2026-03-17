Build the Crypto Research MCP Router — Phase 0 (DefiLlama + CoinGecko providers).

Project is at /root/.openclaw/workspace/projects/crypto-mcp-router/
Dependencies already installed: @modelcontextprotocol/sdk, better-sqlite3, dotenv
TypeScript configured with ESM (type: module, module: Node16).

## Files to Create

### 1. src/types/index.ts — Shared types
Define types for: CacheEntry, RateLimitConfig, ProviderConfig, and common API response shapes.

### 2. src/cache.ts — SQLite Cache Manager
- Uses better-sqlite3
- Creates table: cache_entries (key TEXT PRIMARY KEY, value TEXT, provider TEXT, ttl_seconds INTEGER, created_at INTEGER, expires_at INTEGER)
- Methods: get(key): cached value or null, set(key, value, provider, ttlSeconds), clear(provider?), getStats()
- Auto-cleanup of expired entries on startup and periodically (every 5 min)
- DB path from env CACHE_DB_PATH or default ./cache.db

### 3. src/rate-limiter.ts — Per-Provider Rate Limiter
- In-memory sliding window rate limiter
- Config per provider: { maxRequests: number, windowMs: number } OR { maxCredits: number, period: 'month' }
- Methods: checkLimit(provider): boolean, recordUsage(provider, credits?), getUsage(provider), getEstimatedCost()
- For DefiLlama: 500 req/min (conservative)
- For CoinGecko: 30 req/min (free tier)
- If limit exceeded, throw descriptive error with retry timing

### 4. src/providers/defillama.ts — DefiLlama Provider (7 tools)
Register these MCP tools on the server:

a) defillama.get_protocol — GET https://api.llama.fi/protocol/{slug}
   Input: { protocol_slug: string }
   Cache TTL: 300s (5 min)

b) defillama.get_yields — GET https://yields.llama.fi/pools
   Input: { chain?: string, project?: string, stablecoin_only?: boolean }
   Filter results client-side based on params
   Cache TTL: 900s (15 min)

c) defillama.get_fees — GET https://api.llama.fi/summary/fees/{slug}?dataType=dailyFees
   Input: { protocol_slug: string, period?: '24h'|'7d'|'30d' }
   Cache TTL: 300s

d) defillama.get_chain_tvl — GET https://api.llama.fi/v2/chains (all) or https://api.llama.fi/v2/historicalChainTvl/{chain}
   Input: { chain?: string }
   Cache TTL: 600s (10 min)

e) defillama.get_stablecoins — GET https://stablecoins.llama.fi/stablecoins?includePrices=true
   Input: { chain?: string }
   Cache TTL: 600s

f) defillama.get_bridges — GET https://bridges.llama.fi/bridges?includeChains=true or https://bridges.llama.fi/bridge/{id}
   Input: { bridge_id?: number, chain?: string }
   Cache TTL: 600s

g) defillama.get_token_prices — GET https://coins.llama.fi/prices/current/{coins}
   Input: { coins: string[], timestamp?: number }
   If timestamp: use https://coins.llama.fi/prices/historical/{timestamp}/{coins}
   Cache TTL: 60s

Each tool function should:
1. Check rate limiter
2. Check cache (construct cache key from tool name + params)
3. If cache miss, fetch from API
4. Store in cache
5. Return result as MCP tool response (JSON text content)

### 5. src/providers/coingecko.ts — CoinGecko Provider (5 tools)
Base URL: https://api.coingecko.com/api/v3
If COINGECKO_API_KEY is set, add header: x-cg-demo-key

a) coingecko.get_price — GET /simple/price?ids={ids}&vs_currencies={vs}&include_market_cap=true&include_24hr_vol=true&include_24hr_change=true
   Input: { ids: string[], vs_currencies?: string[], include_market_cap?: boolean, include_24h_vol?: boolean, include_24h_change?: boolean }
   Cache TTL: 60s

b) coingecko.get_market_chart — GET /coins/{id}/market_chart?vs_currency={vs}&days={days}
   Input: { id: string, vs_currency?: string, days: number }
   Cache TTL: 120s (2 min)

c) coingecko.get_trending — GET /search/trending
   Input: {}
   Cache TTL: 300s

d) coingecko.get_token_info — GET /coins/{id}?localization=false&tickers=false&community_data=true&developer_data=true
   Input: { id: string }
   Cache TTL: 86400s (24h)

e) coingecko.search — GET /search?query={query}
   Input: { query: string }
   Cache TTL: 300s

### 6. src/index.ts — MCP Server Entry Point
- Load dotenv
- Create McpServer with name "crypto-research", version "1.0.0"
- Initialize CacheManager and RateLimiter with configs for defillama + coingecko
- Call registerDefiLlamaTools(server, cache, limiter)
- Call registerCoinGeckoTools(server, cache, limiter)
- Add a budget resource: budget://status showing rate limit usage per provider
- Connect via StdioServerTransport
- Log startup to stderr (not stdout — stdout is MCP protocol)

### 7. src/utils.ts — Shared HTTP fetch helper
- fetchJson(url, options?): wraps fetch with error handling, timeout (15s default), User-Agent header
- Handles non-200 responses with descriptive errors

## CONSTRAINTS
- All TypeScript strict, ESM modules
- Imports must use .js extensions (Node16 module resolution)
- No console.log to stdout (MCP uses stdout for protocol) — use console.error or process.stderr for logging
- Cache keys should be deterministic: `${toolName}:${JSON.stringify(sortedParams)}`
- Each tool must have proper inputSchema with descriptions matching the proposal
- Handle API errors gracefully — return error message in MCP tool response, don't crash

After creating all files, run: cd /root/.openclaw/workspace/projects/crypto-mcp-router && npx tsc
Fix any TypeScript errors before finishing.
List every file created.
