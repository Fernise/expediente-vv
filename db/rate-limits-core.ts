export const RATE_LIMIT_TABLE_SQL = `CREATE TABLE IF NOT EXISTS rate_limit_buckets (
  scope TEXT NOT NULL,
  key_hash TEXT NOT NULL,
  window_start INTEGER NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 1,
  expires_at INTEGER NOT NULL,
  PRIMARY KEY (scope, key_hash, window_start)
)`;

export const RATE_LIMIT_EXPIRY_INDEX_SQL = `CREATE INDEX IF NOT EXISTS rate_limit_buckets_expires_idx
ON rate_limit_buckets(expires_at)`;

export type RateLimitPolicy = {
  limit: number;
  scope: "authenticated-mutation" | "document-mutation" | "pilot-demo" | "team-invitation";
  subject: "actor-or-ip" | "ip";
  windowSeconds: number;
};

export type RateLimitResult = {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAfterSeconds: number;
  scope: RateLimitPolicy["scope"];
};

export function rateLimitPolicyFor(request: Request): RateLimitPolicy {
  const pathname = new URL(request.url).pathname;

  if (pathname === "/api/pilot/demo-requests") {
    return {
      limit: 5,
      scope: "pilot-demo",
      subject: "ip",
      windowSeconds: 15 * 60,
    };
  }

  if (pathname.startsWith("/api/team/invitations")) {
    return {
      limit: 10,
      scope: "team-invitation",
      subject: "actor-or-ip",
      windowSeconds: 15 * 60,
    };
  }

  if (pathname.includes("/documents")) {
    return {
      limit: 30,
      scope: "document-mutation",
      subject: "actor-or-ip",
      windowSeconds: 10 * 60,
    };
  }

  return {
    limit: 120,
    scope: "authenticated-mutation",
    subject: "actor-or-ip",
    windowSeconds: 60,
  };
}

export function rateLimitSubjectFor(
  request: Request,
  policy: RateLimitPolicy,
): string {
  if (policy.subject === "actor-or-ip") {
    const actorId = request.headers.get("oai-authenticated-user-id")?.trim();
    if (actorId) return `actor:${actorId}`;
  }

  const connectingIp = request.headers.get("cf-connecting-ip")?.trim();
  return connectingIp ? `ip:${connectingIp}` : "ip:unknown";
}

export async function consumeRateLimit(
  database: D1Database,
  request: Request,
  nowMilliseconds = Date.now(),
): Promise<RateLimitResult> {
  const policy = rateLimitPolicyFor(request);
  const subject = rateLimitSubjectFor(request, policy);
  const keyHash = await sha256(`${policy.scope}\u0000${subject}`);
  const nowSeconds = Math.floor(nowMilliseconds / 1000);
  const windowStart =
    Math.floor(nowSeconds / policy.windowSeconds) * policy.windowSeconds;
  const resetAt = windowStart + policy.windowSeconds;
  const expiresAt = resetAt + policy.windowSeconds;

  const row = await database
    .prepare(
      `INSERT INTO rate_limit_buckets (
        scope, key_hash, window_start, request_count, expires_at
      ) VALUES (?, ?, ?, 1, ?)
      ON CONFLICT(scope, key_hash, window_start) DO UPDATE SET
        request_count = rate_limit_buckets.request_count + 1,
        expires_at = excluded.expires_at
      RETURNING request_count AS requestCount`,
    )
    .bind(policy.scope, keyHash, windowStart, expiresAt)
    .first<{ requestCount: number }>();

  if (!row) {
    throw new Error("Rate limit counter could not be persisted");
  }

  const count = Number(row.requestCount);
  return {
    allowed: count <= policy.limit,
    limit: policy.limit,
    remaining: Math.max(0, policy.limit - count),
    resetAfterSeconds: Math.max(1, resetAt - nowSeconds),
    scope: policy.scope,
  };
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}
