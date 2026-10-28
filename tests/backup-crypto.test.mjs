import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { decryptBackup, encryptBackup, parseBackupKey } from "../scripts/backup-crypto.mjs";

test("encrypted backups restore exact bytes without exposing plaintext", () => {
  const key = randomBytes(32);
  const data = Buffer.from("expediente anonimizado — contenido de recuperación");
  const encrypted = encryptBackup(data, key);
  assert.equal(encrypted.includes(data), false);
  assert.deepEqual(decryptBackup(encrypted, key), data);
  assert.notDeepEqual(encryptBackup(data, key), encrypted, "each backup needs a fresh nonce");
});

test("wrong keys, truncated copies and tampering fail closed", () => {
  const key = randomBytes(32);
  const encrypted = encryptBackup(Buffer.from("restauración aislada"), key);
  assert.throws(() => decryptBackup(encrypted, randomBytes(32)));
  assert.throws(() => decryptBackup(encrypted.subarray(0, 12), key));
  for (const position of [0, 8, 20, encrypted.length - 1]) {
    const altered = Buffer.from(encrypted);
    altered[position] ^= 1;
    assert.throws(() => decryptBackup(altered, key));
  }
});

test("backup keys must be canonical base64 with exactly 256 bits", () => {
  const key = randomBytes(32);
  assert.deepEqual(parseBackupKey(key.toString("base64")), key);
  for (const value of [undefined, "", "password", randomBytes(16).toString("base64"), randomBytes(33).toString("base64")]) {
    assert.throws(() => parseBackupKey(value));
  }
});

test("backup CLI authenticates before writing and never overwrites existing files", async () => {
  const directory = await mkdtemp(join(tmpdir(), "expediente-backup-cli-"));
  try {
    const source = join(directory, "source.zip");
    const encrypted = join(directory, "copy.vvbackup");
    const restored = join(directory, "restored.zip");
    const rejected = join(directory, "rejected.zip");
    const bytes = Buffer.from("fictitious export");
    await writeFile(source, bytes);
    const key = randomBytes(32).toString("base64");
    const run = (operation, input, output, selectedKey = key) => spawnSync(process.execPath,
      [fileURLToPath(new URL("../scripts/backup-file.mjs", import.meta.url)), operation, input, output],
      { env: { ...process.env, EXPEDIENTE_BACKUP_KEY_BASE64: selectedKey }, encoding: "utf8" });
    assert.equal(run("encrypt", source, encrypted).status, 0);
    assert.equal((await stat(encrypted)).mode & 0o777, 0o600);
    const sealed = await readFile(encrypted);
    assert.equal(run("encrypt", source, encrypted).status, 1);
    assert.deepEqual(await readFile(encrypted), sealed);
    const failure = run("decrypt", encrypted, rejected, randomBytes(32).toString("base64"));
    assert.equal(failure.status, 1);
    assert.doesNotMatch(failure.stderr + failure.stdout, new RegExp(key.replace(/[+\/]/g, "\\$&")));
    await assert.rejects(readFile(rejected), { code: "ENOENT" });
    assert.equal(run("decrypt", encrypted, restored).status, 0);
    assert.deepEqual(await readFile(restored), bytes);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
