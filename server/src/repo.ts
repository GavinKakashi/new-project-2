import { customAlphabet } from "nanoid";
import type { DB } from "./db.js";
import type { Effort, ModelId, ToolId } from "./agent/catalog.js";

export const newId = customAlphabet("0123456789abcdefghijklmnopqrstuvwxyz", 16);

export type RunStatus = "queued" | "running" | "awaiting_approval" | "succeeded" | "failed" | "cancelled";
export const ACTIVE_STATUSES: RunStatus[] = ["queued", "running", "awaiting_approval"];

export interface Agent {
  id: string;
  userId: string;
  name: string;
  description: string;
  avatar: string;
  color: string;
  systemPrompt: string;
  model: ModelId;
  effort: Effort;
  tools: ToolId[];
  approvalTools: ToolId[];
  schedule: string | null;
  scheduleInput: string;
  status: "active" | "paused";
  webhookSecret: string;
  createdAt: string;
  updatedAt: string;
}

export interface Run {
  id: string;
  agentId: string;
  userId: string;
  trigger: "manual" | "schedule" | "webhook";
  input: string;
  status: RunStatus;
  output: string | null;
  error: string | null;
  turns: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
}

export interface Approval {
  id: string;
  runId: string;
  userId: string;
  toolUseId: string;
  toolName: string;
  input: unknown;
  status: "pending" | "approved" | "denied";
  note: string | null;
  createdAt: string;
  resolvedAt: string | null;
}

type Row = Record<string, any>;

export function toAgent(r: Row): Agent {
  return {
    id: r.id,
    userId: r.user_id,
    name: r.name,
    description: r.description,
    avatar: r.avatar,
    color: r.color,
    systemPrompt: r.system_prompt,
    model: r.model,
    effort: r.effort,
    tools: JSON.parse(r.tools),
    approvalTools: JSON.parse(r.approval_tools),
    schedule: r.schedule,
    scheduleInput: r.schedule_input,
    status: r.status,
    webhookSecret: r.webhook_secret,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export function toRun(r: Row): Run {
  return {
    id: r.id,
    agentId: r.agent_id,
    userId: r.user_id,
    trigger: r.trigger,
    input: r.input,
    status: r.status,
    output: r.output,
    error: r.error,
    turns: r.turns,
    inputTokens: r.input_tokens,
    outputTokens: r.output_tokens,
    costUsd: r.cost_usd,
    startedAt: r.started_at,
    finishedAt: r.finished_at,
    createdAt: r.created_at,
  };
}

export function toApproval(r: Row): Approval {
  return {
    id: r.id,
    runId: r.run_id,
    userId: r.user_id,
    toolUseId: r.tool_use_id,
    toolName: r.tool_name,
    input: JSON.parse(r.input),
    status: r.status,
    note: r.note,
    createdAt: r.created_at,
    resolvedAt: r.resolved_at,
  };
}

export function getAgent(db: DB, id: string, userId?: string): Agent | undefined {
  const row = userId
    ? db.prepare("SELECT * FROM agents WHERE id = ? AND user_id = ?").get(id, userId)
    : db.prepare("SELECT * FROM agents WHERE id = ?").get(id);
  return row ? toAgent(row as Row) : undefined;
}

export function getRun(db: DB, id: string, userId?: string): Run | undefined {
  const row = userId
    ? db.prepare("SELECT * FROM runs WHERE id = ? AND user_id = ?").get(id, userId)
    : db.prepare("SELECT * FROM runs WHERE id = ?").get(id);
  return row ? toRun(row as Row) : undefined;
}

export function addEvent(db: DB, runId: string, type: string, data: Record<string, unknown> = {}) {
  db.prepare("INSERT INTO run_events (run_id, type, data) VALUES (?, ?, ?)").run(runId, type, JSON.stringify(data));
}
