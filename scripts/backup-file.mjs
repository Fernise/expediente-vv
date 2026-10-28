import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { decryptBackup, encryptBackup, parseBackupKey } from "./backup-crypto.mjs";

const [operation, sourcePath, destinationPath, ...extra] = process.argv.slice(2);
let key;
try {
  if (!["encrypt", "decrypt"].includes(operation) || !sourcePath || !destinationPath || extra.length) {
    throw new Error("Uso: node scripts/backup-file.mjs encrypt|decrypt origen destino");
  }
  if (resolve(sourcePath) === resolve(destinationPath)) {
    throw new Error("Origen y destino deben ser distintos.");
  }
  key = parseBackupKey(process.env.EXPEDIENTE_BACKUP_KEY_BASE64);
  const source = await readFile(sourcePath);
  const output = operation === "encrypt" ? encryptBackup(source, key) : decryptBackup(source, key);
  // Never overwrite an existing export or restore destination.
  await writeFile(destinationPath, output, { flag: "wx", mode: 0o600 });
  console.log(operation === "encrypt" ? "Copia cifrada creada." : "Copia autenticada y descifrada.");
} catch {
  console.error("No se pudo procesar la copia. Comprueba los argumentos, la clave y que el destino no exista.");
  process.exitCode = 1;
} finally {
  key?.fill(0);
}
