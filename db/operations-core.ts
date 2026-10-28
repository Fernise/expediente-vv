export const OPERATIONAL_RUNS_TABLE_SQL = `CREATE TABLE IF NOT EXISTS operational_runs (
  id TEXT PRIMARY KEY NOT NULL,
  trigger TEXT NOT NULL,
  status TEXT NOT NULL,
  started_at TEXT NOT NULL,
  completed_at TEXT NOT NULL,
  duration_ms INTEGER NOT NULL,
  components_json TEXT NOT NULL DEFAULT '[]',
  failure_codes_json TEXT NOT NULL DEFAULT '[]'
)`;

export const OPERATIONAL_RUNS_INDEX_SQL = `CREATE INDEX IF NOT EXISTS operational_runs_completed_idx
ON operational_runs(completed_at)`;

export type OperationalComponent = {
  name: string;
  status: "failed" | "skipped" | "succeeded";
};

export type OperationalRunInput = {
  completedAt: Date;
  components: OperationalComponent[];
  failureCodes: string[];
  id: string;
  startedAt: Date;
  trigger: string;
};

export type OperationalRunView = {
  completedAt: string;
  components: OperationalComponent[];
  durationMs: number;
  failureCodes: string[];
  id: string;
  status: "failed" | "succeeded";
  trigger: string;
};

export async function recordOperationalRunIn(
  database: D1Database,
  input: OperationalRunInput,
): Promise<void> {
  const components = input.components.map(safeComponent);
  const failureCodes = input.failureCodes.map(safeCode);
  const durationMs = Math.max(
    0,
    input.completedAt.getTime() - input.startedAt.getTime(),
  );
  await database
    .prepare(
      `INSERT INTO operational_runs (
        id, trigger, status, started_at, completed_at, duration_ms,
        components_json, failure_codes_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      input.id,
      safeCode(input.trigger),
      failureCodes.length > 0 ? "failed" : "succeeded",
      sqliteTimestamp(input.startedAt),
      sqliteTimestamp(input.completedAt),
      durationMs,
      JSON.stringify(components),
      JSON.stringify(failureCodes),
    )
    .run();
}

export async function listOperationalRunsIn(
  database: D1Database,
  limit = 12,
): Promise<OperationalRunView[]> {
  const result = await database
    .prepare(
      `SELECT id, trigger, status,
              completed_at AS completedAt,
              duration_ms AS durationMs,
              components_json AS componentsJson,
              failure_codes_json AS failureCodesJson
       FROM operational_runs
       ORDER BY completed_at DESC
       LIMIT ?`,
    )
    .bind(Math.max(1, Math.min(limit, 50)))
    .all<{
      completedAt: string;
      componentsJson: string;
      durationMs: number;
      failureCodesJson: string;
      id: string;
      status: string;
      trigger: string;
    }>();

  return (result.results ?? []).map((row) => ({
    completedAt: row.completedAt,
    components: parseComponents(row.componentsJson),
    durationMs: Number(row.durationMs),
    failureCodes: parseCodes(row.failureCodesJson),
    id: row.id,
    status: row.status === "failed" ? "failed" : "succeeded",
    trigger: row.trigger,
  }));
}

export async function purgeOperationalRunsIn(
  database: D1Database,
): Promise<number> {
  const result = await database
    .prepare(
      `DELETE FROM operational_runs
       WHERE completed_at < datetime('now', '-90 days')`,
    )
    .run();
  return Number(result.meta.changes ?? 0);
}

function safeComponent(component: OperationalComponent): OperationalComponent {
  return {
    name: safeCode(component.name),
    status: ["failed", "skipped", "succeeded"].includes(component.status)
      ? component.status
      : "failed",
  } as OperationalComponent;
}

function safeCode(value: string): string {
  const safe = value.toLowerCase().replace(/[^a-z0-9:_-]/g, "-").slice(0, 80);
  return safe || "unknown";
}

function parseComponents(value: string): OperationalComponent[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(safeComponent) : [];
  } catch {
    return [];
  }
}

function parseCodes(value: string): string[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map((item) => safeCode(String(item))) : [];
  } catch {
    return [];
  }
}

function sqliteTimestamp(value: Date): string {
  return value.toISOString().replace("T", " ").replace("Z", "");
}
