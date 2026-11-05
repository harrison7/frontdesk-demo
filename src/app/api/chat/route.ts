import { z } from "zod";
import { answerQuestion } from "@/lib/assistant/answer";
import { RESPONSES } from "@/lib/assistant/responses";
import { loadConfig } from "@/lib/config";
import { getAssistantService } from "@/lib/server/assistant-service";
import { RateLimiter } from "@/lib/server/rate-limit";

// pg and node:crypto need the Node.js runtime, and answers must never be cached.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Hard limits for the HTTP layer. The pipeline itself caps a message at 1000
 * characters with a friendly reply; anything far beyond that is not a real
 * customer and is rejected outright with 400.
 */
const RequestSchema = z.object({
  message: z.string().max(4000),
  history: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(4000) }))
    .max(20)
    .optional(),
});

export type ChatRequest = z.infer<typeof RequestSchema>;

const limiter = new RateLimiter(20, 60_000);

export async function POST(req: Request): Promise<Response> {
  const cors = corsHeaders(req);
  if (cors === null) return Response.json({ error: "Origin not allowed" }, { status: 403 });

  if (!limiter.allow(clientKey(req))) {
    return Response.json(
      { error: "Too many messages. Please wait a minute and try again." },
      { status: 429, headers: cors },
    );
  }

  let body: ChatRequest;
  try {
    body = RequestSchema.parse(await req.json());
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400, headers: cors });
  }

  let service;
  try {
    service = await getAssistantService();
  } catch (err) {
    console.error("[frontdesk] assistant unavailable:", err instanceof Error ? err.message : err);
    return Response.json(
      { error: "The assistant is unavailable right now.", fallback: RESPONSES.unsure },
      { status: 503, headers: cors },
    );
  }

  const { reply, trace } = await answerQuestion(body, service.deps);

  // One structured log line per question: enough to debug retrieval and
  // guardrails without storing what the customer typed.
  console.info(
    JSON.stringify({
      event: "chat",
      outcome: reply.outcome,
      reason: reply.reason,
      safety: reply.safety.map((s) => s.kind),
      retrieved: trace.retrieved,
      detail: trace.detail,
      messageChars: body.message.length,
    }),
  );

  return Response.json(reply, { headers: cors });
}

/** CORS preflight for the widget embedded on another site. */
export async function OPTIONS(req: Request): Promise<Response> {
  const cors = corsHeaders(req);
  if (cors === null) return new Response(null, { status: 403 });
  return new Response(null, {
    status: 204,
    headers: {
      ...cors,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "600",
    },
  });
}

/**
 * Same-origin requests are always allowed. Cross-origin ones (the widget on a
 * customer's own website) only from ALLOWED_ORIGINS. Returns null for a
 * disallowed origin. We reject those outright rather than relying on the
 * browser to hide the response, since the request would otherwise still cost
 * a model call.
 */
function corsHeaders(req: Request): Record<string, string> | null {
  const origin = req.headers.get("origin");
  if (!origin) return {}; // server-to-server or same-origin GET-style requests
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    return null;
  }
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (originHost === host) return {};

  if (!loadConfig().allowedOrigins.includes(origin)) return null;
  return { "Access-Control-Allow-Origin": origin, Vary: "Origin" };
}

function clientKey(req: Request): string {
  // Behind a proxy the first X-Forwarded-For hop is the client. Without one
  // (local dev) everyone shares a bucket, which is fine for a demo.
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
}
