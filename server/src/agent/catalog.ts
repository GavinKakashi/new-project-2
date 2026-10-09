/** Models an agent can run on, with per-million-token pricing used for cost tracking. */
export const MODELS = [
  { id: "claude-opus-5-5", label: "Claude Opus 5.5", tier: "Most capable everyday model", inputPerM: 4, outputPerM: 20, latestWebTools: true, fallbacks: true },
  { id: "claude-sonnet-5-5", label: "Claude Sonnet 5.5", tier: "Fast and capable", inputPerM: 2, outputPerM: 10, latestWebTools: true, fallbacks: true },
  { id: "claude-haiku-5-5", label: "Claude Haiku 5.5", tier: "Fastest, lowest cost", inputPerM: 0.1, outputPerM: 0.5, latestWebTools: false, fallbacks: false },
  { id: "claude-fable-5-1", label: "Claude Fable 5.1", tier: "Frontier reasoning (premium)", inputPerM: 10, outputPerM: 50, latestWebTools: true, fallbacks: true },
] as const;

export type ModelId = (typeof MODELS)[number]["id"];
export const MODEL_IDS = MODELS.map((m) => m.id) as [ModelId, ...ModelId[]];
export const DEFAULT_MODEL: ModelId = "claude-opus-5-5";

export const EFFORTS = ["low", "medium", "high", "xhigh", "max"] as const;
export type Effort = (typeof EFFORTS)[number];

export function modelInfo(id: string) {
  return MODELS.find((m) => m.id === id) ?? MODELS[0];
}

export function costUsd(model: string, inputTokens: number, outputTokens: number) {
  const m = modelInfo(model);
  return (inputTokens * m.inputPerM + outputTokens * m.outputPerM) / 1_000_000;
}

/** Tools an agent can be granted. "server" tools run on Anthropic's side; "local" tools run in this server. */
export const TOOLS = [
  { id: "web_search", label: "Web search", description: "Search the web for up-to-date information.", kind: "server", sensitive: false },
  { id: "web_fetch", label: "Web fetch", description: "Read the full contents of a web page.", kind: "server", sensitive: false },
  { id: "http_request", label: "HTTP request", description: "Call any HTTP API (GET/POST/PUT/PATCH/DELETE).", kind: "local", sensitive: true },
  { id: "memory", label: "Long-term memory", description: "Save and recall notes that persist between runs.", kind: "local", sensitive: false },
  { id: "notify", label: "Push notification", description: "Send a notification to your phone.", kind: "local", sensitive: false },
  { id: "clock", label: "Clock", description: "Get the current date and time.", kind: "local", sensitive: false },
] as const;

export type ToolId = (typeof TOOLS)[number]["id"];
export const TOOL_IDS = TOOLS.map((t) => t.id) as [ToolId, ...ToolId[]];
