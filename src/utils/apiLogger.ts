export function logApiRequest(service: string, method: string, url: string, meta?: Record<string, unknown>): void {
  console.log(`[${service}] → ${method} ${url}`, meta ?? '');
}

export function logApiCacheHit(service: string, label: string, cacheKey: string): void {
  console.log(`[${service}] cache hit: ${label}`, { cacheKey });
}

export function logApiSuccess(
  service: string,
  label: string,
  status: number,
  meta?: Record<string, unknown>
): void {
  console.log(`[${service}] ✓ ${label}`, { status, ...meta });
}

export function logApiError(
  service: string,
  label: string,
  status: number,
  url: string,
  body: string,
  meta?: Record<string, unknown>
): void {
  console.error(`[${service}] ✗ ${label} failed`, { status, url, body, ...meta });
}

export function logApiNetworkError(
  service: string,
  label: string,
  url: string,
  error: unknown
): void {
  console.error(`[${service}] ✗ ${label} network error`, {
    url,
    error: error instanceof Error ? error.message : String(error),
  });
}
