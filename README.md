# SignalStack

Daily crypto market intelligence — a 0-100 Candle Review score from real on-chain and market data. Available as a REST API and MCP server for AI agents.

---

## What It Does

Every day at ~06:00 UTC, SignalStack pulls live data from DefiLlama, CoinGecko, and Dune Analytics, scores market conditions across 7 categories, and publishes a structured Candle Review.

**Categories and weights:**
| Category | Max Score |
|----------|-----------|
| Price Action | 25 |
| On-Chain | 20 |
| Derivatives | 20 |
| ETF Flows | 15 |
| Macro | 10 |
| Dominance | 5 |
| Sentiment | 5 |
| **Total** | **100** |

**Score labels:**
- 80-100: Strongly Bullish
- 60-79: Bullish
- 40-59: Neutral
- 20-39: Bearish
- 0-19: Strongly Bearish

---

## REST API — Live

**Base URL:** `http://96.126.106.225:3458`  
**OpenAPI spec:** `GET /openapi.yaml`

### Endpoints

| Endpoint | Tier | Description |
|----------|------|-------------|
| `GET /health` | Free | Health check |
| `GET /candle/today` | Free + Pro | Today's Candle Review |
| `GET /candle/history?limit=30` | Free + Pro | Historical reviews |
| `GET /candle/category/{category}` | Pro only | Category breakdown |
| `GET /openapi.yaml` | Free | OpenAPI 3.0 specification |

### Freemium Tiers

| | Free | Pro |
|--|------|-----|
| API Key | Not required | `X-API-Key` header |
| `/candle/today` | `date`, `score`, `label` | Full JSON |
| `/candle/history` | `date`, `score`, `label` | Full JSON |
| `/candle/category/:cat` | ❌ 403 | ✅ Full breakdown |

### Getting an API Key

Contact the SignalStack team or check the [RapidAPI listing](https://rapidapi.com) for pro tier access. Free tier requires no key.

### Example — Free tier

```bash
curl http://96.126.106.225:3458/candle/today
```

```json
{
  "date": "2026-03-28",
  "score": 67,
  "label": "Bullish"
}
```

### Example — Pro tier

```bash
curl -H "X-API-Key: your-key-here" http://96.126.106.225:3458/candle/today
```

```json
{
  "date": "2026-03-28",
  "score": 67,
  "label": "Bullish",
  "categories": {
    "price_action": { "score": 18, "max": 25, "summary": "BTC up 3.2% on strong volume." },
    "on_chain":     { "score": 14, "max": 20, "summary": "Exchange reserves declining." },
    "derivatives":  { "score": 13, "max": 20, "summary": "Funding rates slightly positive." },
    "etf_flows":    { "score": 11, "max": 15, "summary": "Spot ETF net inflows $400M." },
    "macro":        { "score": 6,  "max": 10, "summary": "DXY weakening, risk-on." },
    "dominance":    { "score": 3,  "max": 5,  "summary": "BTC dominance stable at 54%." },
    "sentiment":    { "score": 2,  "max": 5,  "summary": "Fear & Greed index at 68." }
  },
  "outlook": "Near-term momentum remains bullish.",
  "what_happened": "Spot ETF inflows hit $400M. BTC held above $70k.",
  "generated_at": "2026-03-28T06:00:01.000Z"
}
```

---

## MCP Server — AI Agent Integration

SignalStack exposes an MCP (Model Context Protocol) server via SSE transport for direct AI agent integration.

### Connection

```
SSE endpoint:     GET  http://96.126.106.225:3458/mcp
Request endpoint: POST http://96.126.106.225:3458/mcp
```

### Available MCP Tools

| Tool | Tier | Description |
|------|------|-------------|
| `candle.get_today` | Free + Pro | Today's composite score |
| `candle.get_history` | Free + Pro | Historical reviews |
| `candle.get_category` | Pro | Category breakdown |

### Connecting with an MCP client

```typescript
// Example using MCP SDK
const client = new Client({ name: "my-agent", version: "1.0.0" }, { capabilities: {} });
const transport = new SSEClientTransport(new URL("http://96.126.106.225:3458/mcp"));
await client.connect(transport);

const result = await client.callTool({ name: "candle.get_today", arguments: {} });
```

Pass `X-API-Key` as a header on the SSE connection for pro tier access.

---

## OpenAPI Specification

The full OpenAPI 3.0 spec is served live at:

```
GET http://96.126.106.225:3458/openapi.yaml
```

Also available as a static file at `openapi.yaml` in the project root.

---

## Stack

- **Runtime:** Node.js + TypeScript
- **Framework:** Express
- **Data sources:** DefiLlama (free), CoinGecko (free/demo), Dune Analytics
- **Storage:** SQLite (score store, api-keys.db)
- **Transport:** REST + MCP SSE
- **Deploy:** systemd service + nginx reverse proxy

---

## Directory Listings

SignalStack is listed on:
- [RapidAPI](https://rapidapi.com) — REST API discovery
- [Smithery](https://smithery.ai) — MCP server registry
- [mcp.run](https://www.mcp.run) — MCP server registry
- [Futurepedia](https://www.futurepedia.io) — AI tools directory
- [There's An AI For That](https://theresanaiforthat.com) — AI tools directory

---

## Versions

| Phase | Status | Description |
|-------|--------|-------------|
| P0-P2 | ✅ Complete | MCP tools: DefiLlama + CoinGecko + Dune (21 tools) |
| P3 | ✅ Complete | Candle Review scoring engine |
| P4 | ✅ Complete | REST API + public MCP SSE + freemium gating |
| P5 | ✅ Complete | OpenAPI spec + directory listings |
| P6 | Backlog | Stripe billing integration |
