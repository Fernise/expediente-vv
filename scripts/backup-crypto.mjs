import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const MAGIC = Buffer.from("EVVBK001");
const HEADER_SIZE = MAGIC.length + 12 + 16;

export function parseBackupKey(value) {
  if (typeof value !== "string" || !/^[A-Za-z0-9+/]{43}=$/.test(value)) {
    throw new Error("Se requiere una clave base64 de 32 bytes.");
  }
  const key = Buffer.from(value, "base64");
  if (key.length !== 32 || key.toString("base64") !== value) {
    throw new Error("La clave de recuperación no es válida.");
  }
  return key;
}

export function encryptBackup(bytes, key) {
  if (key.length !== 32) throw new Error("La clave debe tener 32 bytes.");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(MAGIC);
  const payload = Buffer.concat([cipher.update(bytes), cipher.final()]);
  return Buffer.concat([MAGIC, iv, cipher.getAuthTag(), payload]);
}

export function decryptBackup(bytes, key) {
  const input = Buffer.from(bytes);
  if (key.length !== 32 || input.length < HEADER_SIZE || !input.subarray(0, 8).equals(MAGIC)) {
    throw new Error("Copia cifrada no válida.");
  }
  const decipher = createDecipheriv("aes-256-gcm", key, input.subarray(8, 20));
  decipher.setAAD(MAGIC);
  decipher.setAuthTag(input.subarray(20, 36));
  // Do not return any plaintext before authentication completes.
  return Buffer.concat([decipher.update(input.subarray(HEADER_SIZE)), decipher.final()]);
}
