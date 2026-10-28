import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { buildRawGmailMessage } from "../lib/email/mime.ts";

test("the Gmail adapter uses offline OAuth and the official send endpoint", async () => {
  const source = await readFile(
    new URL("../lib/email/gmail.ts", import.meta.url),
    "utf8",
  );

  assert.match(source, /https:\/\/oauth2\.googleapis\.com\/token/);
  assert.match(source, /grant_type: "refresh_token"/);
  assert.match(
    source,
    /https:\/\/gmail\.googleapis\.com\/gmail\/v1\/users\/me\/messages\/send/,
  );
  assert.match(source, /JSON\.stringify\(\{[\s\S]*raw: buildRawGmailMessage/);
  assert.match(source, /buildRawGmailMessage/);
});

test("the Gmail MIME payload preserves Unicode and safe deterministic headers", () => {
  const raw = buildRawGmailMessage({
    body: "Aviso para Casa Atlántico.",
    deliveryId: "delivery-123",
    fromAddress: "expedientevv.canarias@gmail.com",
    fromName: "Expediente VV",
    replyTo: "expedientevv.canarias@gmail.com",
    subject: "Revisión próxima",
    to: "persona@example.com",
  });
  const padded = raw.replace(/-/g, "+").replace(/_/g, "/");
  const mime = Buffer.from(padded, "base64").toString("utf8");

  assert.match(mime, /Message-ID: <delivery-123@expediente-vv\.local>/);
  assert.match(mime, /Content-Type: text\/plain; charset=UTF-8/);
  assert.match(mime, /Subject: =\?UTF-8\?B\?/);
  const encodedBody = mime.split("\r\n\r\n")[1].replace(/\s/g, "");
  assert.equal(
    Buffer.from(encodedBody, "base64").toString("utf8"),
    "Aviso para Casa Atlántico.",
  );
});

test("Gmail remains disabled until every secret is present", async () => {
  const [provider, example] = await Promise.all([
    readFile(new URL("../lib/email/gmail.ts", import.meta.url), "utf8"),
    readFile(new URL("../.env.example", import.meta.url), "utf8"),
  ]);

  assert.match(provider, /configuration\.clientId/);
  assert.match(provider, /configuration\.clientSecret/);
  assert.match(provider, /configuration\.refreshToken/);
  assert.match(provider, /gmail_not_configured/);
  assert.match(example, /^EMAIL_FROM_ADDRESS=$/m);
  assert.match(example, /GMAIL_OAUTH_CLIENT_SECRET=\n/);
  assert.doesNotMatch(example, /GMAIL_OAUTH_CLIENT_SECRET=\S/);
});
