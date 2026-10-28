import { database } from "@/db/organizations";
import {
  claimScheduledCycleIn,
  OPERATIONAL_SCHEDULE_CLAIMS_INDEX_SQL,
  OPERATIONAL_SCHEDULE_CLAIMS_TABLE_SQL,
  purgeScheduledClaimsIn,
  releaseScheduledCycleIn,
  scheduledBucketFor,
  type ScheduledCycle,
} from "@/db/scheduling-core";

let initialization: Promise<void> | null = null;

export async function claimScheduledCycle(
  cycle: ScheduledCycle,
  now: Date,
): Promise<{ bucket: string; claimed: boolean }> {
  await ensureSchedulingSchema();
  const bucket = scheduledBucketFor(cycle, now);
  return {
    bucket,
    claimed: await claimScheduledCycleIn(database(), cycle, bucket),
  };
}

export async function releaseScheduledCycle(
  cycle: ScheduledCycle,
  bucket: string,
): Promise<void> {
  await ensureSchedulingSchema();
  await releaseScheduledCycleIn(database(), cycle, bucket);
}

export async function purgeExpiredScheduledClaims(): Promise<number> {
  await ensureSchedulingSchema();
  return purgeScheduledClaimsIn(database());
}

function ensureSchedulingSchema(): Promise<void> {
  if (process.env.NODE_ENV !== "development") return Promise.resolve();
  if (initialization) return initialization;
  const db = database();
  initialization = db
    .batch([
      db.prepare(OPERATIONAL_SCHEDULE_CLAIMS_TABLE_SQL),
      db.prepare(OPERATIONAL_SCHEDULE_CLAIMS_INDEX_SQL),
    ])
    .then(() => undefined)
    .catch((error) => {
      initialization = null;
      throw error;
    });
  return initialization;
}
