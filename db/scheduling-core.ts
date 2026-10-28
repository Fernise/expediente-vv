export const OPERATIONAL_SCHEDULE_CLAIMS_TABLE_SQL = `CREATE TABLE IF NOT EXISTS operational_schedule_claims (
  cycle TEXT NOT NULL,
  bucket TEXT NOT NULL,
  claimed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (cycle, bucket)
)`;

export const OPERATIONAL_SCHEDULE_CLAIMS_INDEX_SQL = `CREATE INDEX IF NOT EXISTS operational_schedule_claims_claimed_idx
ON operational_schedule_claims(claimed_at)`;

export type ScheduledCycle = "daily" | "notifications";

export function scheduledBucketFor(cycle: ScheduledCycle, now: Date): string {
  if (cycle === "daily") return now.toISOString().slice(0, 10);
  const bucket = new Date(now);
  bucket.setUTCMinutes(Math.floor(bucket.getUTCMinutes() / 15) * 15, 0, 0);
  return bucket.toISOString().slice(0, 16);
}

export async function claimScheduledCycleIn(
  database: D1Database,
  cycle: ScheduledCycle,
  bucket: string,
): Promise<boolean> {
  const result = await database
    .prepare(
      `INSERT OR IGNORE INTO operational_schedule_claims (cycle, bucket)
       VALUES (?, ?)`,
    )
    .bind(cycle, bucket)
    .run();
  return Number(result.meta.changes ?? 0) === 1;
}

export async function releaseScheduledCycleIn(
  database: D1Database,
  cycle: ScheduledCycle,
  bucket: string,
): Promise<void> {
  await database
    .prepare(
      `DELETE FROM operational_schedule_claims
       WHERE cycle = ? AND bucket = ?`,
    )
    .bind(cycle, bucket)
    .run();
}

export async function purgeScheduledClaimsIn(
  database: D1Database,
): Promise<number> {
  const result = await database
    .prepare(
      `DELETE FROM operational_schedule_claims
       WHERE claimed_at < datetime('now', '-8 days')`,
    )
    .run();
  return Number(result.meta.changes ?? 0);
}
