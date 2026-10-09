import { Router } from "express";
import { z } from "zod";
import type { Runner } from "../agent/runner.js";
import { now, type DB } from "../db.js";
import { HttpError, param, parse } from "../lib.js";
import { getAgent, getRun, toApproval, toRun } from "../repo.js";
import { summarizeRun } from "./agents.js";

const ListQuery = z.object({
  agentId: z.string().optional(),
  status: z.enum(["active", "queued", "running", "awaiting_approval", "succeeded", "failed", "cancelled"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
  before: z.string().optional(),
});

export function runRoutes(db: DB, runner: Runner) {
  const r = Router();

  r.get("/", (req, res) => {
    const q = parse(ListQuery, req.query);
    const where = ["r.user_id = ?"];
    const args: unknown[] = [req.userId];
    if (q.agentId) (where.push("r.agent_id = ?"), args.push(q.agentId));
    if (q.status === "active") where.push("r.status IN ('queued','running','awaiting_approval')");
    else if (q.status) (where.push("r.status = ?"), args.push(q.status));
    if (q.before) (where.push("r.created_at < ?"), args.push(q.before));
    const rows = db
      .prepare(
        `SELECT r.*, a.name AS agent_name, a.avatar AS agent_avatar, a.color AS agent_color
         FROM runs r JOIN agents a ON a.id = r.agent_id
         WHERE ${where.join(" AND ")} ORDER BY r.created_at DESC LIMIT ?`,
      )
      .all(...args, q.limit) as Record<string, any>[];
    res.json({
      runs: rows.map((row) => ({
        ...summarizeRun(toRun(row)),
        agent: { name: row.agent_name, avatar: row.agent_avatar, color: row.agent_color },
      })),
    });
  });

  r.get("/:id", (req, res) => {
    const run = getRun(db, param(req, "id"), req.userId);
    if (!run) throw new HttpError(404, "Run not found");
    const agent = getAgent(db, run.agentId);
    const approvals = db.prepare("SELECT * FROM approvals WHERE run_id = ? ORDER BY created_at").all(run.id).map((a) => toApproval(a as Record<string, unknown>));
    res.json({
      run,
      agent: agent && { id: agent.id, name: agent.name, avatar: agent.avatar, color: agent.color, model: agent.model },
      approvals,
    });
  });

  /** Incremental timeline: poll with ?after=<last event id> while the run is active. */
  r.get("/:id/events", (req, res) => {
    const run = getRun(db, param(req, "id"), req.userId);
    if (!run) throw new HttpError(404, "Run not found");
    const after = Number(req.query.after ?? 0) || 0;
    const events = (db.prepare("SELECT * FROM run_events WHERE run_id = ? AND id > ? ORDER BY id LIMIT 500").all(run.id, after) as any[]).map((e) => ({
      id: e.id,
      type: e.type,
      data: JSON.parse(e.data),
      createdAt: e.created_at,
    }));
    res.json({ status: run.status, events });
  });

  r.post("/:id/cancel", (req, res) => {
    const run = getRun(db, param(req, "id"), req.userId);
    if (!run) throw new HttpError(404, "Run not found");
    if (!runner.cancel(run.id)) throw new HttpError(409, "Run is already finished");
    res.json({ run: getRun(db, run.id) });
  });

  r.post("/:id/retry", (req, res) => {
    const run = getRun(db, param(req, "id"), req.userId);
    if (!run) throw new HttpError(404, "Run not found");
    const agent = getAgent(db, run.agentId);
    if (!agent) throw new HttpError(404, "Agent not found");
    res.status(201).json({ run: runner.start(agent, run.input, "manual") });
  });

  return r;
}

const Decision = z.object({ decision: z.enum(["approve", "deny"]), note: z.string().max(500).optional() });

export function approvalRoutes(db: DB, runner: Runner) {
  const r = Router();

  r.get("/", (req, res) => {
    const status = req.query.status === "all" ? null : "pending";
    const rows = db
      .prepare(
        `SELECT ap.*, a.name AS agent_name, a.avatar AS agent_avatar, a.color AS agent_color, a.id AS agent_id, r.input AS run_input
         FROM approvals ap JOIN runs r ON r.id = ap.run_id JOIN agents a ON a.id = r.agent_id
         WHERE ap.user_id = ? ${status ? "AND ap.status = 'pending'" : ""}
         ORDER BY ap.created_at DESC LIMIT 100`,
      )
      .all(req.userId) as Record<string, any>[];
    res.json({
      approvals: rows.map((row) => ({
        ...toApproval(row),
        agent: { id: row.agent_id, name: row.agent_name, avatar: row.agent_avatar, color: row.agent_color },
        runInput: row.run_input,
      })),
    });
  });

  r.post("/:id", (req, res) => {
    const { decision, note } = parse(Decision, req.body);
    const row = db.prepare("SELECT * FROM approvals WHERE id = ? AND user_id = ?").get(param(req, "id"), req.userId);
    if (!row) throw new HttpError(404, "Approval not found");
    const approval = toApproval(row as Record<string, unknown>);
    if (approval.status !== "pending") throw new HttpError(409, `Already ${approval.status}`);
    db.prepare("UPDATE approvals SET status = ?, note = ?, resolved_at = ? WHERE id = ?").run(
      decision === "approve" ? "approved" : "denied", note ?? null, now(), approval.id,
    );
    db.prepare("INSERT INTO run_events (run_id, type, data) VALUES (?, 'approval_resolved', ?)").run(
      approval.runId, JSON.stringify({ approvalId: approval.id, name: approval.toolName, decision, note: note ?? null }),
    );
    const { pending } = db.prepare("SELECT COUNT(*) AS pending FROM approvals WHERE run_id = ? AND status = 'pending'").get(approval.runId) as { pending: number };
    if (pending === 0) runner.resume(approval.runId);
    res.json({ approval: toApproval(db.prepare("SELECT * FROM approvals WHERE id = ?").get(approval.id) as Record<string, unknown>) });
  });

  return r;
}
