import Anthropic from "@anthropic-ai/sdk";
import { config, isMockMode } from "../config.js";

export type CreateParams = Anthropic.Beta.MessageCreateParamsNonStreaming;
export type LLMMessage = Anthropic.Beta.BetaMessage;

export interface LLM {
  readonly name: string;
  create(params: CreateParams): Promise<LLMMessage>;
}

export class ClaudeLLM implements LLM {
  readonly name = "anthropic";
  private client: Anthropic;
  constructor(apiKey = config.anthropicApiKey) {
    this.client = new Anthropic({ apiKey });
  }
  async create(params: CreateParams): Promise<LLMMessage> {
    // Streaming avoids HTTP timeouts on long agent turns; we only need the final message.
    return this.client.beta.messages.stream(params).finalMessage();
  }
}

/**
 * Deterministic offline model used when no ANTHROPIC_API_KEY is configured.
 * It exercises the same tool loop (including approvals) so the whole app can be demoed for free.
 */
export class MockLLM implements LLM {
  readonly name = "mock";
  async create(params: CreateParams): Promise<LLMMessage> {
    const toolNames = new Set((params.tools ?? []).map((t) => ("name" in t ? t.name : "")));
    const msgs = params.messages;
    const first = msgs[0];
    const task = typeof first?.content === "string" ? first.content : "";
    const last = msgs[msgs.length - 1];
    const lastIsToolResult =
      Array.isArray(last?.content) && last.content.some((b) => typeof b === "object" && b.type === "tool_result");

    if (!lastIsToolResult) {
      const url = task.match(/https?:\/\/\S+/)?.[0];
      if (url && toolNames.has("http_request")) {
        return this.toolCall(params, `I'll fetch ${url} to complete this task.`, "http_request", { method: "GET", url });
      }
      if (toolNames.has("get_current_time")) {
        return this.toolCall(params, "Let me check the current time first.", "get_current_time", {});
      }
    }

    const results = msgs
      .flatMap((m) => (Array.isArray(m.content) ? m.content : []))
      .filter((b): b is Anthropic.Beta.BetaToolResultBlockParam => typeof b === "object" && b.type === "tool_result")
      .map((b) => (typeof b.content === "string" ? b.content : JSON.stringify(b.content)).slice(0, 300));

    const text = [
      `**Demo mode** — no Anthropic API key is configured, so this is a simulated answer.`,
      ``,
      `Task: ${task || "(none)"}`,
      results.length ? `\nTool results:\n${results.map((r) => `- ${r}`).join("\n")}` : "",
      ``,
      `Add ANTHROPIC_API_KEY to your server's secrets to run this agent on ${params.model}.`,
    ].join("\n");
    return this.message(params, [{ type: "text", text, citations: null }], "end_turn");
  }

  private toolCall(params: CreateParams, text: string, name: string, input: object) {
    return this.message(
      params,
      [
        { type: "text", text, citations: null },
        { type: "tool_use", id: `toolu_mock_${Math.random().toString(36).slice(2, 10)}`, name, input },
      ] as Anthropic.Beta.BetaContentBlock[],
      "tool_use",
    );
  }

  private message(params: CreateParams, content: Anthropic.Beta.BetaContentBlock[], stop: "end_turn" | "tool_use"): LLMMessage {
    const inputTokens = Math.ceil(JSON.stringify(params.messages).length / 4) + 200;
    const outputTokens = Math.ceil(JSON.stringify(content).length / 4);
    return {
      id: `msg_mock_${Date.now()}`,
      type: "message",
      role: "assistant",
      model: params.model,
      content,
      stop_reason: stop,
      stop_sequence: null,
      usage: { input_tokens: inputTokens, output_tokens: outputTokens },
    } as unknown as LLMMessage;
  }
}

export function createLLM(): LLM {
  return isMockMode() ? new MockLLM() : new ClaudeLLM();
}
