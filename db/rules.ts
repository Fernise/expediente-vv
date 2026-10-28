import {
  database,
  ensureCoreSchema,
  getMembershipContext,
  type ActorInput,
  type MembershipContext,
} from "@/db/organizations";
import {
  AuthorizationError,
  getPropertyDossier,
  NotFoundError,
  type PropertyDossier,
  ValidationError,
} from "@/db/properties";
import { can, type Capability, type Role } from "@/lib/permissions";
import {
  detectRuleConflicts,
  evaluateRules,
  RULE_ENGINE_VERSION,
  summarizeEvaluations,
  type FactValue,
  type RuleCondition,
  type RuleDefinition,
  type RuleEvaluationResult,
} from "@/lib/rules-engine";
import {
  nextRuleWorkflowStatus,
  type RuleWorkflowAction,
  type RuleWorkflowStatus,
} from "@/lib/rule-workflow";

export type {
  RuleWorkflowAction,
  RuleWorkflowStatus,
} from "@/lib/rule-workflow";

export type FactDefinitionRecord = {
  factKey: string;
  label: string;
  value: boolean | null;
  valueType: "boolean";
};

export type RuleCatalogItem = {
  condition: RuleCondition;
  displayExplanation: string;
  displayTitle: string;
  matchedResult: "applies" | "not_applies";
  requirementId: string;
  ruleId: string;
  ruleStableKey: string;
  ruleVersionId: string;
  sourceIssuer: string;
  sourceTitle: string;
  validationStatus: string;
  versionNumber: number;
};

export type RuleCatalog = {
  comparison: {
    changes: Array<{
      fields: string[];
      ruleStableKey: string;
      title: string;
    }>;
    fromLabel: string;
    toLabel: string;
  } | null;
  conflicts: Array<{
    conditionLabel: string;
    requirementId: string;
    ruleVersionIds: string[];
  }>;
  history: Array<{
    contentHash: string;
    createdAt: string;
    id: string;
    label: string;
    validationStatus: RuleWorkflowStatus;
    versionNumber: number;
  }>;
  reviewHistory: Array<{
    action: RuleWorkflowAction;
    actorName: string;
    actorUserId: string;
    createdAt: string;
    id: string;
    note: string | null;
  }>;
  rules: RuleCatalogItem[];
  ruleSet: {
    contentHash: string;
    createdByName: string;
    createdByUserId: string;
    label: string;
    ruleSetVersionId: string;
    validationStatus: RuleWorkflowStatus;
    versionNumber: number;
  };
  source: {
    consultedAt: string;
    issuer: string;
    status: string;
    territoryScope: string;
    title: string;
  };
};

export type CreateRuleDraftInput = {
  displayExplanation: string;
  displayTitle: string;
  expectedValue: boolean;
  factKey: string;
  organizationId: string;
  ruleStableKey: string;
};

export type ChangeRuleWorkflowInput = {
  action: RuleWorkflowAction;
  note?: string;
  organizationId: string;
  ruleSetVersionId: string;
};

export type EvaluationItemRecord = {
  actualValue: FactValue;
  displayExplanation: string;
  displayTitle: string;
  expectedValue: boolean | string;
  factKey: string;
  reason: string;
  result: RuleEvaluationResult;
};

export type EvaluationRecord = {
  contentHash: string;
  engineVersion: string;
  evaluatedAt: string;
  id: string;
  items: EvaluationItemRecord[];
  ruleSetLabel: string;
  summary: {
    applies: number;
    not_applies: number;
    unknown: number;
  };
};

export type PropertyRulesWorkspace = {
  evaluation: EvaluationRecord | null;
  facts: FactDefinitionRecord[];
  ruleSetLabel: string;
};

const DEMO_FACTS = [
  {
    factKey: "dossier.identity_evidence_available",
    label: "Evidencia identificativa disponible",
  },
  {
    factKey: "dossier.contact_channel_available",
    label: "Canal de contacto registrado",
  },
  {
    factKey: "dossier.relevant_dates_recorded",
    label: "Fechas relevantes registradas",
  },
] as const;

const DEMO_RULES = [
  {
    explanation:
      "Señala trabajo documental pendiente cuando se declara que no hay evidencia identificativa disponible.",
    factKey: "dossier.identity_evidence_available",
    stableKey: "demo.identity-evidence.missing",
    title: "Reunir la evidencia identificativa disponible",
  },
  {
    explanation:
      "Señala una tarea operativa cuando todavía no hay un canal de contacto registrado.",
    factKey: "dossier.contact_channel_available",
    stableKey: "demo.contact-channel.missing",
    title: "Registrar un canal de contacto",
  },
  {
    explanation:
      "Señala una tarea de preparación cuando las fechas relevantes aún no están registradas.",
    factKey: "dossier.relevant_dates_recorded",
    stableKey: "demo.relevant-dates.missing",
    title: "Completar las fechas relevantes conocidas",
  },
] as const;

let rulesInitialization: Promise<void> | null = null;

export async function ensureRulesSchema(): Promise<void> {
  if (process.env.NODE_ENV !== "development") {
    return;
  }
  await ensureCoreSchema();
  if (rulesInitialization) return rulesInitialization;
  const db = database();

  rulesInitialization = db
    .batch([
      db.prepare(
        `CREATE TABLE IF NOT EXISTS fact_definitions (
          id TEXT PRIMARY KEY NOT NULL,
          organization_id TEXT NOT NULL,
          fact_key TEXT NOT NULL,
          label TEXT NOT NULL,
          value_type TEXT NOT NULL,
          allowed_values_json TEXT NOT NULL DEFAULT '[]',
          sensitivity TEXT NOT NULL DEFAULT 'normal',
          status TEXT NOT NULL DEFAULT 'active',
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
          UNIQUE (organization_id, fact_key)
        )`,
      ),
      db.prepare(
        `CREATE TABLE IF NOT EXISTS property_facts (
          id TEXT PRIMARY KEY NOT NULL,
          organization_id TEXT NOT NULL,
          property_id TEXT NOT NULL,
          fact_definition_id TEXT NOT NULL,
          fact_key TEXT NOT NULL,
          value_type TEXT NOT NULL,
          text_value TEXT,
          boolean_value INTEGER,
          source TEXT NOT NULL DEFAULT 'declared',
          confidence TEXT NOT NULL DEFAULT 'declared',
          observed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_by TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
          FOREIGN KEY (fact_definition_id) REFERENCES fact_definitions(id),
          FOREIGN KEY (updated_by) REFERENCES app_users(id),
          FOREIGN KEY (organization_id, property_id) REFERENCES properties(organization_id, id),
          UNIQUE (organization_id, property_id, fact_key)
        )`,
      ),
      db.prepare(
        `CREATE TABLE IF NOT EXISTS requirements (
          id TEXT PRIMARY KEY NOT NULL,
          organization_id TEXT NOT NULL,
          stable_key TEXT NOT NULL,
          category TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'active',
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
          UNIQUE (organization_id, stable_key),
          UNIQUE (organization_id, id)
        )`,
      ),
      db.prepare(
        `CREATE TABLE IF NOT EXISTS rules (
          id TEXT PRIMARY KEY NOT NULL,
          organization_id TEXT NOT NULL,
          stable_key TEXT NOT NULL,
          name TEXT NOT NULL,
          requirement_id TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'active',
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
          FOREIGN KEY (organization_id, requirement_id) REFERENCES requirements(organization_id, id),
          UNIQUE (organization_id, stable_key),
          UNIQUE (organization_id, id)
        )`,
      ),
      db.prepare(
        `CREATE TABLE IF NOT EXISTS rule_versions (
          id TEXT PRIMARY KEY NOT NULL,
          organization_id TEXT NOT NULL,
          rule_id TEXT NOT NULL,
          version_number INTEGER NOT NULL,
          territory_scope TEXT NOT NULL,
          effective_from TEXT,
          effective_to TEXT,
          review_due_at TEXT,
          validation_status TEXT NOT NULL DEFAULT 'draft_unvalidated',
          condition_json TEXT NOT NULL,
          outcome_json TEXT NOT NULL,
          display_title TEXT NOT NULL,
          display_explanation TEXT NOT NULL,
          content_hash TEXT NOT NULL,
          created_by TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
          FOREIGN KEY (created_by) REFERENCES app_users(id),
          FOREIGN KEY (organization_id, rule_id) REFERENCES rules(organization_id, id),
          UNIQUE (organization_id, rule_id, version_number),
          UNIQUE (organization_id, id)
        )`,
      ),
      db.prepare(
        `CREATE TABLE IF NOT EXISTS source_references (
          id TEXT PRIMARY KEY NOT NULL,
          organization_id TEXT NOT NULL,
          issuer TEXT NOT NULL,
          title TEXT NOT NULL,
          official_url TEXT,
          publication_date TEXT,
          consulted_at TEXT NOT NULL,
          territory_scope TEXT NOT NULL,
          source_type TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'draft',
          review_due_at TEXT,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
          UNIQUE (organization_id, id)
        )`,
      ),
      db.prepare(
        `CREATE TABLE IF NOT EXISTS rule_version_sources (
          organization_id TEXT NOT NULL,
          rule_version_id TEXT NOT NULL,
          source_reference_id TEXT NOT NULL,
          locator TEXT,
          note TEXT,
          PRIMARY KEY (organization_id, rule_version_id, source_reference_id),
          FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
          FOREIGN KEY (organization_id, rule_version_id) REFERENCES rule_versions(organization_id, id),
          FOREIGN KEY (organization_id, source_reference_id) REFERENCES source_references(organization_id, id)
        )`,
      ),
      db.prepare(
        `CREATE TABLE IF NOT EXISTS rule_sets (
          id TEXT PRIMARY KEY NOT NULL,
          organization_id TEXT NOT NULL,
          stable_key TEXT NOT NULL,
          name TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'active',
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
          UNIQUE (organization_id, stable_key),
          UNIQUE (organization_id, id)
        )`,
      ),
      db.prepare(
        `CREATE TABLE IF NOT EXISTS rule_set_versions (
          id TEXT PRIMARY KEY NOT NULL,
          organization_id TEXT NOT NULL,
          rule_set_id TEXT NOT NULL,
          version_number INTEGER NOT NULL,
          label TEXT NOT NULL,
          validation_status TEXT NOT NULL DEFAULT 'draft_unvalidated',
          content_hash TEXT NOT NULL,
          created_by TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
          FOREIGN KEY (created_by) REFERENCES app_users(id),
          FOREIGN KEY (organization_id, rule_set_id) REFERENCES rule_sets(organization_id, id),
          UNIQUE (organization_id, rule_set_id, version_number),
          UNIQUE (organization_id, id)
        )`,
      ),
      db.prepare(
        `CREATE TABLE IF NOT EXISTS rule_set_version_rules (
          organization_id TEXT NOT NULL,
          rule_set_version_id TEXT NOT NULL,
          rule_version_id TEXT NOT NULL,
          position INTEGER NOT NULL,
          PRIMARY KEY (organization_id, rule_set_version_id, rule_version_id),
          FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
          FOREIGN KEY (organization_id, rule_set_version_id) REFERENCES rule_set_versions(organization_id, id),
          FOREIGN KEY (organization_id, rule_version_id) REFERENCES rule_versions(organization_id, id)
        )`,
      ),
      db.prepare(
        `CREATE TABLE IF NOT EXISTS rule_review_events (
          id TEXT PRIMARY KEY NOT NULL,
          organization_id TEXT NOT NULL,
          rule_set_version_id TEXT NOT NULL,
          action TEXT NOT NULL,
          note TEXT,
          actor_user_id TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
          FOREIGN KEY (actor_user_id) REFERENCES app_users(id),
          FOREIGN KEY (organization_id, rule_set_version_id) REFERENCES rule_set_versions(organization_id, id)
        )`,
      ),
      db.prepare(
        `CREATE TABLE IF NOT EXISTS rule_evaluations (
          id TEXT PRIMARY KEY NOT NULL,
          organization_id TEXT NOT NULL,
          property_id TEXT NOT NULL,
          rule_set_version_id TEXT NOT NULL,
          fact_snapshot_json TEXT NOT NULL,
          result_summary_json TEXT NOT NULL,
          content_hash TEXT NOT NULL,
          engine_version TEXT NOT NULL,
          evaluated_by TEXT NOT NULL,
          evaluated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
          FOREIGN KEY (evaluated_by) REFERENCES app_users(id),
          FOREIGN KEY (organization_id, property_id) REFERENCES properties(organization_id, id),
          FOREIGN KEY (organization_id, rule_set_version_id) REFERENCES rule_set_versions(organization_id, id),
          UNIQUE (organization_id, id)
        )`,
      ),
      db.prepare(
        `CREATE TABLE IF NOT EXISTS rule_evaluation_items (
          id TEXT PRIMARY KEY NOT NULL,
          organization_id TEXT NOT NULL,
          evaluation_id TEXT NOT NULL,
          rule_version_id TEXT NOT NULL,
          requirement_id TEXT NOT NULL,
          result TEXT NOT NULL,
          trace_json TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
          FOREIGN KEY (organization_id, evaluation_id) REFERENCES rule_evaluations(organization_id, id),
          FOREIGN KEY (organization_id, rule_version_id) REFERENCES rule_versions(organization_id, id),
          FOREIGN KEY (organization_id, requirement_id) REFERENCES requirements(organization_id, id)
        )`,
      ),
      db.prepare(
        "CREATE INDEX IF NOT EXISTS property_facts_property_idx ON property_facts(organization_id, property_id)",
      ),
      db.prepare(
        "CREATE INDEX IF NOT EXISTS rule_evaluations_property_idx ON rule_evaluations(organization_id, property_id, evaluated_at)",
      ),
      db.prepare(
        "CREATE INDEX IF NOT EXISTS rule_evaluation_items_evaluation_idx ON rule_evaluation_items(organization_id, evaluation_id)",
      ),
      db.prepare(
        "CREATE INDEX IF NOT EXISTS rule_review_events_version_idx ON rule_review_events(organization_id, rule_set_version_id, created_at)",
      ),
    ])
    .then(() => undefined)
    .catch((error: unknown) => {
      rulesInitialization = null;
      throw error;
    });

  return rulesInitialization!;
}

export async function getRuleCatalog(
  actor: ActorInput,
  organizationId: string,
): Promise<RuleCatalog> {
  await ensureRulesSchema();
  const membership = await authorize(actor, organizationId, "rules.read");
  await ensureDemoRuleSet(organizationId, membership.userId);
  const db = database();
  const ids = demoIds(organizationId);
  const historyResult = await db
    .prepare(
      `SELECT
        id,
        version_number AS versionNumber,
        label,
        content_hash AS contentHash,
        validation_status AS validationStatus,
        created_at AS createdAt
      FROM rule_set_versions
      WHERE organization_id = ? AND rule_set_id = ?
      ORDER BY version_number DESC`,
    )
    .bind(organizationId, ids.ruleSet)
    .all<RuleCatalog["history"][number]>();
  const history = historyResult.results ?? [];
  const currentHistory = history[0];
  if (!currentHistory) {
    throw new NotFoundError("Versión de reglas no encontrada.");
  }

  const ruleSet = await db
    .prepare(
      `SELECT
        rsv.id AS ruleSetVersionId,
        rsv.version_number AS versionNumber,
        rsv.label,
        rsv.validation_status AS validationStatus,
        rsv.content_hash AS contentHash,
        rsv.created_by AS createdByUserId,
        u.display_name AS createdByName
      FROM rule_set_versions rsv
      INNER JOIN app_users u ON u.id = rsv.created_by
      WHERE rsv.organization_id = ? AND rsv.id = ?
      LIMIT 1`,
    )
    .bind(organizationId, currentHistory.id)
    .first<RuleCatalog["ruleSet"]>();
  if (!ruleSet) throw new NotFoundError("Versión de reglas no encontrada.");

  const rules = await loadCatalogRules(
    db,
    organizationId,
    ruleSet.ruleSetVersionId,
  );

  const source = await db
    .prepare(
      `SELECT
        issuer,
        title,
        consulted_at AS consultedAt,
        territory_scope AS territoryScope,
        status
      FROM source_references
      WHERE organization_id = ? AND id = ?
      LIMIT 1`,
    )
    .bind(organizationId, ids.source)
    .first<RuleCatalog["source"]>();
  if (!source) throw new NotFoundError("Fuente de demostración no encontrada.");

  const previousHistory = history[1];
  const previousRules = previousHistory
    ? await loadCatalogRules(db, organizationId, previousHistory.id)
    : [];
  const engineRules: RuleDefinition[] = rules.map((rule) => ({
    condition: rule.condition,
    displayExplanation: rule.displayExplanation,
    displayTitle: rule.displayTitle,
    id: rule.ruleVersionId,
    matchedResult: rule.matchedResult,
    requirementId: rule.requirementId,
  }));
  const conflicts = detectRuleConflicts(engineRules).map((conflict) => ({
    conditionLabel: describeCondition(JSON.parse(conflict.conditionKey)),
    requirementId: conflict.requirementId,
    ruleVersionIds: conflict.ruleVersionIds,
  }));
  const reviewResult = await db
    .prepare(
      `SELECT
        rre.id,
        rre.action,
        rre.note,
        rre.actor_user_id AS actorUserId,
        u.display_name AS actorName,
        rre.created_at AS createdAt
      FROM rule_review_events rre
      INNER JOIN app_users u ON u.id = rre.actor_user_id
      WHERE rre.organization_id = ? AND rre.rule_set_version_id = ?
      ORDER BY rre.created_at DESC, rre.id DESC`,
    )
    .bind(organizationId, ruleSet.ruleSetVersionId)
    .all<RuleCatalog["reviewHistory"][number]>();

  return {
    comparison: previousHistory
      ? {
          changes: compareCatalogRules(previousRules, rules),
          fromLabel: previousHistory.label,
          toLabel: currentHistory.label,
        }
      : null,
    conflicts,
    history,
    reviewHistory: reviewResult.results ?? [],
    rules,
    ruleSet,
    source,
  };
}

export async function createRuleDraftVersion(
  actor: ActorInput,
  input: CreateRuleDraftInput,
): Promise<{ label: string; ruleSetVersionId: string }> {
  await ensureRulesSchema();
  const membership = await authorize(
    actor,
    input.organizationId,
    "rules.draft",
  );
  const catalog = await getRuleCatalog(actor, input.organizationId);
  const currentRule = catalog.rules.find(
    (rule) => rule.ruleStableKey === input.ruleStableKey,
  );
  if (!currentRule) throw new NotFoundError("Regla no encontrada.");
  if (
    catalog.ruleSet.validationStatus !== "draft_unvalidated" &&
    catalog.ruleSet.validationStatus !== "approved"
  ) {
    throw new ValidationError(
      "La versión está dentro del circuito de revisión y no puede editarse.",
    );
  }
  if (!DEMO_FACTS.some((fact) => fact.factKey === input.factKey)) {
    throw new ValidationError("Selecciona un hecho registrado.");
  }
  const displayTitle = cleanRuleText(
    input.displayTitle,
    "Título",
    4,
    120,
  );
  const displayExplanation = cleanRuleText(
    input.displayExplanation,
    "Explicación",
    12,
    400,
  );
  const db = database();
  const nextVersionRow = await db
    .prepare(
      `SELECT COALESCE(MAX(version_number), 0) + 1 AS nextVersion
       FROM rule_versions
       WHERE organization_id = ? AND rule_id = ?`,
    )
    .bind(input.organizationId, currentRule.ruleId)
    .first<{ nextVersion: number }>();
  const nextRuleVersion = Number(nextVersionRow?.nextVersion ?? 1);
  const nextSetVersion = catalog.ruleSet.versionNumber + 1;
  const newRuleVersionId = crypto.randomUUID();
  const newRuleSetVersionId = crypto.randomUUID();
  const condition: RuleCondition = {
    factKey: input.factKey,
    operator: "equals",
    value: input.expectedValue,
  };
  const outcome = {
    matched: currentRule.matchedResult,
    unmatched:
      currentRule.matchedResult === "applies"
        ? "not_applies"
        : "applies",
  };
  const ruleContentHash = await sha256(
    stableJson({
      condition,
      displayExplanation,
      displayTitle,
      outcome,
      ruleId: currentRule.ruleId,
      version: nextRuleVersion,
    }),
  );
  const setContentHash = await sha256(
    `${catalog.ruleSet.contentHash}|${newRuleVersionId}|${ruleContentHash}`,
  );
  const newLabel = `VV-DEMO · 0.${nextSetVersion}`;
  const links = await db
    .prepare(
      `SELECT
        rsvr.rule_version_id AS ruleVersionId,
        rv.rule_id AS ruleId,
        rsvr.position
      FROM rule_set_version_rules rsvr
      INNER JOIN rule_versions rv
        ON rv.organization_id = rsvr.organization_id
        AND rv.id = rsvr.rule_version_id
      WHERE rsvr.organization_id = ? AND rsvr.rule_set_version_id = ?
      ORDER BY rsvr.position`,
    )
    .bind(input.organizationId, catalog.ruleSet.ruleSetVersionId)
    .all<{ position: number; ruleId: string; ruleVersionId: string }>();
  const sourceLinks = await db
    .prepare(
      `SELECT source_reference_id AS sourceReferenceId, locator, note
       FROM rule_version_sources
       WHERE organization_id = ? AND rule_version_id = ?`,
    )
    .bind(input.organizationId, currentRule.ruleVersionId)
    .all<{
      locator: string | null;
      note: string | null;
      sourceReferenceId: string;
    }>();

  const statements: D1PreparedStatement[] = [
    db
      .prepare(
        `INSERT INTO rule_versions (
          id, organization_id, rule_id, version_number, territory_scope,
          validation_status, condition_json, outcome_json, display_title,
          display_explanation, content_hash, created_by
        ) VALUES (?, ?, ?, ?, 'Canarias · demostración', 'draft_unvalidated',
          ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        newRuleVersionId,
        input.organizationId,
        currentRule.ruleId,
        nextRuleVersion,
        stableJson(condition),
        stableJson(outcome),
        displayTitle,
        displayExplanation,
        ruleContentHash,
        membership.userId,
      ),
    db
      .prepare(
        `INSERT INTO rule_set_versions (
          id, organization_id, rule_set_id, version_number, label,
          validation_status, content_hash, created_by
        ) VALUES (?, ?, ?, ?, ?, 'draft_unvalidated', ?, ?)`,
      )
      .bind(
        newRuleSetVersionId,
        input.organizationId,
        demoIds(input.organizationId).ruleSet,
        nextSetVersion,
        newLabel,
        setContentHash,
        membership.userId,
      ),
  ];

  for (const sourceLink of sourceLinks.results ?? []) {
    statements.push(
      db
        .prepare(
          `INSERT INTO rule_version_sources (
            organization_id, rule_version_id, source_reference_id, locator, note
          ) VALUES (?, ?, ?, ?, ?)`,
        )
        .bind(
          input.organizationId,
          newRuleVersionId,
          sourceLink.sourceReferenceId,
          sourceLink.locator,
          sourceLink.note,
        ),
    );
  }
  for (const link of links.results ?? []) {
    statements.push(
      db
        .prepare(
          `INSERT INTO rule_set_version_rules (
            organization_id, rule_set_version_id, rule_version_id, position
          ) VALUES (?, ?, ?, ?)`,
        )
        .bind(
          input.organizationId,
          newRuleSetVersionId,
          link.ruleId === currentRule.ruleId
            ? newRuleVersionId
            : link.ruleVersionId,
          link.position,
        ),
    );
  }
  statements.push(
    auditStatement(
      db,
      membership,
      "rule_version.created",
      "rule_version",
      newRuleVersionId,
      {
        basedOn: currentRule.ruleVersionId,
        ruleSetVersion: newLabel,
        validationStatus: "draft_unvalidated",
      },
    ),
  );
  await db.batch(statements);
  return { label: newLabel, ruleSetVersionId: newRuleSetVersionId };
}

export async function changeRuleWorkflow(
  actor: ActorInput,
  input: ChangeRuleWorkflowInput,
): Promise<{ status: RuleWorkflowStatus }> {
  await ensureRulesSchema();
  const capability: Capability =
    input.action === "submitted" || input.action === "withdrawn"
      ? "rules.draft"
      : input.action === "approved"
        ? "rules.approve"
        : "rules.review";
  const membership = await authorize(
    actor,
    input.organizationId,
    capability,
  );
  const catalog = await getRuleCatalog(actor, input.organizationId);
  if (catalog.ruleSet.ruleSetVersionId !== input.ruleSetVersionId) {
    throw new ValidationError(
      "Solo se puede tramitar la versión activa del laboratorio.",
    );
  }

  const currentStatus = catalog.ruleSet.validationStatus;
  const nextStatus = nextRuleWorkflowStatus(currentStatus, input.action);
  if (!nextStatus) {
    throw new ValidationError(
      "La acción no corresponde con el estado editorial actual.",
    );
  }
  if (
    input.action === "submitted" &&
    catalog.conflicts.length > 0
  ) {
    throw new ValidationError(
      "Resuelve los conflictos estructurales antes de enviar la versión.",
    );
  }
  if (
    input.action === "professionally_reviewed" &&
    membership.userId === catalog.ruleSet.createdByUserId
  ) {
    throw new ValidationError(
      "La revisión profesional debe realizarla una persona distinta de quien creó la versión.",
    );
  }
  const professionalReview = catalog.reviewHistory.find(
    (event) => event.action === "professionally_reviewed",
  );
  if (
    input.action === "approved" &&
    (membership.userId === catalog.ruleSet.createdByUserId ||
      membership.userId === professionalReview?.actorUserId)
  ) {
    throw new ValidationError(
      "La aprobación debe realizarla una tercera persona distinta de autoría y revisión.",
    );
  }

  const note = cleanWorkflowNote(input.note, input.action);
  const db = database();
  const eventId = crypto.randomUUID();
  await db.batch([
    db
      .prepare(
        `UPDATE rule_set_versions
         SET validation_status = ?
         WHERE organization_id = ? AND id = ? AND validation_status = ?`,
      )
      .bind(
        nextStatus,
        input.organizationId,
        input.ruleSetVersionId,
        currentStatus,
      ),
    db
      .prepare(
        `INSERT INTO rule_review_events (
          id, organization_id, rule_set_version_id, action, note, actor_user_id
        ) VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        eventId,
        input.organizationId,
        input.ruleSetVersionId,
        input.action,
        note,
        membership.userId,
      ),
    auditStatement(
      db,
      membership,
      `rule_workflow.${input.action}`,
      "rule_set_version",
      input.ruleSetVersionId,
      {
        fromStatus: currentStatus,
        note,
        toStatus: nextStatus,
      },
    ),
  ]);
  return { status: nextStatus };
}

export async function getPropertyRulesWorkspace(
  actor: ActorInput,
  organizationId: string,
  propertyId: string,
): Promise<PropertyRulesWorkspace> {
  await getPropertyDossier(actor, organizationId, propertyId);
  return readPropertyRulesWorkspace(actor, organizationId, propertyId);
}

export async function getPropertyDossierRulesWorkspace(
  actor: ActorInput,
  organizationId: string,
  propertyId: string,
): Promise<{
  dossier: PropertyDossier;
  rulesWorkspace: PropertyRulesWorkspace;
}> {
  const dossier = await getPropertyDossier(actor, organizationId, propertyId);
  const rulesWorkspace = await readPropertyRulesWorkspace(
    actor,
    organizationId,
    propertyId,
  );
  return { dossier, rulesWorkspace };
}

async function readPropertyRulesWorkspace(
  actor: ActorInput,
  organizationId: string,
  propertyId: string,
): Promise<PropertyRulesWorkspace> {
  const catalog = await getRuleCatalog(actor, organizationId);
  const db = database();
  const [factsResult, evaluation] = await Promise.all([
    db
      .prepare(
        `SELECT
          fd.fact_key AS factKey,
          fd.label,
          fd.value_type AS valueType,
          pf.boolean_value AS booleanValue
        FROM fact_definitions fd
        LEFT JOIN property_facts pf
          ON pf.organization_id = fd.organization_id
          AND pf.fact_definition_id = fd.id
          AND pf.property_id = ?
        WHERE fd.organization_id = ? AND fd.status = 'active'
        ORDER BY fd.fact_key`,
      )
      .bind(propertyId, organizationId)
      .all<{
        booleanValue: number | null;
        factKey: string;
        label: string;
        valueType: "boolean";
      }>(),
    readLatestEvaluation(
      organizationId,
      propertyId,
      catalog.ruleSet.ruleSetVersionId,
      catalog.ruleSet.label,
    ),
  ]);

  return {
    evaluation,
    facts: (factsResult.results ?? []).map((fact) => ({
      factKey: fact.factKey,
      label: fact.label,
      value:
        fact.booleanValue === null || fact.booleanValue === undefined
          ? null
          : Boolean(fact.booleanValue),
      valueType: fact.valueType,
    })),
    ruleSetLabel: catalog.ruleSet.label,
  };
}

export async function saveFactsAndEvaluate(
  actor: ActorInput,
  organizationId: string,
  propertyId: string,
  values: Record<string, unknown>,
): Promise<EvaluationRecord> {
  await ensureRulesSchema();
  const membership = await authorize(actor, organizationId, "property.update");
  await getPropertyDossier(actor, organizationId, propertyId);
  const catalog = await getRuleCatalog(actor, organizationId);
  const normalized = normalizeFactValues(values);
  const db = database();
  const ids = demoIds(organizationId);
  const factStatements: D1PreparedStatement[] = [];

  for (const definition of DEMO_FACTS) {
    const value = normalized[definition.factKey];
    if (value === null) {
      factStatements.push(
        db
          .prepare(
            `DELETE FROM property_facts
             WHERE organization_id = ? AND property_id = ? AND fact_key = ?`,
          )
          .bind(organizationId, propertyId, definition.factKey),
      );
      continue;
    }
    factStatements.push(
      db
        .prepare(
          `INSERT INTO property_facts (
            id, organization_id, property_id, fact_definition_id, fact_key,
            value_type, boolean_value, source, confidence, updated_by
          ) VALUES (?, ?, ?, ?, ?, 'boolean', ?, 'declared', 'declared', ?)
          ON CONFLICT(organization_id, property_id, fact_key) DO UPDATE SET
            boolean_value = excluded.boolean_value,
            source = 'declared',
            confidence = 'declared',
            observed_at = CURRENT_TIMESTAMP,
            updated_by = excluded.updated_by,
            updated_at = CURRENT_TIMESTAMP`,
        )
        .bind(
          `${organizationId}:${propertyId}:${definition.factKey}`,
          organizationId,
          propertyId,
          `${ids.factPrefix}${definition.factKey}`,
          definition.factKey,
          value ? 1 : 0,
          membership.userId,
        ),
    );
  }
  await db.batch(factStatements);

  const rules = await loadRulesForEvaluation(
    organizationId,
    catalog.ruleSet.ruleSetVersionId,
  );
  const evaluations = evaluateRules(normalized, rules);
  const summary = summarizeEvaluations(evaluations);
  const factSnapshotJson = stableJson(normalized);
  const resultSummaryJson = stableJson(summary);
  const contentHash = await sha256(
    `${catalog.ruleSet.contentHash}|${factSnapshotJson}|${resultSummaryJson}|${RULE_ENGINE_VERSION}`,
  );
  const evaluationId = crypto.randomUUID();
  const statements: D1PreparedStatement[] = [
    db
      .prepare(
        `INSERT INTO rule_evaluations (
          id, organization_id, property_id, rule_set_version_id,
          fact_snapshot_json, result_summary_json, content_hash,
          engine_version, evaluated_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        evaluationId,
        organizationId,
        propertyId,
        catalog.ruleSet.ruleSetVersionId,
        factSnapshotJson,
        resultSummaryJson,
        contentHash,
        RULE_ENGINE_VERSION,
        membership.userId,
      ),
  ];

  for (const evaluation of evaluations) {
    statements.push(
      db
        .prepare(
          `INSERT INTO rule_evaluation_items (
            id, organization_id, evaluation_id, rule_version_id,
            requirement_id, result, trace_json
          ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          organizationId,
          evaluationId,
          evaluation.ruleVersionId,
          evaluation.requirementId,
          evaluation.result,
          stableJson(evaluation.trace),
        ),
    );
  }
  statements.push(
    auditStatement(
      db,
      membership,
      "rules.evaluated",
      "rule_evaluation",
      evaluationId,
      {
        engineVersion: RULE_ENGINE_VERSION,
        ruleSetVersion: catalog.ruleSet.label,
        summary,
      },
    ),
  );
  await db.batch(statements);

  const result = await readLatestEvaluation(
    organizationId,
    propertyId,
    catalog.ruleSet.ruleSetVersionId,
    catalog.ruleSet.label,
  );
  if (!result) throw new Error("Evaluation could not be read after creation");
  return result;
}

async function ensureDemoRuleSet(
  organizationId: string,
  userId: string,
): Promise<void> {
  const db = database();
  const ids = demoIds(organizationId);
  const sourceDate = "2026-07-30";
  const statements: D1PreparedStatement[] = [];

  for (const fact of DEMO_FACTS) {
    statements.push(
      db
        .prepare(
          `INSERT OR IGNORE INTO fact_definitions (
            id, organization_id, fact_key, label, value_type,
            allowed_values_json, sensitivity, status
          ) VALUES (?, ?, ?, ?, 'boolean', '[true,false]', 'normal', 'active')`,
        )
        .bind(
          `${ids.factPrefix}${fact.factKey}`,
          organizationId,
          fact.factKey,
          fact.label,
        ),
    );
  }

  statements.push(
    db
      .prepare(
        `INSERT OR IGNORE INTO source_references (
          id, organization_id, issuer, title, consulted_at,
          territory_scope, source_type, status, review_due_at
        ) VALUES (?, ?, 'Expediente VV', 'Marco operativo de demostración VV',
          ?, 'Canarias · demostración', 'internal_demo', 'draft', '2026-10-30')`,
      )
      .bind(ids.source, organizationId, sourceDate),
    db
      .prepare(
        `INSERT OR IGNORE INTO rule_sets (
          id, organization_id, stable_key, name, status
        ) VALUES (?, ?, 'vv-demo-trace', 'Reglas operativas de demostración', 'active')`,
      )
      .bind(ids.ruleSet, organizationId),
    db
      .prepare(
        `INSERT OR IGNORE INTO rule_set_versions (
          id, organization_id, rule_set_id, version_number, label,
          validation_status, content_hash, created_by
        ) VALUES (?, ?, ?, 2, 'VV-DEMO · 0.2', 'draft_unvalidated',
          'demo-ruleset-v0.2', ?)`,
      )
      .bind(ids.ruleSetVersion, organizationId, ids.ruleSet, userId),
  );

  DEMO_RULES.forEach((rule, index) => {
    const requirementId = `${ids.requirementPrefix}${index + 1}`;
    const ruleId = `${ids.rulePrefix}${index + 1}`;
    const ruleVersionId = `${ids.ruleVersionPrefix}${index + 1}`;
    statements.push(
      db
        .prepare(
          `INSERT OR IGNORE INTO requirements (
            id, organization_id, stable_key, category, status
          ) VALUES (?, ?, ?, 'Preparación del expediente', 'active')`,
        )
        .bind(
          requirementId,
          organizationId,
          `demo.requirement.${index + 1}`,
        ),
      db
        .prepare(
          `INSERT OR IGNORE INTO rules (
            id, organization_id, stable_key, name, requirement_id, status
          ) VALUES (?, ?, ?, ?, ?, 'active')`,
        )
        .bind(
          ruleId,
          organizationId,
          rule.stableKey,
          rule.title,
          requirementId,
        ),
      db
        .prepare(
          `INSERT OR IGNORE INTO rule_versions (
            id, organization_id, rule_id, version_number, territory_scope,
            validation_status, condition_json, outcome_json, display_title,
            display_explanation, content_hash, created_by
          ) VALUES (?, ?, ?, 1, 'Canarias · demostración', 'draft_unvalidated',
            ?, '{"matched":"applies","unmatched":"not_applies"}', ?, ?, ?, ?)`,
        )
        .bind(
          ruleVersionId,
          organizationId,
          ruleId,
          stableJson({
            factKey: rule.factKey,
            operator: "equals",
            value: false,
          }),
          rule.title,
          rule.explanation,
          `demo-rule-${index + 1}-v1`,
          userId,
        ),
      db
        .prepare(
          `INSERT OR IGNORE INTO rule_version_sources (
            organization_id, rule_version_id, source_reference_id, locator, note
          ) VALUES (?, ?, ?, 'Sección de demostración', 'Sin valor jurídico')`,
        )
        .bind(organizationId, ruleVersionId, ids.source),
      db
        .prepare(
          `INSERT OR IGNORE INTO rule_set_version_rules (
            organization_id, rule_set_version_id, rule_version_id, position
          ) VALUES (?, ?, ?, ?)`,
        )
        .bind(organizationId, ids.ruleSetVersion, ruleVersionId, index + 1),
    );
  });

  await db.batch(statements);
}

async function loadRulesForEvaluation(
  organizationId: string,
  ruleSetVersionId: string,
): Promise<RuleDefinition[]> {
  const result = await database()
    .prepare(
      `SELECT
        rv.id,
        r.requirement_id AS requirementId,
        rv.condition_json AS conditionJson,
        rv.outcome_json AS outcomeJson,
        rv.display_title AS displayTitle,
        rv.display_explanation AS displayExplanation
      FROM rule_set_version_rules rsvr
      INNER JOIN rule_versions rv
        ON rv.organization_id = rsvr.organization_id
        AND rv.id = rsvr.rule_version_id
      INNER JOIN rules r
        ON r.organization_id = rv.organization_id AND r.id = rv.rule_id
      WHERE rsvr.organization_id = ? AND rsvr.rule_set_version_id = ?
      ORDER BY rsvr.position`,
    )
    .bind(organizationId, ruleSetVersionId)
    .all<
      Omit<RuleDefinition, "condition" | "matchedResult"> & {
        conditionJson: string;
        outcomeJson: string;
      }
    >();

  return (result.results ?? []).map((rule) => ({
    ...rule,
    condition: parseCondition(rule.conditionJson),
    matchedResult: parseMatchedResult(rule.outcomeJson),
  }));
}

async function readLatestEvaluation(
  organizationId: string,
  propertyId: string,
  ruleSetVersionId: string,
  ruleSetLabel: string,
): Promise<EvaluationRecord | null> {
  const db = database();
  const evaluation = await db
    .prepare(
      `SELECT
        id,
        result_summary_json AS resultSummaryJson,
        content_hash AS contentHash,
        engine_version AS engineVersion,
        evaluated_at AS evaluatedAt
      FROM rule_evaluations
      WHERE organization_id = ? AND property_id = ?
        AND rule_set_version_id = ?
      ORDER BY evaluated_at DESC, id DESC
      LIMIT 1`,
    )
    .bind(organizationId, propertyId, ruleSetVersionId)
    .first<{
      contentHash: string;
      engineVersion: string;
      evaluatedAt: string;
      id: string;
      resultSummaryJson: string;
    }>();
  if (!evaluation) return null;

  const items = await db
    .prepare(
      `SELECT
        rei.result,
        rei.trace_json AS traceJson,
        rv.display_title AS displayTitle,
        rv.display_explanation AS displayExplanation
      FROM rule_evaluation_items rei
      INNER JOIN rule_versions rv
        ON rv.organization_id = rei.organization_id
        AND rv.id = rei.rule_version_id
      WHERE rei.organization_id = ? AND rei.evaluation_id = ?
      ORDER BY rv.id`,
    )
    .bind(organizationId, evaluation.id)
    .all<{
      displayExplanation: string;
      displayTitle: string;
      result: RuleEvaluationResult;
      traceJson: string;
    }>();

  return {
    contentHash: evaluation.contentHash,
    engineVersion: evaluation.engineVersion,
    evaluatedAt: evaluation.evaluatedAt,
    id: evaluation.id,
    items: (items.results ?? []).map((item) => ({
      ...JSON.parse(item.traceJson),
      displayExplanation: item.displayExplanation,
      displayTitle: item.displayTitle,
      result: item.result,
    })) as EvaluationItemRecord[],
    ruleSetLabel,
    summary: JSON.parse(evaluation.resultSummaryJson),
  };
}

function normalizeFactValues(
  values: Record<string, unknown>,
): Record<string, boolean | null> {
  const allowed = new Set(DEMO_FACTS.map((fact) => fact.factKey));
  for (const key of Object.keys(values)) {
    if (!allowed.has(key as (typeof DEMO_FACTS)[number]["factKey"])) {
      throw new ValidationError("Se recibió un hecho no registrado.");
    }
  }
  return Object.fromEntries(
    DEMO_FACTS.map((fact) => {
      const value = values[fact.factKey];
      if (value === null || value === "unknown" || value === undefined) {
        return [fact.factKey, null];
      }
      if (value === true || value === "true") return [fact.factKey, true];
      if (value === false || value === "false") return [fact.factKey, false];
      throw new ValidationError(`Valor no válido para ${fact.label}.`);
    }),
  );
}

async function loadCatalogRules(
  db: D1Database,
  organizationId: string,
  ruleSetVersionId: string,
): Promise<RuleCatalogItem[]> {
  const result = await db
    .prepare(
      `SELECT
        rv.id AS ruleVersionId,
        rv.rule_id AS ruleId,
        r.requirement_id AS requirementId,
        r.stable_key AS ruleStableKey,
        rv.version_number AS versionNumber,
        rv.validation_status AS validationStatus,
        rv.condition_json AS conditionJson,
        rv.outcome_json AS outcomeJson,
        rv.display_title AS displayTitle,
        rv.display_explanation AS displayExplanation,
        sr.issuer AS sourceIssuer,
        sr.title AS sourceTitle
      FROM rule_set_version_rules rsvr
      INNER JOIN rule_versions rv
        ON rv.organization_id = rsvr.organization_id
        AND rv.id = rsvr.rule_version_id
      INNER JOIN rules r
        ON r.organization_id = rv.organization_id AND r.id = rv.rule_id
      INNER JOIN rule_version_sources rvs
        ON rvs.organization_id = rv.organization_id
        AND rvs.rule_version_id = rv.id
      INNER JOIN source_references sr
        ON sr.organization_id = rvs.organization_id
        AND sr.id = rvs.source_reference_id
      WHERE rsvr.organization_id = ? AND rsvr.rule_set_version_id = ?
      ORDER BY rsvr.position`,
    )
    .bind(organizationId, ruleSetVersionId)
    .all<
      Omit<RuleCatalogItem, "condition" | "matchedResult"> & {
        conditionJson: string;
        outcomeJson: string;
      }
    >();

  return (result.results ?? []).map((rule) => ({
    ...rule,
    condition: parseCondition(rule.conditionJson),
    matchedResult: parseMatchedResult(rule.outcomeJson),
  }));
}

function compareCatalogRules(
  previousRules: RuleCatalogItem[],
  currentRules: RuleCatalogItem[],
): Array<{
  fields: string[];
  ruleStableKey: string;
  title: string;
}> {
  const previousByKey = new Map(
    previousRules.map((rule) => [rule.ruleStableKey, rule]),
  );
  const currentByKey = new Map(
    currentRules.map((rule) => [rule.ruleStableKey, rule]),
  );
  const changes: Array<{
    fields: string[];
    ruleStableKey: string;
    title: string;
  }> = [];

  for (const rule of currentRules) {
    const previous = previousByKey.get(rule.ruleStableKey);
    if (!previous) {
      changes.push({
        fields: ["regla añadida"],
        ruleStableKey: rule.ruleStableKey,
        title: rule.displayTitle,
      });
      continue;
    }
    const fields: string[] = [];
    if (previous.displayTitle !== rule.displayTitle) fields.push("título");
    if (previous.displayExplanation !== rule.displayExplanation) {
      fields.push("explicación");
    }
    if (stableJson(previous.condition) !== stableJson(rule.condition)) {
      fields.push("condición");
    }
    if (previous.matchedResult !== rule.matchedResult) {
      fields.push("resultado");
    }
    if (fields.length) {
      changes.push({
        fields,
        ruleStableKey: rule.ruleStableKey,
        title: rule.displayTitle,
      });
    }
  }
  for (const previous of previousRules) {
    if (!currentByKey.has(previous.ruleStableKey)) {
      changes.push({
        fields: ["regla retirada"],
        ruleStableKey: previous.ruleStableKey,
        title: previous.displayTitle,
      });
    }
  }
  return changes;
}

function parseCondition(value: string): RuleCondition {
  const parsed = JSON.parse(value) as Partial<RuleCondition>;
  if (
    typeof parsed.factKey !== "string" ||
    parsed.operator !== "equals" ||
    (typeof parsed.value !== "boolean" && typeof parsed.value !== "string")
  ) {
    throw new Error("Invalid stored rule condition");
  }
  return parsed as RuleCondition;
}

function parseMatchedResult(
  value: string,
): "applies" | "not_applies" {
  const parsed = JSON.parse(value) as { matched?: unknown };
  if (parsed.matched === "applies" || parsed.matched === "not_applies") {
    return parsed.matched;
  }
  throw new Error("Invalid stored rule outcome");
}

function describeCondition(condition: RuleCondition): string {
  const expected = condition.value === false ? "No" : condition.value === true ? "Sí" : String(condition.value);
  return `${condition.factKey} es ${expected}`;
}

function cleanRuleText(
  value: string,
  label: string,
  minLength: number,
  maxLength: number,
): string {
  const cleaned = value.trim().replace(/\s+/g, " ");
  if (cleaned.length < minLength || cleaned.length > maxLength) {
    throw new ValidationError(
      `${label} debe tener entre ${minLength} y ${maxLength} caracteres.`,
    );
  }
  return cleaned;
}

function cleanWorkflowNote(
  value: string | undefined,
  action: RuleWorkflowAction,
): string | null {
  const cleaned = value?.trim().replace(/\s+/g, " ") ?? "";
  const required =
    action === "changes_requested" ||
    action === "professionally_reviewed";
  if (required && cleaned.length < 12) {
    throw new ValidationError(
      "Añade una nota de al menos 12 caracteres para dejar constancia.",
    );
  }
  if (cleaned.length > 500) {
    throw new ValidationError("La nota no puede superar 500 caracteres.");
  }
  return cleaned || null;
}

function demoIds(organizationId: string) {
  return {
    factPrefix: `fact:${organizationId}:`,
    requirementPrefix: `requirement:${organizationId}:demo:`,
    rulePrefix: `rule:${organizationId}:demo:`,
    ruleSet: `ruleset:${organizationId}:demo`,
    ruleSetVersion: `ruleset-version:${organizationId}:demo:2`,
    ruleVersionPrefix: `rule-version:${organizationId}:demo:`,
    source: `source:${organizationId}:demo`,
  };
}

async function authorize(
  actor: ActorInput,
  organizationId: string,
  capability: Capability,
): Promise<MembershipContext> {
  const membership = await getMembershipContext(actor, organizationId);
  if (!membership || !can(membership.role as Role, capability)) {
    throw new AuthorizationError("No tienes permiso para realizar esta acción.");
  }
  return membership;
}

function auditStatement(
  db: D1Database,
  membership: MembershipContext,
  action: string,
  entityType: string,
  entityId: string,
  metadata: Record<string, unknown>,
): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO audit_events (
        id, organization_id, actor_user_id, actor_type, action,
        entity_type, entity_id, metadata_json
      ) VALUES (?, ?, ?, 'user', ?, ?, ?, ?)`,
    )
    .bind(
      crypto.randomUUID(),
      membership.organizationId,
      membership.userId,
      action,
      entityType,
      entityId,
      JSON.stringify(metadata),
    );
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableJson(item)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
