export interface CategoryScore {
  score: number;
  max: number;
  summary: string;
}

export interface CandleReview {
  date: string;           // YYYY-MM-DD
  score: number;          // 0-100 composite
  label: string;          // "Strongly Bullish" | "Bullish" | "Neutral" | "Bearish" | "Strongly Bearish"
  categories: {
    price_action: CategoryScore;  // max 25
    on_chain: CategoryScore;      // max 20
    derivatives: CategoryScore;   // max 20
    etf_flows: CategoryScore;     // max 15
    macro: CategoryScore;         // max 10
    dominance: CategoryScore;     // max 5
    sentiment: CategoryScore;     // max 5
  };
  outlook: string;
  what_happened: string;
  generated_at: string;   // ISO timestamp
}

export function scoreLabel(score: number): string {
  if (score >= 80) return "Strongly Bullish";
  if (score >= 60) return "Bullish";
  if (score >= 40) return "Neutral";
  if (score >= 20) return "Bearish";
  return "Strongly Bearish";
}
