# Selling Agentry

Agentry is built to be sold two ways: as a **finished product** (hosted app plus store listings) and as **source code** (a licensed codebase buyers deploy themselves). This page is the checklist for both.

## What buyers get

- A production-shaped TypeScript codebase: a typed API with validation (zod), a test suite, and no paid third-party services required.
- iOS, Android and web from one Expo codebase.
- One-click hosting on Replit, or any Node host.
- A demo mode that works without an API key, for sales demos and buyer evaluation.

## White-label checklist

| What | Where |
|---|---|
| App name, slug, URL scheme | `mobile/app.json` → `name`, `slug`, `scheme` |
| Bundle IDs | `mobile/app.json` → `ios.bundleIdentifier`, `android.package` |
| Icons and splash | `mobile/assets/images/*`, `mobile/assets/expo.icon` |
| Brand colors | `mobile/src/lib/theme.ts` |
| Login screen copy and logo | `mobile/src/app/login.tsx` |
| Agent templates | `server/src/agent/templates.ts` |
| Models and pricing shown | `server/src/agent/catalog.ts` |
| Server name in health and landing page | `server/src/app.ts` |

## Packaging the source for sale

1. Replace `LICENSE` with your commercial license or EULA. The included file is an all-rights-reserved placeholder.
2. Remove `.git` history if you don't want to ship it: `git archive --format=zip HEAD -o agentry-source.zip`.
3. Include the `docs/` folder. It is written for buyers.
4. Suggested tiers:
   - **Personal**: a single deployment, no resale.
   - **Commercial**: unlimited deployments for the buyer's own business.
   - **Extended / SaaS**: the buyer may offer it to their own customers (with `ALLOW_SIGNUP=true`).

Marketplaces where this kind of product sells include CodeCanyon, Gumroad and Lemon Squeezy (for source code), Flippa and Acquire.com (for the running business), and the Replit template gallery.

## Running it as a hosted SaaS

- Set `ALLOW_SIGNUP=true` so anyone can create an account. Every user's agents, runs and approvals are isolated by `user_id`.
- Today every user's agents run on the server's `ANTHROPIC_API_KEY`. Before charging customers, add per-user usage limits (cost is already tracked per run in `runs.cost_usd`) or let users bring their own key.
- For billing, Stripe Checkout with a webhook that sets a plan on the `users` table is the usual path.

## Roadmap ideas buyers value

- Per-user API keys and spend caps
- MCP server connections as agent tools (the Claude API supports MCP natively)
- Team workspaces and roles
- Streaming token-by-token output in the run view
- Postgres support for horizontal scaling
