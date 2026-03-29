import { fetchJson } from "../utils.js";
import type { CandleReview, CategoryScore } from "./types.js";
import { scoreLabel } from "./types.js";

const CG_BASE = "https://api.coingecko.com/api/v3";
const DUNE_BASE = "https://api.dune.com/api/v1";
const DL_BASE = "https://api.llama.fi";

function log(msg: string): void {
  process.stderr.write(`[scoring] ${msg}\n`);
}

function clamp(n: number, max: number): number {
  return Math.min(Math.max(Math.round(n), 0), max);
}

function cgHeaders(): Record<string, string> {
  const key = process.env["COINGECKO_API_KEY"];
  return key ? { "x-cg-demo-key": key } : {};
}

function duneHeaders(): Record<string, string> {
  const key = process.env["DUNE_API_KEY"];
  return key ? { "X-Dune-API-Key": key } : {};
}

// ── Price Action (max 25) ─────────────────────────────────────────────────────
async function scorePriceAction(): Promise<CategoryScore> {
  const MAX = 25;
  try {
    log("price_action: fetching BTC 7d OHLCV + market chart");
    const [ohlcvData, chartData] = await Promise.all([
      fetchJson<number[][]>(
        `${CG_BASE}/coins/bitcoin/ohlc?vs_currency=usd&days=7`,
        { headers: cgHeaders() }
      ),
      fetchJson<{ volumes: number[][] }>(
        `${CG_BASE}/coins/bitcoin/market_chart?vs_currency=usd&days=7`,
        { headers: cgHeaders() }
      ),
    ]);

    // OHLCV: [timestamp, open, high, low, close]
    const candles = ohlcvData;
    if (!candles.length) throw new Error("empty OHLCV data");

    const closes = candles.map((c) => c[4]);
    const avgClose = closes.reduce((a, b) => a + b, 0) / closes.length;
    const todayClose = closes[closes.length - 1];

    // Criterion 1: today's close > 7d avg close
    const closeAboveAvg = todayClose > avgClose;

    // Criterion 2: volume trend (last 3d avg > prior 4d avg)
    const volumes = (chartData.volumes ?? []).map((v) => v[1]);
    let volumeTrendUp = false;
    if (volumes.length >= 7) {
      const last3 = volumes.slice(-3);
      const prior4 = volumes.slice(-7, -3);
      const avg3 = last3.reduce((a, b) => a + b, 0) / last3.length;
      const avg4 = prior4.reduce((a, b) => a + b, 0) / prior4.length;
      volumeTrendUp = avg3 > avg4;
    }

    // Criterion 3: RSI-like momentum (close > open for last 3 candles)
    const last3Candles = candles.slice(-3);
    const momentumPositive = last3Candles.every((c) => c[4] > c[1]); // close > open

    let score = 0;
    if (closeAboveAvg) score += 8;
    if (volumeTrendUp) score += 8;
    if (momentumPositive) score += 9;

    const signals = [
      closeAboveAvg ? "close above 7d avg" : "close below 7d avg",
      volumeTrendUp ? "volume trending up" : "volume trending down",
      momentumPositive ? "bullish momentum (3 green candles)" : "momentum weak",
    ];

    log(`price_action: ${score}/${MAX} — ${signals.join(", ")}`);
    return {
      score: clamp(score, MAX),
      max: MAX,
      summary: `BTC close $${Math.round(todayClose).toLocaleString()} vs 7d avg $${Math.round(avgClose).toLocaleString()}. ${signals.join("; ")}.`,
    };
  } catch (err) {
    log(`price_action: failed — ${String(err)}`);
    return { score: 12, max: MAX, summary: "Price action data unavailable; using midpoint score." };
  }
}

// ── On-Chain (max 20) ─────────────────────────────────────────────────────────
interface DuneResult {
  result?: { rows: Record<string, unknown>[]; metadata?: { total_row_count: number } };
}

async function scoreOnChain(): Promise<CategoryScore> {
  const MAX = 20;
  try {
    log("on_chain: fetching Dune BTC exchange flows (query 2363421)");
    const data = await fetchJson<DuneResult>(
      `${DUNE_BASE}/query/2363421/results?limit=10`,
      { headers: duneHeaders() }
    );

    const rows = data.result?.rows ?? [];
    if (!rows.length) throw new Error("no rows returned");

    // Look for a net flow column — try common column names
    const row = rows[0];
    const netFlow =
      (row["net_flow"] as number | undefined) ??
      (row["net_exchange_flow"] as number | undefined) ??
      (row["net_inflow"] as number | undefined) ??
      null;

    let score: number;
    let summary: string;

    if (netFlow === null) {
      // Can't find column — use row count as signal
      score = 10;
      summary = `BTC exchange flow data retrieved (${rows.length} rows) but net flow column not identified; neutral score applied.`;
    } else if (netFlow < 0) {
      // Net outflow = accumulation (bullish)
      score = 20;
      summary = `Net BTC outflow from exchanges ($${Math.abs(Math.round(netFlow)).toLocaleString()} net withdrawn) — accumulation signal, bullish.`;
    } else if (netFlow > 0) {
      // Net inflow = distribution (bearish)
      score = 0;
      summary = `Net BTC inflow to exchanges ($${Math.round(netFlow).toLocaleString()} net deposited) — distribution signal, bearish.`;
    } else {
      score = 10;
      summary = "BTC exchange flows neutral; no clear accumulation or distribution.";
    }

    log(`on_chain: ${score}/${MAX} — netFlow=${netFlow}`);
    return { score: clamp(score, MAX), max: MAX, summary };
  } catch (err) {
    log(`on_chain: failed — ${String(err)}`);
    return { score: 10, max: MAX, summary: "On-chain exchange flow data unavailable; using midpoint score." };
  }
}

// ── Derivatives (max 20) ──────────────────────────────────────────────────────
async function scoreDerivatives(): Promise<CategoryScore> {
  const MAX = 20;
  try {
    log("derivatives: fetching Dune stablecoin supply (query 3239060)");
    const data = await fetchJson<DuneResult>(
      `${DUNE_BASE}/query/3239060/results?limit=10`,
      { headers: duneHeaders() }
    );

    const rows = data.result?.rows ?? [];
    if (!rows.length) throw new Error("no rows returned");

    // Find total supply — try to sum across rows or find a total column
    const row = rows[0];
    const totalSupply =
      (row["total_supply"] as number | undefined) ??
      (row["supply"] as number | undefined) ??
      (row["total_stablecoin_supply"] as number | undefined) ??
      null;

    // If we have multiple rows, sum a supply column
    let supply = totalSupply;
    if (supply === null && rows.length > 1) {
      const supplyCol = Object.keys(row).find((k) =>
        k.toLowerCase().includes("supply") || k.toLowerCase().includes("amount")
      );
      if (supplyCol) {
        supply = rows.reduce((sum, r) => sum + ((r[supplyCol] as number) || 0), 0);
      }
    }

    let score: number;
    let summary: string;

    if (supply === null || supply === 0) {
      score = 10;
      summary = "Stablecoin supply data retrieved but total could not be parsed; neutral score applied.";
    } else {
      const supplyB = supply / 1e9; // convert to billions
      if (supplyB > 200) {
        score = 15;
        summary = `Total stablecoin supply $${supplyB.toFixed(0)}B — large dry powder available, risk appetite signal positive.`;
      } else if (supplyB > 150) {
        score = 12;
        summary = `Total stablecoin supply $${supplyB.toFixed(0)}B — moderate dry powder, neutral-to-bullish signal.`;
      } else if (supplyB > 100) {
        score = 10;
        summary = `Total stablecoin supply $${supplyB.toFixed(0)}B — stable, neutral signal.`;
      } else {
        score = 5;
        summary = `Total stablecoin supply $${supplyB.toFixed(0)}B — low dry powder, risk appetite signal negative.`;
      }
    }

    log(`derivatives: ${score}/${MAX} — supply=${supply}`);
    return { score: clamp(score, MAX), max: MAX, summary };
  } catch (err) {
    log(`derivatives: failed — ${String(err)}`);
    return { score: 10, max: MAX, summary: "Derivatives/stablecoin data unavailable; using midpoint score." };
  }
}

// ── ETF Flows / DefiLlama (max 15) ────────────────────────────────────────────
interface DefiLlamaTvl {
  tvl?: number;
  currentChainTvls?: Record<string, number>;
}

async function scoreEtfFlows(): Promise<CategoryScore> {
  const MAX = 15;
  try {
    log("etf_flows: fetching DefiLlama ETH staking TVL");
    const data = await fetchJson<DefiLlamaTvl | number>(
      `${DL_BASE}/tvl/ethereum-staking`,
      {}
    );

    let tvlUsd: number;
    if (typeof data === "number") {
      tvlUsd = data;
    } else if (typeof data === "object" && data !== null) {
      tvlUsd =
        (data as DefiLlamaTvl).tvl ??
        Object.values((data as DefiLlamaTvl).currentChainTvls ?? {}).reduce((a, b) => a + b, 0) ??
        0;
    } else {
      throw new Error("unexpected TVL response format");
    }

    const tvlB = tvlUsd / 1e9;
    let score: number;
    let summary: string;

    if (tvlB > 30) {
      score = 15;
      summary = `ETH staking TVL $${tvlB.toFixed(1)}B — very high staking commitment, strong risk-on signal.`;
    } else if (tvlB > 20) {
      score = 10;
      summary = `ETH staking TVL $${tvlB.toFixed(1)}B — healthy staking TVL, moderate positive signal.`;
    } else if (tvlB > 10) {
      score = 7;
      summary = `ETH staking TVL $${tvlB.toFixed(1)}B — moderate staking, neutral signal.`;
    } else {
      score = 3;
      summary = `ETH staking TVL $${tvlB.toFixed(1)}B — low staking TVL, cautious signal.`;
    }

    log(`etf_flows: ${score}/${MAX} — tvl=${tvlB.toFixed(1)}B`);
    return { score: clamp(score, MAX), max: MAX, summary };
  } catch (err) {
    log(`etf_flows: failed — ${String(err)}`);
    return { score: 8, max: MAX, summary: "ETF/staking TVL data unavailable; using midpoint score." };
  }
}

// ── Macro (max 10) + Dominance (max 5) — shared fetch ────────────────────────
interface CgGlobal {
  data?: {
    market_cap_change_percentage_24h_usd?: number;
    btc_dominance?: number; // Note: CG uses "market_cap_percentage.btc"
    market_cap_percentage?: Record<string, number>;
  };
}

async function fetchGlobal(): Promise<CgGlobal["data"] | null> {
  try {
    const resp = await fetchJson<CgGlobal>(`${CG_BASE}/global`, { headers: cgHeaders() });
    return resp.data ?? null;
  } catch {
    return null;
  }
}

async function scoreMacro(globalData: CgGlobal["data"] | null): Promise<CategoryScore> {
  const MAX = 10;
  if (!globalData) {
    log("macro: global data unavailable");
    return { score: 5, max: MAX, summary: "Macro data unavailable; using midpoint score." };
  }

  const change = globalData.market_cap_change_percentage_24h_usd ?? 0;
  let score: number;
  let label: string;

  if (change > 3) {
    score = 10;
    label = "strong bullish";
  } else if (change > 1) {
    score = 8;
    label = "bullish";
  } else if (change > 0) {
    score = 5;
    label = "slightly positive";
  } else if (change > -1) {
    score = 3;
    label = "slightly negative";
  } else {
    score = 0;
    label = "bearish";
  }

  const summary = `Global crypto market cap 24h change: ${change.toFixed(2)}% — macro signal ${label}.`;
  log(`macro: ${score}/${MAX} — change=${change.toFixed(2)}%`);
  return { score: clamp(score, MAX), max: MAX, summary };
}

async function scoreDominance(globalData: CgGlobal["data"] | null): Promise<CategoryScore> {
  const MAX = 5;
  if (!globalData) {
    log("dominance: global data unavailable");
    return { score: 2, max: MAX, summary: "Dominance data unavailable; using midpoint score." };
  }

  const btcDom = globalData.market_cap_percentage?.["btc"] ?? 0;
  let score: number;
  let label: string;

  if (btcDom < 40) {
    score = 5;
    label = "altcoin season (risk-on)";
  } else if (btcDom < 50) {
    score = 3;
    label = "balanced";
  } else {
    score = 1;
    label = "BTC dominance high (flight-to-safety)";
  }

  const summary = `BTC dominance ${btcDom.toFixed(1)}% — ${label}.`;
  log(`dominance: ${score}/${MAX} — btcDom=${btcDom.toFixed(1)}%`);
  return { score: clamp(score, MAX), max: MAX, summary };
}

// ── Sentiment (max 5) ─────────────────────────────────────────────────────────
interface CgTrending {
  coins?: unknown[];
}

async function scoreSentiment(): Promise<CategoryScore> {
  const MAX = 5;
  try {
    log("sentiment: fetching CoinGecko trending coins");
    const data = await fetchJson<CgTrending>(
      `${CG_BASE}/search/trending`,
      { headers: cgHeaders() }
    );

    const count = (data.coins ?? []).length;
    let score: number;

    if (count > 5) {
      score = 5;
    } else if (count >= 3) {
      score = 3;
    } else {
      score = 1;
    }

    const summary = `${count} trending coins on CoinGecko — ${score === 5 ? "high" : score === 3 ? "moderate" : "low"} market engagement.`;
    log(`sentiment: ${score}/${MAX} — trending=${count}`);
    return { score: clamp(score, MAX), max: MAX, summary };
  } catch (err) {
    log(`sentiment: failed — ${String(err)}`);
    return { score: 2, max: MAX, summary: "Sentiment data unavailable; using midpoint score." };
  }
}

// ── Main export ───────────────────────────────────────────────────────────────
export async function generateCandleReview(date: string): Promise<CandleReview> {
  log(`generating review for ${date}`);

  // Fetch global data once (shared between macro + dominance)
  const globalData = await fetchGlobal();
  log(globalData ? "global CG data fetched" : "global CG data unavailable");

  // All categories run concurrently; each is individually try/caught
  const [price_action, on_chain, derivatives, etf_flows, sentiment] = await Promise.all([
    scorePriceAction(),
    scoreOnChain(),
    scoreDerivatives(),
    scoreEtfFlows(),
    scoreSentiment(),
  ]);

  const macro = await scoreMacro(globalData);
  const dominance = await scoreDominance(globalData);

  const score =
    price_action.score +
    on_chain.score +
    derivatives.score +
    etf_flows.score +
    macro.score +
    dominance.score +
    sentiment.score;

  const label = scoreLabel(score);

  // Build human-readable fields
  const bullish = score >= 60;
  const outlook = `${label} outlook for ${date}. Composite score ${score}/100. ` +
    `Price action (${price_action.score}/25), on-chain (${on_chain.score}/20), ` +
    `derivatives (${derivatives.score}/20), ETF/staking (${etf_flows.score}/15), ` +
    `macro (${macro.score}/10), dominance (${dominance.score}/5), sentiment (${sentiment.score}/5).`;

  const what_happened =
    `${price_action.summary} ` +
    `On-chain: ${on_chain.summary} ` +
    `Macro: ${macro.summary} ` +
    `${bullish ? "Overall conditions favour bulls." : "Overall conditions favour caution."}`;

  const review: CandleReview = {
    date,
    score,
    label,
    categories: { price_action, on_chain, derivatives, etf_flows, macro, dominance, sentiment },
    outlook,
    what_happened,
    generated_at: new Date().toISOString(),
  };

  log(`review complete: ${score}/100 — ${label}`);
  return review;
}
