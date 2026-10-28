export type ZipEntry = {
  bytes: Uint8Array;
  path: string;
};

type CentralEntry = {
  crc: number;
  localOffset: number;
  name: Uint8Array;
  size: number;
};

const encoder = new TextEncoder();

export function createStoredZip(
  entries: AsyncIterable<ZipEntry>,
): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        const centralEntries: CentralEntry[] = [];
        let offset = 0;

        for await (const entry of entries) {
          const name = encoder.encode(normalizeZipPath(entry.path));
          const size = entry.bytes.byteLength;
          assertClassicZipLimit(size, "archivo");
          assertClassicZipLimit(offset, "exportación");
          const crc = crc32(entry.bytes);
          const localHeader = buildLocalHeader(name, crc, size);
          controller.enqueue(localHeader);
          controller.enqueue(entry.bytes);
          centralEntries.push({ crc, localOffset: offset, name, size });
          offset += localHeader.byteLength + size;
        }

        const centralOffset = offset;
        for (const entry of centralEntries) {
          const header = buildCentralHeader(entry);
          controller.enqueue(header);
          offset += header.byteLength;
        }
        const centralSize = offset - centralOffset;
        assertClassicZipLimit(centralOffset, "exportación");
        assertClassicZipLimit(centralSize, "índice");
        if (centralEntries.length > 65_535) {
          throw new Error("La exportación contiene demasiados archivos.");
        }
        controller.enqueue(
          buildEndRecord(centralEntries.length, centralSize, centralOffset),
        );
        controller.close();
      } catch (error) {
        controller.error(error);
      }
    },
  });
}

export function safeZipSegment(value: string, fallback = "archivo"): string {
  const normalized = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "-")
    .replace(/\.{2,}/g, ".")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[.\s-]+|[.\s]+$/g, "")
    .slice(0, 120);
  return normalized || fallback;
}

export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function buildLocalHeader(
  name: Uint8Array,
  crc: number,
  size: number,
): Uint8Array {
  const header = new Uint8Array(30 + name.byteLength);
  const view = new DataView(header.buffer);
  view.setUint32(0, 0x04034b50, true);
  view.setUint16(4, 20, true);
  view.setUint16(6, 0x0800, true);
  view.setUint16(8, 0, true);
  view.setUint16(10, 0, true);
  view.setUint16(12, 0, true);
  view.setUint32(14, crc, true);
  view.setUint32(18, size, true);
  view.setUint32(22, size, true);
  view.setUint16(26, name.byteLength, true);
  view.setUint16(28, 0, true);
  header.set(name, 30);
  return header;
}

function buildCentralHeader(entry: CentralEntry): Uint8Array {
  const header = new Uint8Array(46 + entry.name.byteLength);
  const view = new DataView(header.buffer);
  view.setUint32(0, 0x02014b50, true);
  view.setUint16(4, 20, true);
  view.setUint16(6, 20, true);
  view.setUint16(8, 0x0800, true);
  view.setUint16(10, 0, true);
  view.setUint16(12, 0, true);
  view.setUint16(14, 0, true);
  view.setUint32(16, entry.crc, true);
  view.setUint32(20, entry.size, true);
  view.setUint32(24, entry.size, true);
  view.setUint16(28, entry.name.byteLength, true);
  view.setUint16(30, 0, true);
  view.setUint16(32, 0, true);
  view.setUint16(34, 0, true);
  view.setUint16(36, 0, true);
  view.setUint32(38, 0, true);
  view.setUint32(42, entry.localOffset, true);
  header.set(entry.name, 46);
  return header;
}

function buildEndRecord(
  count: number,
  centralSize: number,
  centralOffset: number,
): Uint8Array {
  const record = new Uint8Array(22);
  const view = new DataView(record.buffer);
  view.setUint32(0, 0x06054b50, true);
  view.setUint16(4, 0, true);
  view.setUint16(6, 0, true);
  view.setUint16(8, count, true);
  view.setUint16(10, count, true);
  view.setUint32(12, centralSize, true);
  view.setUint32(16, centralOffset, true);
  view.setUint16(20, 0, true);
  return record;
}

function normalizeZipPath(value: string): string {
  const segments = value
    .replaceAll("\\", "/")
    .split("/")
    .filter(Boolean)
    .map((segment) => safeZipSegment(segment));
  return segments.join("/") || "archivo";
}

function assertClassicZipLimit(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0 || value > 0xffffffff) {
    throw new Error(`La ${label} supera el límite admitido.`);
  }
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < table.length; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) !== 0
        ? 0xedb88320 ^ (value >>> 1)
        : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
})();
