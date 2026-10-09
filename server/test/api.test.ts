import type Anthropic from "@anthropic-ai/sdk";
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { config } from "../src/config.js";
import { MockLLM, type CreateParams, type LLM, type LLMMessage } from "../src/agent/llm.js";
import type { Notifier } from "../src/agent/notifier.js";
import { Runner } from "../src/agent/runner.js";
import { Scheduler } from "../src/agent/scheduler.js";
import { openDatabase, type DB } from "../src/db.js";

class RecordingNotifier implements Notifier {
  sent: { title: string; body: string }[] = [];
  async notify(n: { title: string; body: string }) {
    this.sent.push(n);
  }
}

/** Scripted LLM: returns the queued responses in order and records each request. */
class ScriptedLLM implements LLM {
  readonly name = "scripted";
  requests: CreateParams[] = [];
  constructor(private script: Partial<LLMMessage>[]) {}
  async create(params: CreateParams): Promise<LLMMessage> {
    this.requests.push(structuredClone(params));
    const next = this.script.shift();
    if (!next) throw new Error("script exhausted");
    return { id: "msg", type: "message", role: "assistant", model: params.model, stop_sequence: null, usage: { input_tokens: 100, output_tokens: 50 }, ...next } as LLMMessage;
  }
}

config.jwtSecret = "test-secret";

function setup(llm: LLM = new MockLLM()) {
  const db = openDatabase(":memory:");
  const notifier = new RecordingNotifier();
  const runner = new Runner(db, llm, notifier, { maxTurns: 5 });
  const scheduler = new Scheduler(db, runner);
  const app = createApp({ db, llm, runner, scheduler, webDistPath: null });
  return { db, app, runner, notifier, scheduler };
}

async function signUp(app: ReturnType<typeof setup>["app"]) {
  const res = await request(app).post("/api/auth/register").send({ email: "owner@example.com", password: "correct-horse", name: "Owner" });
  expect(res.status).toBe(201);
  return `Bearer ${res.body.token}`;
}

const baseAgent = { name: "Tester", systemPrompt: "You test things.", tools: ["clock", "memory", "http_request"] };

describe("auth", () => {
  it("lets the first user register, then closes sign-up", async () => {
    const { app } = setup();
    expect((await request(app).get("/api/auth/status")).body).toEqual({ hasUsers: false, signupOpen: true });
    await signUp(app);
    const second = await request(app).post("/api/auth/register").send({ email: "b@example.com", password: "password123", name: "B" });
    expect(second.status).toBe(403);
    const login = await request(app).post("/api/auth/login").send({ email: "OWNER@example.com", password: "correct-horse" });
    expect(login.status).toBe(200);
    const bad = await request(app).post("/api/auth/login").send({ email: "owner@example.com", password: "nope-nope-nope" });
    expect(bad.status).toBe(401);
  });

  it("rejects unauthenticated access", async () => {
    const { app } = setup();
    expect((await request(app).get("/api/agents")).status).toBe(401);
  });
});

describe("agents", () => {
  let ctx: ReturnType<typeof setup>;
  let auth: string;
  beforeEach(async () => {
    ctx = setup();
    auth = await signUp(ctx.app);
  });

  it("creates, lists, updates and deletes an agent", async () => {
    const created = await request(ctx.app).post("/api/agents").set("Authorization", auth).send(baseAgent);
    expect(created.status).toBe(201);
    expect(created.body.agent.model).toBe("claude-opus-5-5");
    expect(created.body.agent.webhookSecret).toBeTruthy();
    const id = created.body.agent.id;

    const list = await request(ctx.app).get("/api/agents").set("Authorization", auth);
    expect(list.body.agents).toHaveLength(1);
    expect(list.body.agents[0].webhookSecret).toBeUndefined();

    const patched = await request(ctx.app).patch(`/api/agents/${id}`).set("Authorization", auth).send({ schedule: "0 9 * * *", status: "active" });
    expect(patched.status).toBe(200);
    expect(patched.body.agent.nextRunAt).toBeTruthy();

    const badCron = await request(ctx.app).patch(`/api/agents/${id}`).set("Authorization", auth).send({ schedule: "every day" });
    expect(badCron.status).toBe(400);

    expect((await request(ctx.app).delete(`/api/agents/${id}`).set("Authorization", auth)).status).toBe(204);
    ctx.scheduler.stopAll();
  });

  it("refuses approval gating on server-side tools", async () => {
    const res = await request(ctx.app)
      .post("/api/agents")
      .set("Authorization", auth)
      .send({ ...baseAgent, tools: ["web_search"], approvalTools: ["web_search"] });
    expect(res.status).toBe(400);
  });

  it("runs an agent end to end in demo mode", async () => {
    const { body } = await request(ctx.app).post("/api/agents").set("Authorization", auth).send(baseAgent);
    const run = await request(ctx.app).post(`/api/agents/${body.agent.id}/runs`).set("Authorization", auth).send({ input: "What time is it?" });
    expect(run.status).toBe(201);
    await ctx.runner.idle();

    const detail = await request(ctx.app).get(`/api/runs/${run.body.run.id}`).set("Authorization", auth);
    expect(detail.body.run.status).toBe("succeeded");
    expect(detail.body.run.output).toContain("Demo mode");
    expect(detail.body.run.turns).toBe(2);
    expect(detail.body.run.costUsd).toBeGreaterThan(0);

    const events = await request(ctx.app).get(`/api/runs/${run.body.run.id}/events`).set("Authorization", auth);
    const types = events.body.events.map((e: { type: string }) => e.type);
    expect(types).toEqual(expect.arrayContaining(["status", "text", "tool_call", "tool_result"]));

    const stats = await request(ctx.app).get("/api/stats").set("Authorization", auth);
    expect(stats.body.last30Days.succeeded).toBe(1);
  });
});

describe("approvals", () => {
  it("pauses on a gated tool, then resumes after approval", async () => {
    const llm = new ScriptedLLM([
      {
        stop_reason: "tool_use",
        content: [
          { type: "text", text: "Saving that.", citations: null },
          { type: "tool_use", id: "toolu_1", name: "agent_memory", input: { action: "set", key: "color", value: "teal" } },
          { type: "tool_use", id: "toolu_2", name: "get_current_time", input: {} },
        ] as Anthropic.Beta.BetaContentBlock[],
      },
      { stop_reason: "end_turn", content: [{ type: "text", text: "Done: saved.", citations: null }] as Anthropic.Beta.BetaContentBlock[] },
    ]);
    const ctx = setup(llm);
    const auth = await signUp(ctx.app);
    const { body } = await request(ctx.app)
      .post("/api/agents")
      .set("Authorization", auth)
      .send({ ...baseAgent, tools: ["memory", "clock"], approvalTools: ["memory"], model: "claude-sonnet-5-5", effort: "low" });
    const run = await request(ctx.app).post(`/api/agents/${body.agent.id}/runs`).set("Authorization", auth).send({ input: "Remember teal" });
    await ctx.runner.idle();

    let detail = await request(ctx.app).get(`/api/runs/${run.body.run.id}`).set("Authorization", auth);
    expect(detail.body.run.status).toBe("awaiting_approval");
    expect(ctx.notifier.sent.at(-1)?.title).toContain("needs your approval");

    const pending = await request(ctx.app).get("/api/approvals").set("Authorization", auth);
    expect(pending.body.approvals).toHaveLength(1);
    expect(pending.body.approvals[0].toolName).toBe("agent_memory");

    const decided = await request(ctx.app).post(`/api/approvals/${pending.body.approvals[0].id}`).set("Authorization", auth).send({ decision: "approve" });
    expect(decided.status).toBe(200);
    await ctx.runner.idle();

    detail = await request(ctx.app).get(`/api/runs/${run.body.run.id}`).set("Authorization", auth);
    expect(detail.body.run.status).toBe("succeeded");
    expect(detail.body.run.output).toBe("Done: saved.");

    // Both tool calls from the paused turn were answered in a single user message.
    const second = llm.requests[1];
    const results = second.messages.at(-1)!.content as Anthropic.Beta.BetaToolResultBlockParam[];
    expect(results.map((r) => r.tool_use_id)).toEqual(["toolu_1", "toolu_2"]);
    expect(second.model).toBe("claude-sonnet-5-5");
    expect(second.output_config?.effort).toBe("low");
    expect(second.fallbacks).toBe("default");

    const memory = await request(ctx.app).get(`/api/agents/${body.agent.id}/memory`).set("Authorization", auth);
    expect(memory.body.memory[0]).toMatchObject({ key: "color", value: "teal" });
  });

  it("feeds a denial back to the model as an error result", async () => {
    const llm = new ScriptedLLM([
      {
        stop_reason: "tool_use",
        content: [{ type: "tool_use", id: "toolu_x", name: "http_request", input: { method: "DELETE", url: "https://api.example.com/x" } }] as Anthropic.Beta.BetaContentBlock[],
      },
      { stop_reason: "end_turn", content: [{ type: "text", text: "Understood, not deleting.", citations: null }] as Anthropic.Beta.BetaContentBlock[] },
    ]);
    const ctx = setup(llm);
    const auth = await signUp(ctx.app);
    const { body } = await request(ctx.app).post("/api/agents").set("Authorization", auth).send({ ...baseAgent, approvalTools: ["http_request"] });
    await request(ctx.app).post(`/api/agents/${body.agent.id}/runs`).set("Authorization", auth).send({ input: "delete x" });
    await ctx.runner.idle();
    const [approval] = (await request(ctx.app).get("/api/approvals").set("Authorization", auth)).body.approvals;
    await request(ctx.app).post(`/api/approvals/${approval.id}`).set("Authorization", auth).send({ decision: "deny", note: "not today" });
    await ctx.runner.idle();
    const result = (llm.requests[1].messages.at(-1)!.content as Anthropic.Beta.BetaToolResultBlockParam[])[0];
    expect(result.is_error).toBe(true);
    expect(String(result.content)).toContain("not today");
  });
});

describe("webhooks", () => {
  it("starts a run with the right secret only", async () => {
    const { app, runner } = setup();
    const auth = await signUp(app);
    const { body } = await request(app).post("/api/agents").set("Authorization", auth).send(baseAgent);
    const wrong = await request(app).post(`/api/hooks/${body.agent.id}`).set("X-Agentry-Secret", "nope").send({ input: "hi" });
    expect(wrong.status).toBe(404);
    const ok = await request(app).post(`/api/hooks/${body.agent.id}`).set("X-Agentry-Secret", body.agent.webhookSecret).send({ input: "hi" });
    expect(ok.status).toBe(202);
    await runner.idle();
  });
});

describe("tools", () => {
  it("blocks http requests to private networks", async () => {
    const { executeLocalTool } = await import("../src/agent/tools.js");
    const db: DB = openDatabase(":memory:");
    const out = await executeLocalTool(
      "http_request",
      { method: "GET", url: "http://169.254.169.254/latest/meta-data" },
      { db, runId: "r", notifier: new RecordingNotifier(), agent: { tools: ["http_request"] } as never },
    );
    expect(out.isError).toBe(true);
    expect(out.content).toContain("private");
  });
});
