/** Header-ready time only: excludes streamed body, browser paint and waitUntil. */
export function withResponseTiming(response: Response, elapsedMs: number): Response {
  const headers = new Headers(response.headers);
  const duration = Number.isFinite(elapsedMs) ? Math.max(0, elapsedMs).toFixed(1) : "0.0";
  headers.append("server-timing", `app;dur=${duration};desc="Response headers ready"`);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
