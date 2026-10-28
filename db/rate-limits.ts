import { database } from "@/db/organizations";
import {
  consumeRateLimit,
  RATE_LIMIT_EXPIRY_INDEX_SQL,
  RATE_LIMIT_TABLE_SQL,
  type RateLimitResult,
} from "@/db/rate-limits-core";

let initialization: Promise<void> | null = null;

export async function consumeMutationRateLimit(
  request: Request,
): Promise<RateLimitResult> {
  await ensureRateLimitSchema();
  return consumeRateLimit(database(), request);
}

export async function purgeExpiredRateLimitBuckets(): Promise<number> {
  await ensureRateLimitSchema();
  const result = await database()
    .prepare(
      `DELETE FROM rate_limit_buckets
       WHERE expires_at <= CAST(strftime('%s', 'now') AS INTEGER)`,
    )
    .run();
  return Number(result.meta.changes ?? 0);
}

function ensureRateLimitSchema(): Promise<void> {
  if (process.env.NODE_ENV !== "development") {
    return Promise.resolve();
  }
  if (initialization) return initialization;

  const db = database();
  initialization = db
    .batch([
      db.prepare(RATE_LIMIT_TABLE_SQL),
      db.prepare(RATE_LIMIT_EXPIRY_INDEX_SQL),
    ])
    .then(() => undefined)
    .catch((error) => {
      initialization = null;
      throw error;
    });
  return initialization;
}
