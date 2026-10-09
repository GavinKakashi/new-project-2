# Agentry HTTP API

Base URL: `https://<your-server>/api`. Send JSON bodies with `Content-Type: application/json`.
Authenticated endpoints need `Authorization: Bearer <token>` (from register/login). Errors look like `{ "error": "message" }`.

## Auth
| Method | Path | Body | Notes |
|---|---|---|---|
| GET | `/auth/status` | none | `{ hasUsers, signupOpen }` |
| POST | `/auth/register` | `{ name, email, password }` | First user is always allowed; others only if `ALLOW_SIGNUP=true`. |
| POST | `/auth/login` | `{ email, password }` | Returns `{ token, user }` (token valid 30 days). |
| GET | `/auth/me` | none | |

## Agents
| Method | Path | Notes |
|---|---|---|
| GET | `/agents` | List with stats, `lastRun` and `nextRunAt`. |
| POST | `/agents` | Create (fields below). |
| GET | `/agents/:id` | Includes `webhookSecret`. |
| PATCH | `/agents/:id` | Partial update, e.g. `{ "status": "paused" }`. |
| DELETE | `/agents/:id` | Cancels active runs and deletes runs and memory. |
| POST | `/agents/:id/runs` | `{ input }` starts a run. |
| POST | `/agents/:id/webhook-secret` | Rotates the webhook secret. |
| GET | `/agents/:id/memory` | Key/value memory. |
| DELETE | `/agents/:id/memory/:key` | |

Agent fields: `name`, `description`, `avatar` (emoji), `color` (`#RRGGBB`), `systemPrompt`, `model` (`claude-opus-5-5` · `claude-sonnet-5-5` · `claude-haiku-5-5` · `claude-fable-5-1`), `effort` (`low`…`max`), `tools` (`web_search`, `web_fetch`, `http_request`, `memory`, `notify`, `clock`), `approvalTools` (a subset of the local tools), `schedule` (5-field cron or `null`), `scheduleInput`, `status` (`active`/`paused`).

## Runs
| Method | Path | Notes |
|---|---|---|
| GET | `/runs?agentId=&status=&limit=&before=` | `status` may be `active` (queued, running or awaiting approval). |
| GET | `/runs/:id` | `{ run, agent, approvals }` |
| GET | `/runs/:id/events?after=<eventId>` | Incremental timeline. Poll while the run is active. Event types: `status`, `text`, `thinking`, `tool_call`, `tool_result`, `approval_requested`, `approval_resolved`. |
| POST | `/runs/:id/cancel` | |
| POST | `/runs/:id/retry` | New run with the same input. |

Run statuses: `queued` → `running` → (`awaiting_approval` ⇄ `running`) → `succeeded` · `failed` · `cancelled`.

## Approvals
| Method | Path | Notes |
|---|---|---|
| GET | `/approvals` | Pending approvals (`?status=all` for history). |
| POST | `/approvals/:id` | `{ decision: "approve" \| "deny", note? }`. The run resumes once all of its approvals are decided; a note on a denial is passed to the agent. |

## Other
| Method | Path | Notes |
|---|---|---|
| GET | `/meta` | Models, tools, efforts, templates, and `demoMode`. |
| GET | `/stats` | Dashboard numbers. |
| GET | `/notifications` · POST `/notifications/read-all` | In-app notification feed. |
| POST / DELETE | `/notifications/push-tokens` | `{ token }` registers or removes an Expo push token. |
| GET | `/health` | Public. |

## Webhook trigger (public)

```bash
curl -X POST https://<server>/api/hooks/<agentId> \
  -H 'Content-Type: application/json' \
  -H 'X-Agentry-Secret: <webhookSecret>' \
  -d '{"input": "Summarize today'\''s support tickets"}'
```

Any other JSON body is passed to the agent as the payload. Responds `202 { runId, status }`.
