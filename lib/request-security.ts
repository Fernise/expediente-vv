const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function mutationRequestProblem(request: Request): string | null {
  if (SAFE_METHODS.has(request.method.toUpperCase())) return null;

  const fetchSite = request.headers.get("sec-fetch-site")?.toLowerCase();
  if (fetchSite && fetchSite !== "same-origin") {
    return "cross-site-fetch";
  }

  const origin = request.headers.get("origin");
  if (!origin) return null;

  let requestOrigin: string;
  let suppliedOrigin: string;
  try {
    requestOrigin = new URL(request.url).origin;
    suppliedOrigin = new URL(origin).origin;
  } catch {
    return "invalid-origin";
  }

  if (suppliedOrigin !== requestOrigin) {
    return "cross-origin-request";
  }

  return null;
}

export function guardMutationOrigin(request: Request): Response | null {
  if (!mutationRequestProblem(request)) return null;

  return Response.json(
    { error: "Solicitud no permitida." },
    {
      status: 403,
      headers: {
        "cache-control": "no-store",
      },
    },
  );
}
