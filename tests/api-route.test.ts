import { beforeAll, describe, expect, it } from "vitest";
import { OPTIONS, POST } from "../src/app/api/chat/route";
import type { AssistantReply } from "../src/lib/assistant/types";
import { resetAssistantServiceForTests } from "../src/lib/server/assistant-service";

// Run the real route handler end to end with the offline stack.
beforeAll(() => {
  process.env.AI_PROVIDER = "fake";
  process.env.VECTOR_STORE = "memory";
  process.env.ALLOWED_ORIGINS = "https://partner.example.com";
  resetAssistantServiceForTests();
});

function post(body: unknown, headers: Record<string, string> = {}) {
  return POST(
    new Request("http://localhost:3000/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json", host: "localhost:3000", ...headers },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );
}

describe("POST /api/chat", () => {
  it("returns a grounded reply with citations", async () => {
    const res = await post({ message: "How much is a furnace tune-up?" });
    expect(res.status).toBe(200);
    const reply = (await res.json()) as AssistantReply;
    expect(reply.outcome).toBe("answered");
    expect(reply.citations.length).toBeGreaterThan(0);
    // Internal trace data must not leak to the browser.
    expect(reply).not.toHaveProperty("trace");
  });

  it("rejects malformed bodies", async () => {
    expect((await post("not json")).status).toBe(400);
    expect((await post({ message: 42 })).status).toBe(400);
    expect((await post({ message: "x".repeat(5000) })).status).toBe(400);
  });

  it("allows configured cross-origin callers and blocks others", async () => {
    const ok = await post({ message: "hours?" }, { origin: "https://partner.example.com" });
    expect(ok.headers.get("access-control-allow-origin")).toBe("https://partner.example.com");

    const blocked = await post({ message: "hours?" }, { origin: "https://evil.example.net" });
    expect(blocked.status).toBe(403);

    const same = await post({ message: "hours?" }, { origin: "http://localhost:3000" });
    expect(same.status).toBe(200);
  });

  it("answers CORS preflight for allowed origins", async () => {
    const res = await OPTIONS(
      new Request("http://localhost:3000/api/chat", {
        method: "OPTIONS",
        headers: { origin: "https://partner.example.com", host: "localhost:3000" },
      }),
    );
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-methods")).toContain("POST");
  });
});
