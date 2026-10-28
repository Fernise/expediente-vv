const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "form-action 'self'",
  "frame-ancestors 'self' https://chatgpt.com https://*.chatgpt.com https://chat.openai.com https://*.openai.com",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self' 'unsafe-inline'",
  "connect-src 'self'",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
].join("; ");

type SecurityHeaderOptions = {
  production?: boolean;
  requestId?: string;
};

export function withSecurityHeaders(
  request: Request,
  response: Response,
  options: SecurityHeaderOptions = {},
): Response {
  const production = options.production ?? process.env.NODE_ENV === "production";
  const headers = new Headers(response.headers);

  headers.set("x-content-type-options", "nosniff");
  headers.set("referrer-policy", "strict-origin-when-cross-origin");
  headers.set(
    "permissions-policy",
    "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  );
  headers.set("cross-origin-opener-policy", "same-origin");
  headers.set("x-request-id", options.requestId ?? requestIdFor(request));

  if (production) {
    headers.set("content-security-policy", CONTENT_SECURITY_POLICY);
    if (new URL(request.url).protocol === "https:") {
      headers.set("strict-transport-security", "max-age=31536000");
    }
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export function requestIdFor(request: Request): string {
  const cloudflareRay = request.headers.get("cf-ray")?.split("-")[0];
  if (cloudflareRay && /^[a-z0-9-]{8,80}$/i.test(cloudflareRay)) {
    return cloudflareRay;
  }
  return crypto.randomUUID();
}
