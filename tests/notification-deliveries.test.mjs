import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("team invitations prepare one provider-neutral email delivery", async () => {
  const [schema, team] = await Promise.all([
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/team.ts", import.meta.url), "utf8"),
  ]);

  assert.match(schema, /notification_deliveries/);
  assert.match(schema, /notification_deliveries_dedupe_uidx/);
  assert.match(team, /'pending_provider'/);
  assert.match(team, /`invitation:\$\{invitationId\}`/);
  assert.match(team, /template_key, recipient_email/);
  assert.match(team, /propertyCount: propertyIds\.length/);
  assert.doesNotMatch(
    team,
    /JSON\.stringify\(\{[\s\S]{0,220}(?:address|document|downloadUrl)/i,
  );
});

test("obsolete invitation deliveries are cancelled without claiming a send", async () => {
  const [organizations, team, component] = await Promise.all([
    readFile(new URL("../db/organizations.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/team.ts", import.meta.url), "utf8"),
    readFile(
      new URL("../app/components/TeamManagement.tsx", import.meta.url),
      "utf8",
    ),
  ]);

  assert.match(
    organizations,
    /UPDATE notification_deliveries[\s\S]*status = 'cancelled'/,
  );
  assert.match(
    team,
    /UPDATE notification_deliveries[\s\S]*status = 'cancelled'/,
  );
  assert.match(component, /pendiente hasta autorizar Gmail/i);
  assert.doesNotMatch(component, /correo enviado/i);
});

test("delivery attempts are claimable, retryable and fully audited", async () => {
  const [schema, dispatcher] = await Promise.all([
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/notifications.ts", import.meta.url), "utf8"),
  ]);

  assert.match(schema, /attemptCount: integer\("attempt_count"\)/);
  assert.match(schema, /notification_deliveries_dispatch_idx/);
  assert.match(dispatcher, /SET status = 'queued'/);
  assert.match(dispatcher, /attempt_count = attempt_count \+ 1/);
  assert.match(dispatcher, /attemptNumber >= 5/);
  assert.match(dispatcher, /"notification\.sent"/);
  assert.match(dispatcher, /"notification\.failed"/);
  assert.doesNotMatch(dispatcher, /metadataJson[\s\S]{0,180}recipientEmail/);
});

test("new invitations attempt delivery immediately while keeping queue retries", async () => {
  const [route, team, component] = await Promise.all([
    readFile(
      new URL("../app/api/team/invitations/route.ts", import.meta.url),
      "utf8",
    ),
    readFile(new URL("../db/team.ts", import.meta.url), "utf8"),
    readFile(
      new URL("../app/components/TeamManagement.tsx", import.meta.url),
      "utf8",
    ),
  ]);

  assert.match(team, /return \{ deliveryId, kind: "invitation" \}/);
  assert.match(route, /processNotificationDeliveryNow\(result\.deliveryId\)/);
  assert.match(route, /deliveryStatus/);
  assert.match(component, /Invitación enviada por Gmail/);
  assert.match(component, /reintento automático/);
});

test("pending invitations can be resent without duplicate deliveries", async () => {
  const [route, team, component] = await Promise.all([
    readFile(
      new URL("../app/api/team/invitations/[id]/route.ts", import.meta.url),
      "utf8",
    ),
    readFile(new URL("../db/team.ts", import.meta.url), "utf8"),
    readFile(
      new URL("../app/components/TeamManagement.tsx", import.meta.url),
      "utf8",
    ),
  ]);

  assert.match(team, /prepareTeamInvitationResend/);
  assert.match(team, /status <> 'queued'/);
  assert.match(team, /datetime\('now', '-1 minute'\)/);
  assert.match(team, /invitation\.resend_requested/);
  assert.match(route, /export async function PATCH/);
  assert.match(route, /processNotificationDeliveryNow\(delivery\.deliveryId\)/);
  assert.match(component, /Reenviar/);
  assert.match(component, /Último intento/);
});
