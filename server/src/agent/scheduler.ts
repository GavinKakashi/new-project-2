import { Cron } from "croner";
import type { DB } from "../db.js";
import { getAgent, toAgent, type Agent } from "../repo.js";
import type { Runner } from "./runner.js";

export function validateCron(expr: string): string | null {
  try {
    new Cron(expr, { paused: true }).stop();
    return null;
  } catch (err) {
    return (err as Error).message;
  }
}

export function nextRunAt(expr: string | null): string | null {
  if (!expr) return null;
  try {
    const job = new Cron(expr, { paused: true });
    const next = job.nextRun();
    job.stop();
    return next ? next.toISOString() : null;
  } catch {
    return null;
  }
}

/** Keeps one cron job per active, scheduled agent. Call sync(agentId) after any agent change. */
export class Scheduler {
  private jobs = new Map<string, Cron>();

  constructor(
    private db: DB,
    private runner: Runner,
    private timezone = process.env.TZ || "UTC",
  ) {}

  start() {
    const rows = this.db.prepare("SELECT * FROM agents WHERE schedule IS NOT NULL AND status = 'active'").all();
    for (const row of rows) this.install(toAgent(row as Record<string, unknown>));
  }

  sync(agentId: string) {
    this.remove(agentId);
    const agent = getAgent(this.db, agentId);
    if (agent?.schedule && agent.status === "active") this.install(agent);
  }

  remove(agentId: string) {
    this.jobs.get(agentId)?.stop();
    this.jobs.delete(agentId);
  }

  stopAll() {
    for (const job of this.jobs.values()) job.stop();
    this.jobs.clear();
  }

  private install(agent: Agent) {
    if (validateCron(agent.schedule!)) return;
    const job = new Cron(agent.schedule!, { timezone: this.timezone, protect: true }, () => {
      const current = getAgent(this.db, agent.id);
      if (!current || current.status !== "active") return;
      // Skip if the previous scheduled run is still in flight, so slow agents don't pile up.
      const busy = this.db
        .prepare("SELECT 1 FROM runs WHERE agent_id = ? AND trigger = 'schedule' AND status IN ('queued','running','awaiting_approval') LIMIT 1")
        .get(agent.id);
      if (!busy) this.runner.start(current, current.scheduleInput || "Run your scheduled task.", "schedule");
    });
    this.jobs.set(agent.id, job);
  }
}
