import type { CacheStats } from "./types/index.js";
export declare class CacheManager {
    private db;
    private cleanupTimer;
    constructor();
    private init;
    private cleanup;
    get(key: string): unknown | null;
    set(key: string, value: unknown, provider: string, ttlSeconds: number): void;
    clear(provider?: string): void;
    getStats(): CacheStats;
    close(): void;
}
//# sourceMappingURL=cache.d.ts.map