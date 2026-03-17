export interface FetchOptions {
    headers?: Record<string, string>;
    timeoutMs?: number;
}
export declare function fetchJson<T = unknown>(url: string, options?: FetchOptions): Promise<T>;
//# sourceMappingURL=utils.d.ts.map