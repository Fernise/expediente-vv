export const documentSecurityEngine = "builtin-structural-v1";

export type DocumentSecurityInput = {
  bytes: Uint8Array;
  filename: string;
  mimeType: string;
};

export type DocumentSecurityResult =
  | { accepted: true; engine: typeof documentSecurityEngine }
  | {
      accepted: false;
      engine: typeof documentSecurityEngine;
      reason: string;
    };

const mimeExtensions: Record<string, ReadonlySet<string>> = {
  "application/pdf": new Set(["pdf"]),
  "image/jpeg": new Set(["jpeg", "jpg"]),
  "image/png": new Set(["png"]),
};

export function inspectDocumentSecurity({
  bytes,
  filename,
  mimeType,
}: DocumentSecurityInput): DocumentSecurityResult {
  const extension = filename.split(".").pop()?.toLocaleLowerCase("es") ?? "";
  if (!mimeExtensions[mimeType]?.has(extension)) {
    return rejected("El nombre del archivo no coincide con su tipo.");
  }

  if (mimeType === "application/pdf") return inspectPdf(bytes);
  if (mimeType === "image/png") return inspectPng(bytes);
  if (mimeType === "image/jpeg") return inspectJpeg(bytes);
  return rejected("El tipo de archivo no está admitido.");
}

function inspectPdf(bytes: Uint8Array): DocumentSecurityResult {
  const text = new TextDecoder().decode(bytes);
  if (!text.startsWith("%PDF-")) {
    return rejected("El archivo no contiene una cabecera PDF válida.");
  }

  const endMarker = text.lastIndexOf("%%EOF");
  if (endMarker < 0 || text.slice(endMarker + 5).trim()) {
    return rejected("El PDF está incompleto o contiene datos añadidos al final.");
  }

  const activeContent =
    /\/(?:JavaScript|JS|Launch|EmbeddedFile|RichMedia|OpenAction|AA|XFA)(?![A-Za-z0-9])/i;
  if (activeContent.test(text)) {
    return rejected(
      "El PDF contiene acciones, formularios o adjuntos activos no admitidos.",
    );
  }

  return accepted();
}

function inspectPng(bytes: Uint8Array): DocumentSecurityResult {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (
    bytes.length < 20 ||
    !signature.every((value, index) => bytes[index] === value)
  ) {
    return rejected("El archivo no contiene una cabecera PNG válida.");
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 8;
  let chunkIndex = 0;
  let hasImageData = false;
  while (offset + 12 <= bytes.length) {
    const length = view.getUint32(offset);
    const chunkEnd = offset + 12 + length;
    if (chunkEnd > bytes.length) {
      return rejected("La estructura interna del PNG está incompleta.");
    }
    const type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
    if (chunkIndex === 0 && (type !== "IHDR" || length !== 13)) {
      return rejected("El PNG no comienza con un bloque de imagen válido.");
    }
    if (
      chunkIndex === 0 &&
      (view.getUint32(offset + 8) === 0 || view.getUint32(offset + 12) === 0)
    ) {
      return rejected("El PNG no contiene unas dimensiones válidas.");
    }
    if (type === "IDAT") hasImageData = true;
    if (type === "IEND") {
      if (!hasImageData || length !== 0 || chunkEnd !== bytes.length) {
        return rejected("El PNG contiene datos añadidos después de la imagen.");
      }
      return accepted();
    }
    offset = chunkEnd;
    chunkIndex += 1;
  }

  return rejected("El PNG no contiene un cierre de imagen válido.");
}

function inspectJpeg(bytes: Uint8Array): DocumentSecurityResult {
  if (
    bytes.length < 4 ||
    bytes[0] !== 0xff ||
    bytes[1] !== 0xd8 ||
    bytes.at(-2) !== 0xff ||
    bytes.at(-1) !== 0xd9
  ) {
    return rejected("El archivo no contiene una estructura JPEG válida.");
  }

  let offset = 2;
  let hasFrame = false;
  let hasScan = false;
  while (offset < bytes.length - 2 && !hasScan) {
    if (bytes[offset] !== 0xff) {
      return rejected("La estructura interna del JPEG no es válida.");
    }
    while (bytes[offset] === 0xff) offset += 1;
    const marker = bytes[offset];
    offset += 1;
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      continue;
    }
    if (marker === 0xd9 || offset + 2 > bytes.length) {
      return rejected("El JPEG está incompleto.");
    }
    const segmentLength = (bytes[offset] << 8) | bytes[offset + 1];
    if (segmentLength < 2 || offset + segmentLength > bytes.length) {
      return rejected("La estructura interna del JPEG está incompleta.");
    }
    if (
      (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf)
    ) {
      hasFrame = true;
    }
    if (marker === 0xda) hasScan = true;
    offset += segmentLength;
  }
  if (!hasFrame || !hasScan) {
    return rejected("El JPEG no contiene una imagen completa.");
  }

  const text = new TextDecoder().decode(bytes);
  if (text.includes("%PDF-") || /<script[\s>]/i.test(text)) {
    return rejected("La imagen contiene contenido añadido no admitido.");
  }
  for (let index = 0; index < bytes.length - 3; index += 1) {
    if (
      bytes[index] === 0x50 &&
      bytes[index + 1] === 0x4b &&
      bytes[index + 2] === 0x03 &&
      bytes[index + 3] === 0x04
    ) {
      return rejected("La imagen contiene un archivo incrustado no admitido.");
    }
  }

  return accepted();
}

function accepted(): DocumentSecurityResult {
  return { accepted: true, engine: documentSecurityEngine };
}

function rejected(reason: string): DocumentSecurityResult {
  return { accepted: false, engine: documentSecurityEngine, reason };
}
