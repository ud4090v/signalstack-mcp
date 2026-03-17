const DEFAULT_TIMEOUT_MS = 15_000;
const USER_AGENT = "crypto-mcp-router/1.0.0";
export async function fetchJson(url, options = {}) {
    const { headers = {}, timeoutMs = DEFAULT_TIMEOUT_MS } = options;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response;
    try {
        response = await fetch(url, {
            signal: controller.signal,
            headers: {
                "User-Agent": USER_AGENT,
                Accept: "application/json",
                ...headers,
            },
        });
    }
    catch (err) {
        clearTimeout(timer);
        if (err instanceof Error && err.name === "AbortError") {
            throw new Error(`Request timed out after ${timeoutMs}ms: ${url}`);
        }
        throw new Error(`Network error fetching ${url}: ${String(err)}`);
    }
    clearTimeout(timer);
    if (!response.ok) {
        let body = "";
        try {
            body = await response.text();
        }
        catch {
            // ignore
        }
        throw new Error(`HTTP ${response.status} ${response.statusText} from ${url}${body ? `: ${body.slice(0, 200)}` : ""}`);
    }
    const data = (await response.json());
    return data;
}
//# sourceMappingURL=utils.js.map