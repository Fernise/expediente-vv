/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";
import { requestIdFor, withSecurityHeaders } from "@/lib/security-headers";
import { withResponseTiming } from "@/lib/response-timing";
import {
  runClaimedScheduledCycle,
  runDueFallbackCycles,
} from "@/lib/scheduled-operations";

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  DOCUMENTS: R2Bucket;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const requestId = requestIdFor(request);
    const startedAt = performance.now();
    try {
      const url = new URL(request.url);

      if (url.pathname === "/_vinext/image") {
        const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
        const response = await handleImageOptimization(request, {
          fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
          transformImage: async (body, { width, format, quality }) => {
            const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
            return result.response();
          },
        }, allowedWidths);
        return withResponseTiming(secureWorkerResponse(request, response, requestId), performance.now() - startedAt);
      }

      const response = await handler.fetch(request, env, ctx);
      const headerReadyMs = Math.round(performance.now() - startedAt);
      if (request.method === "GET" && (url.pathname === "/app" || url.pathname === "/app.rsc" || url.pathname.startsWith("/app/"))) {
        console.info(JSON.stringify({ event: "private_response_ready", requestId, pathname: safeRequestPath(request), status: response.status, headerReadyMs }));
      }
      scheduleFallbackProbe(ctx);
      return withResponseTiming(secureWorkerResponse(request, response, requestId), headerReadyMs);
    } catch (error) {
      logRequestFailure(request, requestId, 500, error);
      return withSecurityHeaders(
        request,
        Response.json(
          { error: "No hemos podido completar la solicitud.", requestId },
          { status: 500, headers: { "cache-control": "no-store" } },
        ),
        { requestId },
      );
    }
  },
  scheduled(
    controller: ScheduledController,
    _env: Env,
    ctx: ExecutionContext,
  ): void {
    ctx.waitUntil(runClaimedScheduledCycle(controller.cron));
  },
};

let nextFallbackProbeAt = 0;

function scheduleFallbackProbe(ctx: ExecutionContext): void {
  const now = Date.now();
  if (now < nextFallbackProbeAt) return;
  nextFallbackProbeAt = now + 60_000;
  ctx.waitUntil(
    runDueFallbackCycles(new Date(now)).catch((error) => {
      console.error(JSON.stringify({
        event: "scheduled_fallback_failed",
        errorName: safeErrorName(error),
      }));
    }),
  );
}

function secureWorkerResponse(
  request: Request,
  response: Response,
  requestId: string,
): Response {
  if (response.status >= 500) {
    logRequestFailure(request, requestId, response.status);
  }
  return withSecurityHeaders(request, response, { requestId });
}

function logRequestFailure(
  request: Request,
  requestId: string,
  status: number,
  error?: unknown,
): void {
  console.error(JSON.stringify({
    event: "request_failed",
    requestId,
    method: request.method,
    pathname: safeRequestPath(request),
    status,
    ...(error ? { errorName: safeErrorName(error) } : {}),
  }));
}

function safeErrorName(error: unknown): string {
  return error instanceof Error
    ? error.name.replace(/[^a-z0-9_-]/gi, "").slice(0, 40) || "Error"
    : "UnknownError";
}

function safeRequestPath(request: Request): string {
  const sensitiveParents = new Set([
    "checklist",
    "comments",
    "documents",
    "invitations",
    "members",
    "organizations",
    "properties",
  ]);
  const segments = new URL(request.url).pathname.split("/").filter(Boolean);
  const sanitized = segments.map((segment, index) =>
    index > 0 && sensitiveParents.has(segments[index - 1]) ? ":id" : segment,
  );
  return `/${sanitized.join("/")}`;
}

export default worker;
