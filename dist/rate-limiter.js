import { isRateLimitConfig, isCreditLimitConfig, } from "./types/index.js";
export class RateLimiter {
    configs = new Map();
    slidingWindowRequests = new Map();
    creditUsage = new Map();
    registerProvider(provider, config) {
        this.configs.set(provider, config);
        if (isRateLimitConfig(config)) {
            this.slidingWindowRequests.set(provider, []);
        }
        else {
            this.creditUsage.set(provider, []);
        }
    }
    checkLimit(provider) {
        const config = this.configs.get(provider);
        if (!config)
            return true;
        if (isRateLimitConfig(config)) {
            const now = Date.now();
            const windowStart = now - config.windowMs;
            const requests = (this.slidingWindowRequests.get(provider) ?? []).filter((ts) => ts > windowStart);
            this.slidingWindowRequests.set(provider, requests);
            return requests.length < config.maxRequests;
        }
        if (isCreditLimitConfig(config)) {
            const used = this.getMonthlyCreditsUsed(provider);
            return used < config.maxCredits;
        }
        return true;
    }
    recordUsage(provider, credits = 1) {
        const config = this.configs.get(provider);
        if (!config)
            return;
        const now = Date.now();
        if (isRateLimitConfig(config)) {
            const requests = this.slidingWindowRequests.get(provider) ?? [];
            requests.push(now);
            this.slidingWindowRequests.set(provider, requests);
            return;
        }
        if (isCreditLimitConfig(config)) {
            const usage = this.creditUsage.get(provider) ?? [];
            usage.push({ timestamp: now, credits });
            this.creditUsage.set(provider, usage);
        }
    }
    assertLimit(provider) {
        const config = this.configs.get(provider);
        if (!config)
            return;
        if (!this.checkLimit(provider)) {
            if (isRateLimitConfig(config)) {
                const requests = this.slidingWindowRequests.get(provider) ?? [];
                const windowStart = Date.now() - config.windowMs;
                const active = requests.filter((ts) => ts > windowStart);
                const oldest = active[0];
                const retryAfterMs = oldest ? oldest + config.windowMs - Date.now() : config.windowMs;
                throw new Error(`Rate limit exceeded for ${provider}: ${config.maxRequests} requests per ${config.windowMs}ms. ` +
                    `Retry after ~${Math.ceil(retryAfterMs / 1000)}s.`);
            }
            if (isCreditLimitConfig(config)) {
                const used = this.getMonthlyCreditsUsed(provider);
                throw new Error(`Monthly credit limit exceeded for ${provider}: ${used}/${config.maxCredits} credits used this month.`);
            }
        }
    }
    getUsage(provider) {
        const config = this.configs.get(provider);
        if (!config)
            return null;
        if (isRateLimitConfig(config)) {
            const now = Date.now();
            const windowStart = now - config.windowMs;
            const requests = (this.slidingWindowRequests.get(provider) ?? []).filter((ts) => ts > windowStart);
            return {
                provider,
                requestsInWindow: requests.length,
                config,
            };
        }
        if (isCreditLimitConfig(config)) {
            return {
                provider,
                requestsInWindow: 0,
                creditsUsed: this.getMonthlyCreditsUsed(provider),
                config,
            };
        }
        return null;
    }
    getEstimatedCost() {
        const result = {};
        for (const [provider, config] of this.configs.entries()) {
            if (isCreditLimitConfig(config)) {
                const used = this.getMonthlyCreditsUsed(provider);
                result[provider] = { creditsUsed: used, maxCredits: config.maxCredits };
            }
            else if (isRateLimitConfig(config)) {
                const now = Date.now();
                const windowStart = now - config.windowMs;
                const requests = (this.slidingWindowRequests.get(provider) ?? []).filter((ts) => ts > windowStart);
                result[provider] = {
                    requestsInWindow: requests.length,
                    maxRequests: config.maxRequests,
                    windowMs: config.windowMs,
                };
            }
        }
        return result;
    }
    getMonthlyCreditsUsed(provider) {
        const now = Date.now();
        const monthStart = new Date();
        monthStart.setDate(1);
        monthStart.setHours(0, 0, 0, 0);
        const monthStartMs = monthStart.getTime();
        const usage = (this.creditUsage.get(provider) ?? []).filter((r) => r.timestamp >= monthStartMs && r.timestamp <= now);
        return usage.reduce((sum, r) => sum + r.credits, 0);
    }
}
//# sourceMappingURL=rate-limiter.js.map