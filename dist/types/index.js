export function isRateLimitConfig(c) {
    return "maxRequests" in c && "windowMs" in c;
}
export function isCreditLimitConfig(c) {
    return "maxCredits" in c && "period" in c;
}
//# sourceMappingURL=index.js.map