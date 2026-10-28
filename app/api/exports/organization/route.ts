import { env } from "cloudflare:workers";
import {
  buildOrganizationExport,
  MAX_PORTABILITY_EXPORT_BYTES,
  privacyErrorStatus,
} from "@/db/privacy";
import { getOptionalActor } from "@/lib/auth";
import { attachmentHeader, filenameSlug } from "@/lib/http-download";
import { createStoredZip, safeZipSegment, type ZipEntry } from "@/lib/zip-stream";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const actor = await getOptionalActor();
  if (!actor) return new Response("Debes iniciar sesión.", { status: 401 });
  const organizationId = new URL(request.url).searchParams.get("organizationId");
  if (!organizationId) {
    return new Response("Falta la organización.", { status: 400 });
  }

  try {
    const result = await buildOrganizationExport(actor, organizationId);
    if (!env.DOCUMENTS) {
      throw new Error("Private document storage is unavailable");
    }
    const availability = await Promise.all(
      result.documentFiles.map(async (file) => ({
        available: Boolean(await env.DOCUMENTS.head(file.storageKey)),
        file,
      })),
    );
    const includedFiles = availability
      .filter((entry) => entry.available)
      .map((entry) => entry.file);
    const totalBytes = includedFiles.reduce(
      (total, file) => total + file.sizeBytes,
      0,
    );
    if (totalBytes > MAX_PORTABILITY_EXPORT_BYTES) {
      return new Response(
        "El archivo completo supera el límite del piloto. Descarga los documentos desde cada expediente.",
        { status: 413 },
      );
    }

    const portableManifest = {
      ...result.manifest,
      documentArchive: availability.map(({ available, file }) => ({
        documentId: file.documentId,
        filename: file.filename,
        included: available,
        mimeType: file.mimeType,
        propertyReference: file.propertyReference,
        sha256: file.sha256,
        sizeBytes: file.sizeBytes,
        versionId: file.versionId,
      })),
    };
    const organizationName = result.manifest.organization.name;
    const body = createStoredZip(zipEntries(portableManifest, includedFiles));
    const filename = `exportacion-${filenameSlug(organizationName)}.zip`;

    return new Response(body, {
      headers: {
        "cache-control": "private, no-store",
        "content-disposition": attachmentHeader(filename),
        "content-type": "application/zip",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (error) {
    const status = privacyErrorStatus(error);
    return new Response(
      status === 500
        ? "No se pudo preparar la exportación completa."
        : error instanceof Error
          ? error.message
          : "No se pudo preparar la exportación completa.",
      { status },
    );
  }
}

async function* zipEntries(
  manifest: unknown,
  documentFiles: Awaited<ReturnType<typeof buildOrganizationExport>>["documentFiles"],
): AsyncGenerator<ZipEntry> {
  const encoder = new TextEncoder();
  yield {
    bytes: encoder.encode(
      "Expediente VV · exportación del espacio\r\n\r\n" +
        "datos.json contiene los registros estructurados y el inventario.\r\n" +
        "documentos/ contiene únicamente archivos que superaron el control técnico.\r\n" +
        "La exportación no acredita cumplimiento legal ni sustituye una copia de seguridad administrada.\r\n",
    ),
    path: "LEEME.txt",
  };
  yield {
    bytes: encoder.encode(JSON.stringify(manifest, null, 2)),
    path: "datos.json",
  };
  for (const file of documentFiles) {
    const object = await env.DOCUMENTS.get(file.storageKey);
    if (!object) continue;
    yield {
      bytes: new Uint8Array(await object.arrayBuffer()),
      path: `documentos/${safeZipSegment(file.propertyReference, "vivienda")}/${safeZipSegment(file.versionId)}-${safeZipSegment(file.filename)}`,
    };
  }
}
