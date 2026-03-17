export interface CacheEntry {
  key: string;
  value: string;
  provider: string;
  ttl_seconds: number;
  created_at: number;
  expires_at: number;
}

export interface CacheStats {
  total: number;
  byProvider: Record<string, number>;
  expiredCleaned?: number;
}

export interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
}

export interface CreditLimitConfig {
  maxCredits: number;
  period: "month";
}

export type ProviderRateLimitConfig = RateLimitConfig | CreditLimitConfig;

export interface ProviderConfig {
  name: string;
  rateLimit: ProviderRateLimitConfig;
}

export interface UsageRecord {
  timestamp: number;
  credits: number;
}

export interface ProviderUsage {
  provider: string;
  requestsInWindow: number;
  creditsUsed?: number;
  config: ProviderRateLimitConfig;
}

export function isRateLimitConfig(c: ProviderRateLimitConfig): c is RateLimitConfig {
  return "maxRequests" in c && "windowMs" in c;
}

export function isCreditLimitConfig(c: ProviderRateLimitConfig): c is CreditLimitConfig {
  return "maxCredits" in c && "period" in c;
}
