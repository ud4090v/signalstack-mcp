# Smithery Listing — SignalStack MCP Server

**Submission type:** Manual web form + GitHub repo  
**URL:** https://smithery.ai/server/new  
**Status:** Pending manual submission  
**Priority:** 🔴 High

---

## Listing Fields

**Server Name:** signalstack

**Display Name:** SignalStack — Daily Crypto Market Intelligence

**Tagline:** Daily crypto market intelligence for AI agents. 0-100 Candle Review score from real on-chain and market data.

**Description:**
SignalStack is an MCP server that gives AI agents daily structured crypto market intelligence. It produces a composite 0-100 Candle Review score from live data across 7 market categories — price action, on-chain, derivatives, ETF flows, macro, dominance, and sentiment.

**Available MCP Tools (via SSE transport):**

| Tool | Description |
|------|-------------|
| `candle.get_today` | Get today's composite market score and label |
| `candle.get_history` | Get historical candle reviews (up to 365 days) |
| `candle.get_category` | Get category-level breakdown (Pro) |

**Transport:** SSE (Server-Sent Events) — `GET /mcp`, `POST /mcp`

**Connection:**
```
SSE URL: http://96.126.106.225:3458/mcp
```

**Categories:** Finance, Crypto, Market Data

**Tags:** bitcoin, crypto, market-intelligence, candle-review, defi, on-chain, trading

---

## GitHub Repository

If Smithery requires a repo link:
- Point to the SignalStack project directory
- Include a `smithery.yaml` config file (see below)

**smithery.yaml:**
```yaml
startCommand:
  type: http
  configSchema:
    type: object
    properties:
      apiKey:
        type: string
        description: "Optional API key for pro tier access"
    required: []
```

---

## Pricing / Access

- **Free:** No API key — composite score + label only
- **Pro:** API key via `X-API-Key` header — full category breakdown, outlook, narrative

---

## Submission Notes

- Smithery focuses on MCP server discovery — emphasise AI agent use cases
- The SSE transport is already live at `/mcp` on port 3458
- Include example MCP tool calls in the listing description to demonstrate agent integration
- Smithery may require a public GitHub repo — create one if needed
