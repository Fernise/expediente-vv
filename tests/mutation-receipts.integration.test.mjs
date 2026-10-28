import assert from "node:assert/strict";
import test from "node:test";
import { convertV4MiniflareOptions, Miniflare } from "miniflare";
import { runOnceIn } from "../db/mutation-receipt-core.ts";

test("retries, concurrent submits, changed payloads and failed confirmations never repeat work", async () => {
  const runtime = new Miniflare(convertV4MiniflareOptions({ compatibilityDate: "2026-09-04", d1Databases: ["DB"], modules: true, script: "export default {fetch(){return new Response('ok')}}" }));
  try {
    const db = await runtime.getD1Database("DB");
    await db.prepare(`CREATE TABLE mutation_receipts (organization_id TEXT, user_id TEXT, request_key TEXT,
      fingerprint TEXT, response_json TEXT, response_status INTEGER, PRIMARY KEY(organization_id,user_id,request_key))`).run();
    const scope = { organizationId: "a", userId: "one", key: crypto.randomUUID(), fingerprint: "draft-hash" };
    let executions = 0;
    const work = async () => { executions++; return Response.json({ property: { id: "created-once" } }, { status: 201 }); };
    const first = await runOnceIn(db, scope, work);
    assert.equal(first.status, 201);
    // Simulate losing the first response after it was committed.
    assert.deepEqual(await (await runOnceIn(db, scope, work)).json(), await first.json());
    assert.equal(executions, 1);
    assert.equal((await runOnceIn(db, { ...scope, fingerprint: "changed" }, work)).status, 409);
    const concurrent = { ...scope, key: crypto.randomUUID() };
    const replies = await Promise.all([runOnceIn(db, concurrent, work), runOnceIn(db, concurrent, work)]);
    assert.ok(replies.every(r => [201, 409].includes(r.status)));
    assert.equal(executions, 2);
    const partial = { ...scope, key: crypto.randomUUID() };
    await assert.rejects(runOnceIn(db, partial, async () => { throw new Error("after potential side effect"); }));
    assert.equal((await runOnceIn(db, partial, work)).status, 409);
    assert.equal(executions, 2);
    // Same key cannot retrieve another user's/org's receipt.
    assert.equal((await runOnceIn(db, { ...scope, userId: "two" }, work)).status, 201);
    assert.equal((await runOnceIn(db, { ...scope, organizationId: "b" }, work)).status, 201);
    assert.equal(executions, 4);
    assert.equal((await runOnceIn(db, { ...scope, key: "invalid" }, work)).status, 400);
  } finally { await runtime.dispose(); }
});
