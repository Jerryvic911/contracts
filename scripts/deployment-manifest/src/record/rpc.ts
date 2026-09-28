/** Minimal JSON-RPC 2.0 client. Some public endpoints reject requests without a User-Agent. */
export async function jsonRpc<T>(url: string, method: string, params: unknown): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'user-agent': 'wraith-deployment-manifest' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = (await res.json()) as { result?: T; error?: { message: string } };
      if (body.error) throw new Error(body.error.message);
      return body.result as T;
    } catch (err) {
      lastError = err;
      await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** attempt));
    }
  }
  throw new Error(`${method} on ${url} failed: ${(lastError as Error).message}`);
}

export const isoFromSeconds = (seconds: number) =>
  new Date(seconds * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z');
