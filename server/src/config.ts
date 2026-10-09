import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

// Load server/.env for local development (Replit and most hosts inject env vars directly).
if (fs.existsSync(".env")) process.loadEnvFile(".env");

function int(name: string, fallback: number): number {
  const raw = process.env[name];
  const n = raw ? Number.parseInt(raw, 10) : NaN;
  return Number.isFinite(n) ? n : fallback;
}

export const config = {
  port: int("PORT", 3000),
  databasePath: process.env.DATABASE_PATH ?? path.resolve(process.cwd(), "data", "agentry.db"),
  jwtSecret: process.env.JWT_SECRET || "",
  /** When false, only the very first account can register (single-owner installs). */
  allowSignup: (process.env.ALLOW_SIGNUP ?? "false").toLowerCase() === "true",
  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? "",
  /** Force the offline mock model even if an API key is present (demos, tests). */
  forceMock: (process.env.AGENTRY_MOCK ?? "false").toLowerCase() === "true",
  maxConcurrentRuns: int("MAX_CONCURRENT_RUNS", 4),
  maxTurnsPerRun: int("MAX_TURNS_PER_RUN", 25),
  webDistPath: process.env.WEB_DIST_PATH ?? path.resolve(process.cwd(), "..", "mobile", "dist"),
};

export const isMockMode = () => config.forceMock || !config.anthropicApiKey;

/**
 * Without JWT_SECRET, generate a random secret once and keep it next to the database,
 * so no install ever signs tokens with a well-known default.
 */
export function ensureJwtSecret() {
  if (config.jwtSecret) return;
  const file = path.join(path.dirname(config.databasePath), ".jwt-secret");
  if (fs.existsSync(file)) {
    config.jwtSecret = fs.readFileSync(file, "utf8").trim();
  } else {
    config.jwtSecret = crypto.randomBytes(48).toString("base64url");
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, config.jwtSecret, { mode: 0o600 });
    console.log(`Generated a JWT secret at ${file} (set JWT_SECRET to manage it yourself).`);
  }
}
