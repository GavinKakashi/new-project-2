import Anthropic from "@anthropic-ai/sdk";
import { config } from "../config.js";
import { now, type DB } from "../db.js";
import { addEvent, getAgent, getRun, newId, toApproval, type Agent, type Run } from "../repo.js";
import { costUsd, modelInfo } from "./catalog.js";
import type { LLM } from "./llm.js";
import type { Notifier } from "./notifier.js";
import { buildToolDefinitions, executeLocalTool, toolIdForName } from "./tools.js";

type MessageParam = Anthropic.Beta.BetaMessageParam;
type ToolUse = Anthropic.Beta.BetaToolUseBlock;
type ToolResult = Anthropic.Beta.BetaToolResultBlockParam;

const MAX_TOKENS = 32_000;

export interface RunnerOptions {
  maxConcurrent?: number;
  maxTurns?: number;
  allowPrivateNetwork?: boolean;
}

/**
 * Executes agent runs: a Claude tool-use loop whose full state lives in the database,
 * so a run can pause for human approval (for hours, across restarts) and resume exactly where it stopped.
 */
export class Runner {
  private queue: string[] = [];
  private active = new Set<string>();
  private idleWaiters: (() => void)[] = [];
  private maxConcurrent: number;
  private maxTurns: number;

  constructor(
    private db: DB,
    private llm: LLM,
    private notifier: Notifier,
    private opts: RunnerOptions = {},
  ) {
    this.maxConcurrent = opts.maxConcurrent ?? config.maxConcurrentRuns;
    this.maxTurns = opts.maxTurns ?? config.maxTurnsPerRun;
  }

  /** Re-queue runs that were interrupted by a restart. */
  recover() {
    const rows = this.db.prepare("SELECT id FROM runs WHERE status IN ('queued','running') ORDER BY created_at").all() as { id: string }[];
    for (const { id } of rows) {
      this.db.prepare("UPDATE runs SET status = 'queued' WHERE id = ?").run(id);
      this.enqueue(id);
    }
    return rows.length;
  }

  start(agent: Agent, input: string, trigger: Run["trigger"]): Run {
    const id = newId();
    this.db
      .prepare("INSERT INTO runs (id, agent_id, user_id, trigger, input, status) VALUES (?, ?, ?, ?, ?, 'queued')")
      .run(id, agent.id, agent.userId, trigger, input);
    addEvent(this.db, id, "status", { status: "queued", trigger });
    this.enqueue(id);
    return getRun(this.db, id)!;
  }

  /** Called when the last pending approval of a paused run is resolved. */
  resume(runId: string) {
    const res = this.db.prepare("UPDATE runs SET status = 'queued' WHERE id = ? AND status = 'awaiting_approval'").run(runId);
    if (res.changes) this.enqueue(runId);
  }

  cancel(runId: string): boolean {
    const res = this.db
      .prepare("UPDATE runs SET status = 'cancelled', finished_at = ? WHERE id = ? AND status IN ('queued','running','awaiting_approval')")
      .run(now(), runId);
    if (!res.changes) return false;
    this.queue = this.queue.filter((id) => id !== runId);
    this.db.prepare("UPDATE approvals SET status = 'denied', note = 'Run cancelled', resolved_at = ? WHERE run_id = ? AND status = 'pending'").run(now(), runId);
    addEvent(this.db, runId, "status", { status: "cancelled" });
    return true;
  }

  /** Resolves once nothing is queued or running (used by tests and graceful shutdown). */
  idle(): Promise<void> {
    if (this.queue.length === 0 && this.active.size === 0) return Promise.resolve();
    return new Promise((resolve) => this.idleWaiters.push(resolve));
  }

  private enqueue(runId: string) {
    if (!this.queue.includes(runId) && !this.active.has(runId)) this.queue.push(runId);
    queueMicrotask(() => this.pump());
  }

  private pump() {
    while (this.active.size < this.maxConcurrent && this.queue.length > 0) {
      const id = this.queue.shift()!;
      this.active.add(id);
      this.execute(id)
        .catch((err) => this.fail(id, `Internal error: ${(err as Error).message}`))
        .finally(() => {
          this.active.delete(id);
          this.pump();
          if (this.queue.length === 0 && this.active.size === 0) this.idleWaiters.splice(0).forEach((r) => r());
        });
    }
  }

  private isCancelled(runId: string) {
    return getRun(this.db, runId)?.status === "cancelled";
  }

  private async execute(runId: string) {
    const run = getRun(this.db, runId);
    if (!run || run.status !== "queued") return;
    const agent = getAgent(this.db, run.agentId);
    if (!agent) return this.fail(runId, "Agent no longer exists");

    this.db.prepare("UPDATE runs SET status = 'running', started_at = COALESCE(started_at, ?) WHERE id = ?").run(now(), runId);
    addEvent(this.db, runId, "status", { status: "running" });

    const row = this.db.prepare("SELECT messages, turns FROM runs WHERE id = ?").get(runId) as { messages: string; turns: number };
    const messages: MessageParam[] = JSON.parse(row.messages);
    let turns = row.turns;
    if (messages.length === 0) {
      messages.push({ role: "user", content: run.input || "Begin your task." });
      this.saveMessages(runId, messages);
    }

    // Resuming after approvals: the last assistant turn has tool calls awaiting results.
    const pending = this.pendingToolUses(messages);
    if (pending.length > 0) {
      messages.push({ role: "user", content: await this.runTools(agent, runId, pending) });
      this.saveMessages(runId, messages);
    }

    const tools = buildToolDefinitions(agent);
    const system = this.systemPrompt(agent, run);
    const fallback = modelInfo(agent.model).fallbacks;

    while (turns < this.maxTurns) {
      if (this.isCancelled(runId)) return;

      let response: Anthropic.Beta.BetaMessage;
      try {
        response = await this.llm.create({
          model: agent.model,
          max_tokens: MAX_TOKENS,
          system,
          messages,
          ...(tools.length ? { tools } : {}),
          output_config: { effort: agent.effort },
          cache_control: { type: "ephemeral" },
          ...(fallback ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
        });
      } catch (err) {
        return this.fail(runId, describeApiError(err));
      }
      turns++;
      this.recordUsage(runId, agent.model, response, turns);
      if (this.isCancelled(runId)) return;

      messages.push({ role: "assistant", content: response.content as Anthropic.Beta.BetaContentBlockParam[] });
      this.saveMessages(runId, messages);
      this.recordBlocks(runId, response.content);

      if (response.stop_reason === "refusal") {
        return this.fail(runId, "The model declined this request.");
      }
      if (response.stop_reason === "pause_turn") continue;

      const toolUses = response.content.filter((b): b is ToolUse => b.type === "tool_use");
      if (toolUses.length === 0) {
        const output = response.content
          .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
          .map((b) => b.text)
          .join("\n\n")
          .trim();
        return this.succeed(runId, agent, output, response.stop_reason === "max_tokens");
      }
      if (response.stop_reason === "max_tokens") {
        return this.fail(runId, "The model ran out of output tokens while calling a tool.");
      }

      const gated = toolUses.filter((t) => {
        const id = toolIdForName(t.name);
        return id !== undefined && agent.approvalTools.includes(id);
      });
      if (gated.length > 0) return this.requestApprovals(agent, runId, gated);

      messages.push({ role: "user", content: await this.runTools(agent, runId, toolUses) });
      this.saveMessages(runId, messages);
    }
    this.fail(runId, `Stopped after reaching the limit of ${this.maxTurns} model turns.`);
  }

  private systemPrompt(agent: Agent, run: Run) {
    return [
      agent.systemPrompt.trim(),
      "",
      `You are "${agent.name}", an autonomous agent managed from the owner's phone with Agentry.`,
      "Work independently until the task is done, then reply with a clear final answer — it is shown to the owner as the run's result.",
      run.trigger === "manual" ? "" : `This run was started automatically (${run.trigger}); the owner is not watching live.`,
    ]
      .filter(Boolean)
      .join("\n");
  }

  private pendingToolUses(messages: MessageParam[]): ToolUse[] {
    const last = messages[messages.length - 1];
    if (!last || last.role !== "assistant" || !Array.isArray(last.content)) return [];
    return last.content.filter((b): b is ToolUse => b.type === "tool_use");
  }

  private async runTools(agent: Agent, runId: string, uses: ToolUse[]): Promise<ToolResult[]> {
    const decisions = new Map(
      (this.db.prepare("SELECT * FROM approvals WHERE run_id = ?").all(runId) as Record<string, unknown>[])
        .map(toApproval)
        .map((a) => [a.toolUseId, a]),
    );
    return Promise.all(
      uses.map(async (use): Promise<ToolResult> => {
        const decision = decisions.get(use.id);
        if (decision && decision.status !== "approved") {
          const content = `The owner denied this action${decision.note ? `: ${decision.note}` : "."} Do not retry it unchanged.`;
          addEvent(this.db, runId, "tool_result", { toolUseId: use.id, name: use.name, content, isError: true });
          return { type: "tool_result", tool_use_id: use.id, content, is_error: true };
        }
        const out = await executeLocalTool(use.name, use.input, {
          db: this.db,
          agent,
          runId,
          notifier: this.notifier,
          allowPrivateNetwork: this.opts.allowPrivateNetwork,
        });
        addEvent(this.db, runId, "tool_result", { toolUseId: use.id, name: use.name, content: out.content.slice(0, 4000), isError: !!out.isError });
        return { type: "tool_result", tool_use_id: use.id, content: out.content, ...(out.isError ? { is_error: true } : {}) };
      }),
    );
  }

  private requestApprovals(agent: Agent, runId: string, gated: ToolUse[]) {
    const insert = this.db.prepare("INSERT INTO approvals (id, run_id, user_id, tool_use_id, tool_name, input) VALUES (?, ?, ?, ?, ?, ?)");
    this.db.transaction(() => {
      for (const use of gated) {
        const id = newId();
        insert.run(id, runId, agent.userId, use.id, use.name, JSON.stringify(use.input));
        addEvent(this.db, runId, "approval_requested", { approvalId: id, toolUseId: use.id, name: use.name, input: use.input });
      }
      this.db.prepare("UPDATE runs SET status = 'awaiting_approval' WHERE id = ?").run(runId);
      addEvent(this.db, runId, "status", { status: "awaiting_approval" });
    })();
    void this.notifier.notify({
      userId: agent.userId,
      agentId: agent.id,
      runId,
      title: `${agent.avatar} ${agent.name} needs your approval`,
      body: gated.map((g) => describeToolCall(g.name, g.input)).join("\n"),
    });
  }

  private recordBlocks(runId: string, content: Anthropic.Beta.BetaContentBlock[]) {
    for (const block of content) {
      switch (block.type) {
        case "text":
          if (block.text.trim()) addEvent(this.db, runId, "text", { text: block.text });
          break;
        case "thinking":
          if (block.thinking.trim()) addEvent(this.db, runId, "thinking", { text: block.thinking });
          break;
        case "tool_use":
          addEvent(this.db, runId, "tool_call", { toolUseId: block.id, name: block.name, input: block.input });
          break;
        case "server_tool_use":
          addEvent(this.db, runId, "tool_call", { toolUseId: block.id, name: block.name, input: block.input, server: true });
          break;
        case "web_search_tool_result": {
          const results = Array.isArray(block.content)
            ? block.content.map((r) => ({ title: r.title, url: r.url }))
            : [];
          addEvent(this.db, runId, "tool_result", {
            toolUseId: block.tool_use_id,
            name: "web_search",
            content: Array.isArray(block.content) ? `${results.length} results` : "Search failed",
            results,
            isError: !Array.isArray(block.content),
          });
          break;
        }
        case "web_fetch_tool_result": {
          const ok = block.content.type === "web_fetch_result";
          addEvent(this.db, runId, "tool_result", {
            toolUseId: block.tool_use_id,
            name: "web_fetch",
            content: ok && "url" in block.content ? `Fetched ${block.content.url}` : "Fetch failed",
            isError: !ok,
          });
          break;
        }
      }
    }
  }

  private recordUsage(runId: string, model: string, response: Anthropic.Beta.BetaMessage, turns: number) {
    const u = response.usage;
    const input = (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0);
    const output = u.output_tokens ?? 0;
    // Cache reads bill at ~10% and writes at ~125%; approximate on the uncached rate for simplicity, then adjust.
    const cost =
      costUsd(model, u.input_tokens ?? 0, output) +
      costUsd(model, (u.cache_creation_input_tokens ?? 0) * 1.25, 0) +
      costUsd(model, (u.cache_read_input_tokens ?? 0) * 0.1, 0);
    this.db
      .prepare("UPDATE runs SET turns = ?, input_tokens = input_tokens + ?, output_tokens = output_tokens + ?, cost_usd = cost_usd + ? WHERE id = ?")
      .run(turns, input, output, cost, runId);
  }

  private saveMessages(runId: string, messages: MessageParam[]) {
    this.db.prepare("UPDATE runs SET messages = ? WHERE id = ?").run(JSON.stringify(messages), runId);
  }

  private succeed(runId: string, agent: Agent, output: string, truncated: boolean) {
    const res = this.db
      .prepare("UPDATE runs SET status = 'succeeded', output = ?, finished_at = ? WHERE id = ? AND status = 'running'")
      .run(truncated ? `${output}\n\n(Output truncated at the token limit.)` : output, now(), runId);
    if (!res.changes) return;
    addEvent(this.db, runId, "status", { status: "succeeded" });
    const run = getRun(this.db, runId)!;
    if (run.trigger !== "manual") {
      void this.notifier.notify({
        userId: agent.userId,
        agentId: agent.id,
        runId,
        title: `${agent.avatar} ${agent.name} finished`,
        body: output.slice(0, 200) || "Run completed.",
      });
    }
  }

  private fail(runId: string, error: string) {
    const res = this.db
      .prepare("UPDATE runs SET status = 'failed', error = ?, finished_at = ? WHERE id = ? AND status IN ('queued','running')")
      .run(error, now(), runId);
    if (!res.changes) return;
    addEvent(this.db, runId, "status", { status: "failed", error });
    const run = getRun(this.db, runId);
    const agent = run && getAgent(this.db, run.agentId);
    if (run && agent) {
      void this.notifier.notify({ userId: agent.userId, agentId: agent.id, runId, title: `${agent.avatar} ${agent.name} failed`, body: error });
    }
  }
}

export function describeToolCall(name: string, input: unknown): string {
  if (name === "http_request" && input && typeof input === "object") {
    const i = input as { method?: string; url?: string };
    return `${i.method ?? "GET"} ${i.url ?? ""}`;
  }
  return `${name}(${JSON.stringify(input).slice(0, 120)})`;
}

function describeApiError(err: unknown): string {
  if (err instanceof Anthropic.AuthenticationError) return "Anthropic rejected the API key. Check ANTHROPIC_API_KEY.";
  if (err instanceof Anthropic.RateLimitError) return "Rate limited by the Anthropic API. Try again shortly.";
  if (err instanceof Anthropic.BadRequestError) return `Anthropic API rejected the request: ${err.message}`;
  if (err instanceof Anthropic.APIError) return `Anthropic API error${err.status ? ` ${err.status}` : ""}: ${err.message}`;
  return `Model call failed: ${(err as Error).message}`;
}
