import crypto from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { EFFORTS, MODELS, TOOLS } from "../agent/catalog.js";
import type { LLM } from "../agent/llm.js";
import type { Runner } from "../agent/runner.js";
import { TEMPLATES } from "../agent/templates.js";
import type { DB } from "../db.js";
import { HttpError, param, parse } from "../lib.js";
import { getAgent } from "../repo.js";

export const VERSION = "1.0.0";

export function metaRoutes(llm: LLM) {
  const r = Router();
  r.get("/", (_req, res) => {
    res.json({ version: VERSION, demoMode: llm.name === "mock", models: MODELS, tools: TOOLS, efforts: EFFORTS, templates: TEMPLATES });
  });
  return r;
}

export function statsRoutes(db: DB) {
  const r = Router();
  r.get("/", (req, res) => {
    const u = req.userId;
    const agents = db.prepare("SELECT COUNT(*) AS total, SUM(status = 'active') AS active, SUM(schedule IS NOT NULL) AS scheduled FROM agents WHERE user_id = ?").get(u) as any;
    const runs = db
      .prepare(
        `SELECT COUNT(*) AS total,
                SUM(status IN ('queued','running')) AS running,
                SUM(status = 'awaiting_approval') AS awaiting,
                SUM(status = 'succeeded') AS succeeded,
                SUM(status = 'failed') AS failed,
                COALESCE(SUM(cost_usd), 0) AS cost,
                COALESCE(SUM(input_tokens + output_tokens), 0) AS tokens
         FROM runs WHERE user_id = ? AND created_at >= ?`,
      )
      .get(u, new Date(Date.now() - 30 * 86_400_000).toISOString()) as any;
    const daily = db
      .prepare(
        `SELECT substr(created_at, 1, 10) AS day, COUNT(*) AS runs, COALESCE(SUM(cost_usd), 0) AS cost
         FROM runs WHERE user_id = ? AND created_at >= ? GROUP BY day ORDER BY day`,
      )
      .all(u, new Date(Date.now() - 6 * 86_400_000).toISOString().slice(0, 10));
    const { pending } = db.prepare("SELECT COUNT(*) AS pending FROM approvals WHERE user_id = ? AND status = 'pending'").get(u) as any;
    const { unread } = db.prepare("SELECT COUNT(*) AS unread FROM notifications WHERE user_id = ? AND read = 0").get(u) as any;
    res.json({
      agents: { total: agents.total, active: agents.active ?? 0, scheduled: agents.scheduled ?? 0 },
      last30Days: {
        runs: runs.total,
        running: runs.running ?? 0,
        awaitingApproval: runs.awaiting ?? 0,
        succeeded: runs.succeeded ?? 0,
        failed: runs.failed ?? 0,
        costUsd: runs.cost,
        tokens: runs.tokens,
      },
      daily,
      pendingApprovals: pending,
      unreadNotifications: unread,
    });
  });
  return r;
}

export function notificationRoutes(db: DB) {
  const r = Router();
  r.get("/", (req, res) => {
    const rows = db
      .prepare("SELECT id, agent_id AS agentId, run_id AS runId, title, body, read, created_at AS createdAt FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 100")
      .all(req.userId) as any[];
    res.json({ notifications: rows.map((n) => ({ ...n, read: !!n.read })) });
  });
  r.post("/read-all", (req, res) => {
    db.prepare("UPDATE notifications SET read = 1 WHERE user_id = ?").run(req.userId);
    res.status(204).end();
  });
  r.post("/push-tokens", (req, res) => {
    const { token } = parse(z.object({ token: z.string().min(10).max(300) }), req.body);
    db.prepare("INSERT INTO push_tokens (token, user_id) VALUES (?, ?) ON CONFLICT(token) DO UPDATE SET user_id = excluded.user_id").run(token, req.userId);
    res.status(204).end();
  });
  r.delete("/push-tokens", (req, res) => {
    const { token } = parse(z.object({ token: z.string() }), req.body);
    db.prepare("DELETE FROM push_tokens WHERE token = ? AND user_id = ?").run(token, req.userId);
    res.status(204).end();
  });
  return r;
}

/** Public trigger endpoint: POST /api/hooks/:agentId with header X-Agentry-Secret (or ?secret=). */
export function hookRoutes(db: DB, runner: Runner) {
  const r = Router();
  r.post("/:agentId", (req, res) => {
    const agent = getAgent(db, param(req, "agentId"));
    const given = String(req.header("x-agentry-secret") ?? req.query.secret ?? "");
    const ok =
      agent &&
      given.length === agent.webhookSecret.length &&
      crypto.timingSafeEqual(Buffer.from(given), Buffer.from(agent.webhookSecret));
    if (!agent || !ok) throw new HttpError(404, "Unknown agent or wrong secret");
    if (agent.status !== "active") throw new HttpError(409, "Agent is paused");
    const body = req.body;
    const input =
      typeof body?.input === "string" ? body.input : body && Object.keys(body).length ? `Webhook payload:\n${JSON.stringify(body, null, 2).slice(0, 20_000)}` : "Webhook triggered.";
    const run = runner.start(agent, input, "webhook");
    res.status(202).json({ runId: run.id, status: run.status });
  });
  return r;
}
