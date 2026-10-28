import { consumeMutationRateLimit } from "@/db/rate-limits";
import { guardMutationOrigin } from "@/lib/request-security";

export async function guardMutationRequest(
  request: Request,
): Promise<Response | null> {
  const rejectedOrigin = guardMutationOrigin(request);
  if (rejectedOrigin) return rejectedOrigin;

  try {
    const rateLimit = await consumeMutationRateLimit(request);
    if (rateLimit.allowed) return null;

    return Response.json(
      { error: "Has hecho demasiadas solicitudes. Espera un momento y vuelve a intentarlo." },
      {
        status: 429,
        headers: {
          "cache-control": "no-store",
          "ratelimit-limit": String(rateLimit.limit),
          "ratelimit-remaining": "0",
          "ratelimit-reset": String(rateLimit.resetAfterSeconds),
          "retry-after": String(rateLimit.resetAfterSeconds),
        },
      },
    );
  } catch {
    return Response.json(
      { error: "El servicio está temporalmente ocupado. Inténtalo de nuevo en unos instantes." },
      {
        status: 503,
        headers: {
          "cache-control": "no-store",
          "retry-after": "5",
        },
      },
    );
  }
}
