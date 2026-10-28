import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  guardMutationOrigin,
  mutationRequestProblem,
} from "../lib/request-security.ts";
import { withSecurityHeaders } from "../lib/security-headers.ts";

test("same-origin mutations pass the browser request guard", () => {
  const request = new Request("https://app.example/api/properties", {
    method: "POST",
    headers: {
      origin: "https://app.example",
      "sec-fetch-site": "same-origin",
    },
  });

  assert.equal(mutationRequestProblem(request), null);
  assert.equal(guardMutationOrigin(request), null);
});

test("cross-site and cross-origin mutations are rejected", async () => {
  const crossSite = new Request("https://app.example/api/properties", {
    method: "POST",
    headers: { "sec-fetch-site": "cross-site" },
  });
  const crossOrigin = new Request("https://app.example/api/properties/1", {
    method: "PATCH",
    headers: { origin: "https://attacker.example" },
  });

  assert.equal(mutationRequestProblem(crossSite), "cross-site-fetch");
  assert.equal(mutationRequestProblem(crossOrigin), "cross-origin-request");
  const response = guardMutationOrigin(crossOrigin);
  assert.equal(response?.status, 403);
  assert.equal(response?.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response?.json(), { error: "Solicitud no permitida." });
});

test("safe methods and trusted server calls remain compatible", () => {
  const safeRequest = new Request("https://app.example/api/properties", {
    method: "GET",
    headers: { origin: "https://attacker.example" },
  });
  const serverRequest = new Request("https://app.example/api/rules", {
    method: "POST",
  });

  assert.equal(mutationRequestProblem(safeRequest), null);
  assert.equal(mutationRequestProblem(serverRequest), null);
});

test("the edge response adds restrictive headers and a traceable request id", async () => {
  const request = new Request("https://app.example/dashboard", {
    headers: { "cf-ray": "abcdef1234567890-VIE" },
  });
  const secured = withSecurityHeaders(request, new Response("ok"), {
    production: true,
  });

  assert.equal(secured.headers.get("x-request-id"), "abcdef1234567890");
  assert.equal(secured.headers.get("x-content-type-options"), "nosniff");
  assert.equal(secured.headers.get("strict-transport-security"), "max-age=31536000");
  assert.match(secured.headers.get("content-security-policy") ?? "", /frame-ancestors/);
  assert.equal(await secured.text(), "ok");
});

test("the edge response reuses the worker request id", () => {
  const request = new Request("https://app.example/dashboard", {
    headers: { "cf-ray": "abcdef1234567890-VIE" },
  });
  const secured = withSecurityHeaders(request, new Response("ok"), {
    requestId: "worker-request-id",
  });

  assert.equal(secured.headers.get("x-request-id"), "worker-request-id");
});

test("every mutating API route applies the common request guard", async () => {
  const routes = [
    "app/api/organizations/[id]/deletion/route.ts",
    "app/api/organizations/active/route.ts",
    "app/api/organizations/route.ts",
    "app/api/pilot/demo-requests/route.ts",
    "app/api/properties/[id]/checklist/[itemId]/route.ts",
    "app/api/properties/[id]/checklist/route.ts",
    "app/api/properties/[id]/comments/route.ts",
    "app/api/properties/[id]/documents/[documentId]/route.ts",
    "app/api/properties/[id]/documents/route.ts",
    "app/api/properties/[id]/facts/route.ts",
    "app/api/properties/[id]/route.ts",
    "app/api/properties/route.ts",
    "app/api/rules/versions/route.ts",
    "app/api/rules/workflow/route.ts",
    "app/api/team/invitations/[id]/route.ts",
    "app/api/team/invitations/route.ts",
    "app/api/team/members/[id]/route.ts",
  ];

  for (const route of routes) {
    const source = await readFile(new URL(`../${route}`, import.meta.url), "utf8");
    const handlers = source.match(/export async function (?:POST|PUT|PATCH|DELETE)/g) ?? [];
    const guards = source.match(/const rejectedRequest = await guardMutationRequest\(request\);/g) ?? [];
    assert.equal(guards.length, handlers.length, `${route} must guard every mutation handler`);
  }
});

test("Sites authentication requires the stable user identifier", async () => {
  const authSource = await readFile(
    new URL("../app/chatgpt-auth.ts", import.meta.url),
    "utf8",
  );
  assert.match(authSource, /oai-authenticated-user-id/);
  assert.match(authSource, /if \(!id \|\| !email\) return null/);
});
