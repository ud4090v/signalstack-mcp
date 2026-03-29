# mcp.run Listing — SignalStack MCP Server

**Submission type:** Manual web form  
**URL:** https://www.mcp.run  
**Status:** Pending manual submission  
**Priority:** 🔴 High

---

## Listing Fields

**Server Name:** signalstack

**Display Name:** SignalStack Daily Crypto Intelligence

**Short Description:**
Daily crypto market intelligence for AI agents — composite 0-100 Candle Review score from live on-chain, derivatives, ETF, and macro data.

**Full Description:**
SignalStack is a production MCP server delivering structured daily crypto market intelligence. Every day at 06:00 UTC, it aggregates live data from DefiLlama, CoinGecko, and Dune Analytics across 7 market categories and produces a clean 0-100 composite score.

**AI agents can query:**
- Today's market regime (Strongly Bullish → Strongly Bearish) in a single tool call
- Historical score database for context and trend detection
- Per-category scores to understand which signals are driving conditions
- Market narrative: what happened today, and what to watch next

**MCP Tools:**

```
candle.get_today()
  → { date, score, label [, categories, outlook, what_happened] }

candle.get_history(limit?)
  → Array of daily reviews (free: score+label, pro: full)

candle.get_category(category)
  → { score, max, pct, summary } for one of 7 categories
  (Pro tier — requires X-API-Key header)
```

**Transport:** SSE (Server-Sent Events)  
**SSE Endpoint:** `GET http://[host]:3458/mcp`  
**Request Endpoint:** `POST http://[host]:3458/mcp`

**Categories:** Finance, Data & Analytics, Crypto

**Tags:** crypto, bitcoin, market-data, candle-review, on-chain, trading, ai-agent

---

## Authentication

Pass `X-API-Key` header when connecting via SSE for pro tier access. Omit for free tier (composite score only).

---

## Submission Notes

- mcp.run is a registry for discoverable MCP servers — focus on agent-centric copy
- Emphasise single-call simplicity: one tool call = today's market regime
- The SSE transport is live and tested
- If mcp.run requires a manifest or config file, provide the smithery.yaml format (compatible)
