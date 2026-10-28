import test from "node:test";
import assert from "node:assert/strict";
import { documentPage, groupByKey } from "../lib/dossier-volume.ts";
import { withResponseTiming } from "../lib/response-timing.ts";

test("large histories are indexed once, in original order, without losing versions", () => {
  const rows = Array.from({ length: 15000 }, (_, i) => ({ id: i, documentId: `doc-${i % 1500}` }));
  let visits = 0;
  const grouped = groupByKey(rows, row => { visits++; return row.documentId; });
  assert.equal(visits, rows.length);
  assert.equal(grouped.size, 1500);
  assert.deepEqual(grouped.get("doc-17").map(row => row.id), Array.from({ length: 10 }, (_, i) => 17 + i * 1500));
});

test("all documents remain reachable with bounded, validated pagination", () => {
  const docs = Array.from({ length: 237 }, (_, i) => i);
  const seen = [];
  for (let i = 1; i <= 12; i++) seen.push(...documentPage(docs, String(i)).items);
  assert.deepEqual(seen, docs);
  for (const bad of [undefined, "-1", "NaN", "1.5", "Infinity", "99999999999"]) assert.equal(documentPage(docs, bad).page, 1);
  assert.equal(documentPage(docs, "9999").page, 12);
  assert.equal(documentPage(docs, "0").page, 1);
  assert.deepEqual(documentPage([], "9").items, []);
});

test("server timing preserves streaming body, security headers and existing metrics", async () => {
  const source = new Response("private body", { status: 201, headers: { "cache-control": "no-store", "server-timing": "db;dur=12" } });
  const timed = withResponseTiming(source, 123.456);
  assert.equal(timed.status, 201);
  assert.equal(timed.headers.get("cache-control"), "no-store");
  assert.match(timed.headers.get("server-timing"), /db;dur=12, app;dur=123\.5/);
  assert.equal(await timed.text(), "private body");
  assert.match(withResponseTiming(new Response(), Infinity).headers.get("server-timing"), /dur=0\.0/);
});
