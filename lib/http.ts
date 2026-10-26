// All outbound HTTP to third-party sites goes through here: clear User-Agent, timeout,
// response size cap, and retries with exponential backoff for transient failures.

export const USER_AGENT =
  "ElevateEdgeContentBot/1.0 (+https://www.instagram.com/elevate_edge_consulting/; content research, respects robots.txt)";

export interface FetchTextOptions {
  timeoutMs?: number;
  maxBytes?: number;
  retries?: number;
  accept?: string;
}

export class HttpError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function isRetryable(status: number) {
  return status === 429 || status >= 500;
}

async function readCapped(res: Response, maxBytes: number): Promise<string> {
  if (!res.body) return "";
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new HttpError(`response larger than ${maxBytes} bytes`);
    }
    chunks.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}

export async function fetchText(url: string, opts: FetchTextOptions = {}): Promise<{ text: string; finalUrl: string; contentType: string }> {
  const { timeoutMs = 15000, maxBytes = 3_000_000, retries = 2, accept = "*/*" } = opts;
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) await sleep(1000 * 2 ** (attempt - 1));
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": USER_AGENT, Accept: accept },
        redirect: "follow",
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) {
        const err = new HttpError(`HTTP ${res.status} for ${url}`, res.status);
        if (isRetryable(res.status)) {
          lastError = err;
          continue;
        }
        throw err;
      }
      const text = await readCapped(res, maxBytes);
      return { text, finalUrl: res.url || url, contentType: res.headers.get("content-type") ?? "" };
    } catch (err) {
      if (err instanceof HttpError && err.status && !isRetryable(err.status)) throw err;
      if (err instanceof HttpError && !err.status) throw err; // size cap: retrying won't help
      lastError = err;
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}
