export type RunStatus = 'queued' | 'running' | 'awaiting_approval' | 'succeeded' | 'failed' | 'cancelled';

export interface User {
  id: string;
  email: string;
  name: string;
  createdAt: string;
}

export interface RunSummary {
  id: string;
  agentId: string;
  trigger: 'manual' | 'schedule' | 'webhook';
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
  agent?: { name: string; avatar: string; color: string };
}

export interface Agent {
  id: string;
  name: string;
  description: string;
  avatar: string;
  color: string;
  systemPrompt: string;
  model: string;
  effort: string;
  tools: string[];
  approvalTools: string[];
  schedule: string | null;
  scheduleInput: string;
  status: 'active' | 'paused';
  createdAt: string;
  updatedAt: string;
  nextRunAt: string | null;
  stats: { runs: number; succeeded: number; failed: number; active: number; costUsd: number };
  lastRun: RunSummary | null;
  webhookSecret?: string;
}

export type AgentInput = Pick<
  Agent,
  'name' | 'description' | 'avatar' | 'color' | 'systemPrompt' | 'model' | 'effort' | 'tools' | 'approvalTools' | 'schedule' | 'scheduleInput' | 'status'
>;

export interface Approval {
  id: string;
  runId: string;
  toolUseId: string;
  toolName: string;
  input: any;
  status: 'pending' | 'approved' | 'denied';
  note: string | null;
  createdAt: string;
  resolvedAt: string | null;
  agent?: { id: string; name: string; avatar: string; color: string };
  runInput?: string;
}

export interface RunEvent {
  id: number;
  type: 'status' | 'text' | 'thinking' | 'tool_call' | 'tool_result' | 'approval_requested' | 'approval_resolved';
  data: any;
  createdAt: string;
}

export interface Meta {
  version: string;
  demoMode: boolean;
  models: { id: string; label: string; tier: string; inputPerM: number; outputPerM: number }[];
  tools: { id: string; label: string; description: string; kind: 'server' | 'local'; sensitive: boolean }[];
  efforts: string[];
  templates: (AgentInput & { id: string })[];
}

export interface Stats {
  agents: { total: number; active: number; scheduled: number };
  last30Days: { runs: number; running: number; awaitingApproval: number; succeeded: number; failed: number; costUsd: number; tokens: number };
  daily: { day: string; runs: number; cost: number }[];
  pendingApprovals: number;
  unreadNotifications: number;
}

export interface AppNotification {
  id: string;
  agentId: string | null;
  runId: string | null;
  title: string;
  body: string;
  read: boolean;
  createdAt: string;
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function normalizeServerUrl(url: string) {
  let u = url.trim().replace(/\/+$/, '');
  if (u && !/^https?:\/\//i.test(u)) u = `https://${u}`;
  return u;
}

export function createApi(baseUrl: string, getToken: () => string | null, onUnauthorized: () => void) {
  async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
    const token = getToken();
    let res: Response;
    try {
      res = await fetch(`${baseUrl}/api${path}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch {
      throw new ApiError(0, `Can't reach the server at ${baseUrl}`);
    }
    if (res.status === 204) return undefined as T;
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (res.status === 401 && token) onUnauthorized();
      throw new ApiError(res.status, data.error ?? `Request failed (${res.status})`);
    }
    return data as T;
  }

  return {
    health: () => call<{ ok: boolean; name: string; version: string; mode: string }>('GET', '/health'),
    authStatus: () => call<{ hasUsers: boolean; signupOpen: boolean }>('GET', '/auth/status'),
    login: (email: string, password: string) => call<{ token: string; user: User }>('POST', '/auth/login', { email, password }),
    register: (name: string, email: string, password: string) =>
      call<{ token: string; user: User }>('POST', '/auth/register', { name, email, password }),
    me: () => call<{ user: User }>('GET', '/auth/me'),
    meta: () => call<Meta>('GET', '/meta'),
    stats: () => call<Stats>('GET', '/stats'),

    agents: () => call<{ agents: Agent[] }>('GET', '/agents').then((r) => r.agents),
    agent: (id: string) => call<{ agent: Agent }>('GET', `/agents/${id}`).then((r) => r.agent),
    createAgent: (input: AgentInput) => call<{ agent: Agent }>('POST', '/agents', input).then((r) => r.agent),
    updateAgent: (id: string, input: Partial<AgentInput>) => call<{ agent: Agent }>('PATCH', `/agents/${id}`, input).then((r) => r.agent),
    deleteAgent: (id: string) => call<void>('DELETE', `/agents/${id}`),
    rotateWebhookSecret: (id: string) => call<{ webhookSecret: string }>('POST', `/agents/${id}/webhook-secret`),
    startRun: (agentId: string, input: string) => call<{ run: RunSummary }>('POST', `/agents/${agentId}/runs`, { input }).then((r) => r.run),
    memory: (agentId: string) =>
      call<{ memory: { key: string; value: string; updatedAt: string }[] }>('GET', `/agents/${agentId}/memory`).then((r) => r.memory),
    deleteMemory: (agentId: string, key: string) => call<void>('DELETE', `/agents/${agentId}/memory/${encodeURIComponent(key)}`),

    runs: (params: { agentId?: string; status?: string; limit?: number } = {}) => {
      const qs = Object.entries(params)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
        .join('&');
      return call<{ runs: RunSummary[] }>('GET', `/runs${qs ? `?${qs}` : ''}`).then((r) => r.runs);
    },
    run: (id: string) =>
      call<{ run: RunSummary; agent: { id: string; name: string; avatar: string; color: string; model: string } | null; approvals: Approval[] }>(
        'GET',
        `/runs/${id}`,
      ),
    runEvents: (id: string, after = 0) => call<{ status: RunStatus; events: RunEvent[] }>('GET', `/runs/${id}/events?after=${after}`),
    cancelRun: (id: string) => call<{ run: RunSummary }>('POST', `/runs/${id}/cancel`),
    retryRun: (id: string) => call<{ run: RunSummary }>('POST', `/runs/${id}/retry`).then((r) => r.run),

    approvals: () => call<{ approvals: Approval[] }>('GET', '/approvals').then((r) => r.approvals),
    decide: (id: string, decision: 'approve' | 'deny', note?: string) => call<{ approval: Approval }>('POST', `/approvals/${id}`, { decision, note }),

    notifications: () => call<{ notifications: AppNotification[] }>('GET', '/notifications').then((r) => r.notifications),
    readAllNotifications: () => call<void>('POST', '/notifications/read-all'),
    registerPushToken: (token: string) => call<void>('POST', '/notifications/push-tokens', { token }),
  };
}

export type Api = ReturnType<typeof createApi>;
