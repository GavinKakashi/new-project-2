import crypto from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { DEFAULT_MODEL, EFFORTS, MODEL_IDS, TOOL_IDS, TOOLS } from "../agent/catalog.js";
import type { Runner } from "../agent/runner.js";
import { nextRunAt, validateCron, type Scheduler } from "../agent/scheduler.js";
import { now, type DB } from "../db.js";
import { HttpError, param, parse } from "../lib.js";
import { getAgent, newId, toAgent, toRun, type Agent } from "../repo.js";

const LOCAL_TOOLS = TOOLS.filter((t) => t.kind === "local").map((t) => t.id) as string[];

const AgentFields = z.object({
  name: z.string().trim().min(1).max(60),
  description: z.string().max(280).default(""),
  avatar: z.string().min(1).max(8).default("🤖"),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#7C5CFF"),
  systemPrompt: z.string().trim().min(1).max(20_000),
  model: z.enum(MODEL_IDS).default(DEFAULT_MODEL),
  effort: z.enum(EFFORTS).default("medium"),
  tools: z.array(z.enum(TOOL_IDS)).default([]),
  approvalTools: z.array(z.enum(TOOL_IDS)).default([]),
  schedule: z.string().trim().max(100).nullable().default(null),
  scheduleInput: z.string().max(5_000).default(""),
  status: z.enum(["active", "paused"]).default("active"),
});

const RunInput = z.object({ input: z.string().max(20_000).default("") });

export function serializeAgent(db: DB, agent: Agent, detail = false) {
  const stats = db
    .prepare(
      `SELECT COUNT(*) AS runs,
              SUM(status = 'succeeded') AS succeeded,
              SUM(status = 'failed') AS failed,
              SUM(status IN ('queued','running','awaiting_approval')) AS active,
              COALESCE(SUM(cost_usd), 0) AS cost
       FROM runs WHERE agent_id = ?`,
    )
    .get(agent.id) as { runs: number; succeeded: number | null; failed: number | null; active: number | null; cost: number };
  const last = db.prepare("SELECT * FROM runs WHERE agent_id = ? ORDER BY created_at DESC LIMIT 1").get(agent.id);
  const { userId: _u, webhookSecret, ...rest } = agent;
  return {
    ...rest,
    nextRunAt: agent.status === "active" ? nextRunAt(agent.schedule) : null,
    stats: {
      runs: stats.runs,
      succeeded: stats.succeeded ?? 0,
      failed: stats.failed ?? 0,
      active: stats.active ?? 0,
      costUsd: stats.cost,
    },
    lastRun: last ? summarizeRun(toRun(last as Record<string, unknown>)) : null,
    ...(detail ? { webhookSecret } : {}),
  };
}

export function summarizeRun(run: ReturnType<typeof toRun>) {
  return { ...run, output: run.output ? run.output.slice(0, 300) : null };
}

function checkFields(fields: Partial<z.infer<typeof AgentFields>>) {
  if (fields.schedule) {
    const err = validateCron(fields.schedule);
    if (err) throw new HttpError(400, `Invalid schedule: ${err}`);
  }
  if (fields.approvalTools?.some((t) => !LOCAL_TOOLS.includes(t))) {
    throw new HttpError(400, "Only locally executed tools (http_request, memory, notify, clock) can require approval");
  }
  if (fields.tools && fields.approvalTools) fields.approvalTools = fields.approvalTools.filter((t) => fields.tools!.includes(t));
}

export function agentRoutes(db: DB, runner: Runner, scheduler: Scheduler) {
  const r = Router();
  const load = (id: string, userId: string) => {
    const agent = getAgent(db, id, userId);
    if (!agent) throw new HttpError(404, "Agent not found");
    return agent;
  };

  r.get("/", (req, res) => {
    const rows = db.prepare("SELECT * FROM agents WHERE user_id = ? ORDER BY created_at DESC").all(req.userId);
    res.json({ agents: rows.map((row) => serializeAgent(db, toAgent(row as Record<string, unknown>))) });
  });

  r.post("/", (req, res) => {
    const f = parse(AgentFields, req.body);
    checkFields(f);
    const id = newId();
    db.prepare(
      `INSERT INTO agents (id, user_id, name, description, avatar, color, system_prompt, model, effort, tools, approval_tools, schedule, schedule_input, status, webhook_secret)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id, req.userId, f.name, f.description, f.avatar, f.color, f.systemPrompt, f.model, f.effort,
      JSON.stringify(f.tools), JSON.stringify(f.approvalTools), f.schedule || null, f.scheduleInput, f.status,
      crypto.randomBytes(18).toString("base64url"),
    );
    scheduler.sync(id);
    res.status(201).json({ agent: serializeAgent(db, getAgent(db, id)!, true) });
  });

  r.get("/:id", (req, res) => {
    res.json({ agent: serializeAgent(db, load(param(req, "id"), req.userId), true) });
  });

  r.patch("/:id", (req, res) => {
    const agent = load(param(req, "id"), req.userId);
    const f = parse(AgentFields.partial(), req.body);
    const merged = {
      ...agent,
      ...Object.fromEntries(Object.entries(f).filter(([, v]) => v !== undefined)),
    } as Agent;
    checkFields(merged);
    db.prepare(
      `UPDATE agents SET name = ?, description = ?, avatar = ?, color = ?, system_prompt = ?, model = ?, effort = ?, tools = ?,
       approval_tools = ?, schedule = ?, schedule_input = ?, status = ?, updated_at = ? WHERE id = ?`,
    ).run(
      merged.name, merged.description, merged.avatar, merged.color, merged.systemPrompt, merged.model, merged.effort,
      JSON.stringify(merged.tools), JSON.stringify(merged.approvalTools), merged.schedule || null, merged.scheduleInput,
      merged.status, now(), agent.id,
    );
    scheduler.sync(agent.id);
    res.json({ agent: serializeAgent(db, getAgent(db, agent.id)!, true) });
  });

  r.delete("/:id", (req, res) => {
    const agent = load(param(req, "id"), req.userId);
    const active = db.prepare("SELECT id FROM runs WHERE agent_id = ? AND status IN ('queued','running','awaiting_approval')").all(agent.id) as { id: string }[];
    active.forEach(({ id }) => runner.cancel(id));
    scheduler.remove(agent.id);
    db.prepare("DELETE FROM agents WHERE id = ?").run(agent.id);
    res.status(204).end();
  });

  r.post("/:id/webhook-secret", (req, res) => {
    const agent = load(param(req, "id"), req.userId);
    const secret = crypto.randomBytes(18).toString("base64url");
    db.prepare("UPDATE agents SET webhook_secret = ? WHERE id = ?").run(secret, agent.id);
    res.json({ webhookSecret: secret });
  });

  r.post("/:id/runs", (req, res) => {
    const agent = load(param(req, "id"), req.userId);
    const { input } = parse(RunInput, req.body ?? {});
    res.status(201).json({ run: runner.start(agent, input, "manual") });
  });

  r.get("/:id/memory", (req, res) => {
    const agent = load(param(req, "id"), req.userId);
    const rows = db.prepare("SELECT key, value, updated_at AS updatedAt FROM memories WHERE agent_id = ? ORDER BY key").all(agent.id);
    res.json({ memory: rows });
  });

  r.delete("/:id/memory/:key", (req, res) => {
    const agent = load(param(req, "id"), req.userId);
    db.prepare("DELETE FROM memories WHERE agent_id = ? AND key = ?").run(agent.id, param(req, "key"));
    res.status(204).end();
  });

  return r;
}
