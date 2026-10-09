# Agentry: notes for Claude Code

Monorepo with two independent npm projects (no workspaces). Run commands with `--prefix`, or from inside each folder.

- `server/`: Express 5 + better-sqlite3 + `@anthropic-ai/sdk`, ESM TypeScript (`.js` import suffixes required).
  - Agent loop: `src/agent/runner.ts`. It is a manual tool-use loop on `client.beta.messages`, and its full conversation state is persisted in `runs.messages` so runs can pause for approvals. Keep history append-only: never edit earlier messages, because thinking blocks are bound to the history.
  - Opus 5.5 / Sonnet 5.5 / Fable 5.1 reject `thinking: disabled`, `budget_tokens` and forced `tool_choice`. Control depth with `output_config.effort` only.
  - Schema changes: append a new entry to `MIGRATIONS` in `src/db.ts` and never edit old ones.
  - Tests: `npm test` (uses `MockLLM` / scripted LLMs, no network).
- `mobile/`: Expo SDK 57 + Expo Router (routes in `src/app/`), TanStack Query for data. Install native packages at the versions in `node_modules/expo/bundledNativeModules.json`.
  - Check: `npx tsc --noEmit`, `npm run build:web`.

Before committing: `npm test && npm run typecheck` from the repo root.
