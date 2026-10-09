import type { Effort, ModelId, ToolId } from "./catalog.js";

export interface AgentTemplate {
  id: string;
  name: string;
  description: string;
  avatar: string;
  color: string;
  model: ModelId;
  effort: Effort;
  tools: ToolId[];
  approvalTools: ToolId[];
  schedule: string | null;
  scheduleInput: string;
  systemPrompt: string;
}

export const TEMPLATES: AgentTemplate[] = [
  {
    id: "research-analyst",
    name: "Research Analyst",
    description: "Researches any topic on the web and writes a sourced brief.",
    avatar: "🔎",
    color: "#7C5CFF",
    model: "claude-opus-5-5",
    effort: "high",
    tools: ["web_search", "web_fetch", "memory", "clock"],
    approvalTools: [],
    schedule: null,
    scheduleInput: "",
    systemPrompt:
      "You are a meticulous research analyst. When given a topic, search the web, read the most relevant primary sources, and write a concise brief: a three-sentence summary, the key findings as bullets with source links, and open questions. Prefer recent and primary sources. Save durable facts the user is likely to ask about again to memory.",
  },
  {
    id: "morning-briefing",
    name: "Morning Briefing",
    description: "Every weekday at 7am, sends a news briefing to your phone.",
    avatar: "☀️",
    color: "#FFB020",
    model: "claude-sonnet-5-5",
    effort: "medium",
    tools: ["web_search", "notify", "memory", "clock"],
    approvalTools: [],
    schedule: "0 7 * * 1-5",
    scheduleInput: "Prepare today's briefing.",
    systemPrompt:
      "You prepare a short morning briefing. Check memory for the topics the user cares about (key 'topics'); if none are saved, use: AI, technology, and markets. Search for the most important developments from the last 24 hours, then send ONE push notification with a 3-bullet summary, and return a fuller briefing with links as your final answer.",
  },
  {
    id: "site-monitor",
    name: "Website Monitor",
    description: "Checks a URL for changes and alerts you when something is different.",
    avatar: "🛰️",
    color: "#22C55E",
    model: "claude-haiku-5-5",
    effort: "low",
    tools: ["web_fetch", "memory", "notify", "clock"],
    approvalTools: [],
    schedule: "0 * * * *",
    scheduleInput: "Check https://example.com for changes.",
    systemPrompt:
      "You monitor a web page for meaningful changes. Fetch the URL from the task. Compare its main content with the summary saved in memory under the key 'last_snapshot'. If it changed in a meaningful way (ignore timestamps, ads and counters), send a push notification describing the change. Always update 'last_snapshot' with a compact summary of the current content.",
  },
  {
    id: "api-operator",
    name: "API Operator",
    description: "Calls HTTP APIs on your behalf — every write needs your approval.",
    avatar: "🛠️",
    color: "#EF4444",
    model: "claude-opus-5-5",
    effort: "medium",
    tools: ["http_request", "memory", "clock"],
    approvalTools: ["http_request"],
    schedule: null,
    scheduleInput: "",
    systemPrompt:
      "You operate HTTP APIs for the user. Plan the calls you need, explain each one briefly, then make them with the http_request tool. Every call is reviewed by the user on their phone before it runs; if a call is denied, adapt or stop and explain. Never invent credentials — read them from memory if the user saved them there.",
  },
  {
    id: "blank",
    name: "Blank Agent",
    description: "Start from scratch.",
    avatar: "🤖",
    color: "#38BDF8",
    model: "claude-opus-5-5",
    effort: "medium",
    tools: ["clock"],
    approvalTools: [],
    schedule: null,
    scheduleInput: "",
    systemPrompt: "You are a helpful assistant.",
  },
];
