# RapidAPI Listing — SignalStack

**Submission type:** Manual web form  
**URL:** https://rapidapi.com/provider/new  
**Status:** Pending manual submission  
**Priority:** 🔴 High

---

## Listing Fields

**API Name:** SignalStack — Daily Crypto Market Intelligence

**Tagline:** Daily 0-100 crypto market score from 7 real-data categories. Built for developers and AI agents.

**Short Description (120 chars):**
Daily crypto market intelligence: composite 0-100 Candle Review score from DefiLlama, CoinGecko & Dune data.

**Long Description:**
SignalStack is a daily crypto market intelligence API that distills the most important market signals into a single, actionable 0-100 Candle Review score — updated every day at 06:00 UTC.

**How it works:**
Each day, SignalStack pulls live data from DefiLlama, CoinGecko, and Dune Analytics across 7 market categories:
- **Price Action** (25 pts) — BTC/ETH price trends, volume, structure
- **On-Chain** (20 pts) — Exchange reserves, accumulation wallets
- **Derivatives** (20 pts) — Funding rates, open interest, liquidations
- **ETF Flows** (15 pts) — Spot Bitcoin ETF net inflows/outflows
- **Macro** (10 pts) — DXY, risk-on/risk-off signals
- **Dominance** (5 pts) — BTC market dominance trend
- **Sentiment** (5 pts) — Fear & Greed index

The result is a single composite score with a label (Strongly Bullish → Strongly Bearish), category breakdowns, an outlook, and a "what happened today" narrative — all in a clean JSON response.

**Use cases:**
- Portfolio dashboards: display daily market conditions at a glance
- Trading bots: gate strategy execution on market regime
- AI agents: feed structured market context into LLM reasoning
- Research tools: historical score database for backtesting

**Endpoints:**
- `GET /health` — Health check
- `GET /candle/today` — Today's composite score
- `GET /candle/history?limit=30` — Historical scores
- `GET /candle/category/{category}` — Category deep dive (Pro)
- `GET /mcp` — MCP SSE endpoint for AI agent integration

**Category:** Financial / Cryptocurrency

---

## Pricing Tiers

| Tier | Price | Rate Limit | Access |
|------|-------|-----------|--------|
| Free | $0/mo | 100 req/day | `date`, `score`, `label` |
| Pro | $19/mo | 10,000 req/day | Full JSON: categories, outlook, narrative |
| Enterprise | Contact | Unlimited | Custom SLAs |

---

## Technical Details

**Base URL:** 96.126.106.225:3458  
**Auth:** `X-API-Key` header  
**Response format:** JSON  
**Cache-Control:** 5 minutes (300s) on score endpoints  
**OpenAPI spec:** `GET /openapi.yaml`

---

## Submission Notes

- RapidAPI requires account creation and API listing via their provider dashboard
- Upload openapi.yaml during the listing process (they support OpenAPI import)
- Set pricing tiers in their billing panel after initial listing creation
- Test each endpoint using RapidAPI's built-in playground before publishing
