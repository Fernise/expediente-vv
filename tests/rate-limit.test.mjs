import assert from "node:assert/strict";
import test from "node:test";
import { convertV4MiniflareOptions, Miniflare } from "miniflare";
import {
  consumeRateLimit,
  RATE_LIMIT_EXPIRY_INDEX_SQL,
  RATE_LIMIT_TABLE_SQL,
  rateLimitPolicyFor,
  rateLimitSubjectFor,
} from "../db/rate-limits-core.ts";

function mutation(path, headers = {}) {
  return new Request(`https://app.example${path}`, {
    method: "POST",
    headers,
  });
}

test("sensitive mutation families receive narrower policies", () => {
  assert.deepEqual(rateLimitPolicyFor(mutation("/api/pilot/demo-requests")), {
    limit: 5,
    scope: "pilot-demo",
    subject: "ip",
    windowSeconds: 900,
  });
  assert.equal(
    rateLimitPolicyFor(mutation("/api/team/invitations")).limit,
    10,
  );
  assert.equal(
    rateLimitPolicyFor(mutation("/api/properties/p1/documents")).limit,
    30,
  );
  assert.equal(rateLimitPolicyFor(mutation("/api/properties")).limit, 120);
});

test("public limits use the edge IP while authenticated limits use the stable Sites user", () => {
  const headers = {
    "cf-connecting-ip": "203.0.113.4",
    "oai-authenticated-user-id": "sites-user-1",
  };
  const publicRequest = mutation("/api/pilot/demo-requests", headers);
  const authenticatedRequest = mutation("/api/properties", headers);

  assert.equal(
    rateLimitSubjectFor(publicRequest, rateLimitPolicyFor(publicRequest)),
    "ip:203.0.113.4",
  );
  assert.equal(
    rateLimitSubjectFor(
      authenticatedRequest,
      rateLimitPolicyFor(authenticatedRequest),
    ),
    "actor:sites-user-1",
  );
});

test("D1 counters are durable, isolated and do not store raw actor or IP values", async () => {
  const miniflare = new Miniflare(
    convertV4MiniflareOptions({
      compatibilityDate: "2026-08-30",
      d1Databases: ["DB"],
      modules: true,
      script: "export default { fetch() { return new Response('ok') } }",
    }),
  );

  try {
    const database = await miniflare.getD1Database("DB");
    await database.prepare(RATE_LIMIT_TABLE_SQL).run();
    await database.prepare(RATE_LIMIT_EXPIRY_INDEX_SQL).run();

    const now = Date.UTC(2026, 7, 30, 12, 0, 0);
    const firstIp = mutation("/api/pilot/demo-requests", {
      "cf-connecting-ip": "203.0.113.10",
    });
    const secondIp = mutation("/api/pilot/demo-requests", {
      "cf-connecting-ip": "203.0.113.11",
    });

    const results = [];
    for (let attempt = 0; attempt < 6; attempt += 1) {
      results.push(await consumeRateLimit(database, firstIp, now));
    }

    assert.deepEqual(
      results.map((result) => result.allowed),
      [true, true, true, true, true, false],
    );
    assert.equal(results.at(-1).remaining, 0);
    assert.equal((await consumeRateLimit(database, secondIp, now)).allowed, true);
    assert.equal(
      (await consumeRateLimit(database, firstIp, now + 15 * 60 * 1000)).allowed,
      true,
    );

    const firstActor = mutation("/api/team/invitations", {
      "cf-connecting-ip": "203.0.113.20",
      "oai-authenticated-user-id": "sites-user-a",
    });
    const secondActor = mutation("/api/team/invitations", {
      "cf-connecting-ip": "203.0.113.20",
      "oai-authenticated-user-id": "sites-user-b",
    });
    let firstActorResult;
    for (let attempt = 0; attempt < 11; attempt += 1) {
      firstActorResult = await consumeRateLimit(database, firstActor, now);
    }
    assert.equal(firstActorResult.allowed, false);
    assert.equal(
      (await consumeRateLimit(database, secondActor, now)).allowed,
      true,
    );

    const stored = await database
      .prepare("SELECT key_hash AS keyHash FROM rate_limit_buckets")
      .all();
    assert.ok(stored.results.length >= 5);
    for (const row of stored.results) {
      assert.match(String(row.keyHash), /^[a-f0-9]{64}$/);
      assert.doesNotMatch(String(row.keyHash), /203\.0\.113/);
      assert.doesNotMatch(String(row.keyHash), /sites-user/);
    }
  } finally {
    await miniflare.dispose();
  }
});
