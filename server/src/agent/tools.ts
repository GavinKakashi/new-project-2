import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import type { DB } from "../db.js";
import type { Agent } from "../repo.js";
import { modelInfo, type ToolId } from "./catalog.js";
import type { Notifier } from "./notifier.js";

type BetaTool = Anthropic.Beta.BetaToolUnion;

/** API-facing tool names for the locally executed tools. */
export const LOCAL_TOOL_NAMES: Partial<Record<ToolId, string>> = {
  http_request: "http_request",
  memory: "agent_memory",
  notify: "send_push_notification",
  clock: "get_current_time",
};

export function toolIdForName(name: string): ToolId | undefined {
  for (const [id, n] of Object.entries(LOCAL_TOOL_NAMES)) if (n === name) return id as ToolId;
  if (name === "web_search" || name === "web_fetch") return name;
  return undefined;
}

const HttpInput = z.object({
  method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]),
  url: z.string().url(),
  headers: z.record(z.string(), z.string()).optional(),
  body: z.string().optional(),
});
const MemoryInput = z.object({
  action: z.enum(["get", "set", "delete", "list"]),
  key: z.string().max(200).optional(),
  value: z.string().max(20_000).optional(),
});
const NotifyInput = z.object({ title: z.string().min(1).max(120), body: z.string().min(1).max(1000) });

export function buildToolDefinitions(agent: Agent): BetaTool[] {
  const latest = modelInfo(agent.model).latestWebTools;
  const defs: BetaTool[] = [];
  for (const id of agent.tools) {
    switch (id) {
      case "web_search":
        defs.push(latest
          ? { type: "web_search_20260209", name: "web_search", max_uses: 5 }
          : { type: "web_search_20250305", name: "web_search", max_uses: 5 });
        break;
      case "web_fetch":
        defs.push(latest
          ? { type: "web_fetch_20260209", name: "web_fetch", max_uses: 5 }
          : { type: "web_fetch_20250910", name: "web_fetch", max_uses: 5 });
        break;
      case "http_request":
        defs.push({
          name: LOCAL_TOOL_NAMES.http_request!,
          description:
            "Make an HTTP request to an external API and return the status, headers and body (truncated to 20k characters). Use for reading or writing data on web services.",
          input_schema: {
            type: "object",
            properties: {
              method: { type: "string", enum: ["GET", "POST", "PUT", "PATCH", "DELETE"] },
              url: { type: "string", description: "Absolute http(s) URL" },
              headers: { type: "object", additionalProperties: { type: "string" } },
              body: { type: "string", description: "Raw request body (JSON-encode objects yourself)" },
            },
            required: ["method", "url"],
          },
        });
        break;
      case "memory":
        defs.push({
          name: LOCAL_TOOL_NAMES.memory!,
          description:
            "Persistent key-value memory that survives between runs of this agent. action=list returns all keys; get returns one value; set stores a value; delete removes a key.",
          input_schema: {
            type: "object",
            properties: {
              action: { type: "string", enum: ["get", "set", "delete", "list"] },
              key: { type: "string" },
              value: { type: "string" },
            },
            required: ["action"],
          },
        });
        break;
      case "notify":
        defs.push({
          name: LOCAL_TOOL_NAMES.notify!,
          description: "Send a push notification to the owner's phone. Use sparingly, for things they should see now.",
          input_schema: {
            type: "object",
            properties: { title: { type: "string" }, body: { type: "string" } },
            required: ["title", "body"],
          },
        });
        break;
      case "clock":
        defs.push({
          name: LOCAL_TOOL_NAMES.clock!,
          description: "Get the current date and time (UTC, ISO 8601).",
          input_schema: { type: "object", properties: {} },
        });
        break;
    }
  }
  return defs;
}

export interface ToolContext {
  db: DB;
  agent: Agent;
  runId: string;
  notifier: Notifier;
  allowPrivateNetwork?: boolean;
}

export interface ToolOutcome {
  content: string;
  isError?: boolean;
}

export async function executeLocalTool(name: string, input: unknown, ctx: ToolContext): Promise<ToolOutcome> {
  const id = toolIdForName(name);
  if (!id || !ctx.agent.tools.includes(id)) return { content: `Tool ${name} is not enabled for this agent.`, isError: true };
  try {
    switch (id) {
      case "clock":
        return { content: new Date().toISOString() };
      case "memory":
        return runMemory(MemoryInput.parse(input), ctx);
      case "notify": {
        const { title, body } = NotifyInput.parse(input);
        await ctx.notifier.notify({ userId: ctx.agent.userId, agentId: ctx.agent.id, runId: ctx.runId, title, body });
        return { content: "Notification sent." };
      }
      case "http_request":
        return await runHttp(HttpInput.parse(input), ctx);
      default:
        return { content: `Tool ${name} cannot be executed locally.`, isError: true };
    }
  } catch (err) {
    if (err instanceof z.ZodError) return { content: `Invalid input: ${z.prettifyError(err)}`, isError: true };
    return { content: `Tool failed: ${(err as Error).message}`, isError: true };
  }
}

function runMemory(input: z.infer<typeof MemoryInput>, { db, agent }: ToolContext): ToolOutcome {
  const needKey = () => {
    if (!input.key) throw new Error("key is required");
    return input.key;
  };
  switch (input.action) {
    case "list": {
      const rows = db.prepare("SELECT key, updated_at FROM memories WHERE agent_id = ? ORDER BY key").all(agent.id);
      return { content: JSON.stringify(rows) };
    }
    case "get": {
      const row = db.prepare("SELECT value FROM memories WHERE agent_id = ? AND key = ?").get(agent.id, needKey()) as
        | { value: string }
        | undefined;
      return { content: row ? row.value : "(no value saved for this key)" };
    }
    case "set": {
      if (input.value === undefined) throw new Error("value is required for set");
      db.prepare(
        `INSERT INTO memories (agent_id, key, value) VALUES (?, ?, ?)
         ON CONFLICT(agent_id, key) DO UPDATE SET value = excluded.value, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')`,
      ).run(agent.id, needKey(), input.value);
      return { content: "Saved." };
    }
    case "delete":
      db.prepare("DELETE FROM memories WHERE agent_id = ? AND key = ?").run(agent.id, needKey());
      return { content: "Deleted." };
  }
}

const PRIVATE_HOST = /^(localhost|0\.0\.0\.0|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|\[?::1\]?|\[?f[cd][0-9a-f]{2}:)/i;

async function runHttp(input: z.infer<typeof HttpInput>, ctx: ToolContext): Promise<ToolOutcome> {
  const url = new URL(input.url);
  if (url.protocol !== "http:" && url.protocol !== "https:") return { content: "Only http(s) URLs are allowed.", isError: true };
  if (!ctx.allowPrivateNetwork && PRIVATE_HOST.test(url.hostname)) {
    return { content: "Requests to private or local network addresses are blocked.", isError: true };
  }
  const res = await fetch(url, {
    method: input.method,
    headers: input.headers,
    body: input.method === "GET" ? undefined : input.body,
    signal: AbortSignal.timeout(20_000),
    redirect: "follow",
  });
  const text = await res.text();
  const body = text.length > 20_000 ? `${text.slice(0, 20_000)}\n…(truncated ${text.length - 20_000} chars)` : text;
  return {
    content: JSON.stringify({ status: res.status, contentType: res.headers.get("content-type"), body }),
    isError: res.status >= 400,
  };
}
