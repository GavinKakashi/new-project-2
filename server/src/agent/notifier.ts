import type { DB } from "../db.js";
import { newId } from "../repo.js";

export interface Notifier {
  notify(n: { userId: string; agentId?: string; runId?: string; title: string; body: string }): Promise<void>;
}

/** Stores an in-app notification and fans it out to the user's devices via the Expo push service. */
export class ExpoNotifier implements Notifier {
  constructor(
    private db: DB,
    private send: (messages: object[]) => Promise<void> = sendExpoPush,
  ) {}

  async notify({ userId, agentId, runId, title, body }: Parameters<Notifier["notify"]>[0]) {
    this.db
      .prepare("INSERT INTO notifications (id, user_id, agent_id, run_id, title, body) VALUES (?, ?, ?, ?, ?, ?)")
      .run(newId(), userId, agentId ?? null, runId ?? null, title, body);
    const tokens = this.db.prepare("SELECT token FROM push_tokens WHERE user_id = ?").all(userId) as { token: string }[];
    if (tokens.length === 0) return;
    const messages = tokens.map(({ token }) => ({
      to: token,
      title,
      body: body.slice(0, 240),
      sound: "default",
      data: { runId, agentId },
    }));
    try {
      await this.send(messages);
    } catch (err) {
      console.warn("[push] delivery failed:", (err as Error).message);
    }
  }
}

async function sendExpoPush(messages: object[]) {
  const res = await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(messages),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Expo push returned ${res.status}`);
}
