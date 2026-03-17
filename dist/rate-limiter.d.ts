import { type ProviderRateLimitConfig, type ProviderUsage } from "./types/index.js";
export declare class RateLimiter {
    private configs;
    private slidingWindowRequests;
    private creditUsage;
    registerProvider(provider: string, config: ProviderRateLimitConfig): void;
    checkLimit(provider: string): boolean;
    recordUsage(provider: string, credits?: number): void;
    assertLimit(provider: string): void;
    getUsage(provider: string): ProviderUsage | null;
    getEstimatedCost(): Record<string, unknown>;
    private getMonthlyCreditsUsed;
}
//# sourceMappingURL=rate-limiter.d.ts.map