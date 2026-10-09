import fs from "node:fs";
import path from "node:path";
import cors from "cors";
import express from "express";
import type { LLM } from "./agent/llm.js";
import type { Runner } from "./agent/runner.js";
import type { Scheduler } from "./agent/scheduler.js";
import { requireAuth } from "./auth.js";
import { config } from "./config.js";
import type { DB } from "./db.js";
import { errorHandler } from "./lib.js";
import { agentRoutes } from "./routes/agents.js";
import { authRoutes } from "./routes/auth.js";
import { hookRoutes, metaRoutes, notificationRoutes, statsRoutes, VERSION } from "./routes/misc.js";
import { approvalRoutes, runRoutes } from "./routes/runs.js";

export interface AppDeps {
  db: DB;
  llm: LLM;
  runner: Runner;
  scheduler: Scheduler;
  webDistPath?: string | null;
}

export function createApp({ db, llm, runner, scheduler, webDistPath = config.webDistPath }: AppDeps) {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", true);
  app.use(cors());
  app.use(express.json({ limit: "1mb" }));

  app.get("/api/health", (_req, res) => res.json({ ok: true, name: "Agentry", version: VERSION, mode: llm.name }));
  app.use("/api/auth", authRoutes(db));
  app.use("/api/hooks", hookRoutes(db, runner));
  app.use("/api/meta", requireAuth, metaRoutes(llm));
  app.use("/api/agents", requireAuth, agentRoutes(db, runner, scheduler));
  app.use("/api/runs", requireAuth, runRoutes(db, runner));
  app.use("/api/approvals", requireAuth, approvalRoutes(db, runner));
  app.use("/api/notifications", requireAuth, notificationRoutes(db));
  app.use("/api/stats", requireAuth, statsRoutes(db));
  app.use("/api", (_req, res) => res.status(404).json({ error: "Not found" }));

  // Serve the web build of the mobile app (npm run build:web) so the same URL works in a browser.
  if (webDistPath && fs.existsSync(path.join(webDistPath, "index.html"))) {
    app.use(express.static(webDistPath));
    app.get(/.*/, (_req, res) => res.sendFile(path.join(webDistPath, "index.html")));
  } else {
    app.get("/", (_req, res) =>
      res.type("html").send(
        `<!doctype html><meta name=viewport content="width=device-width"><body style="font-family:system-ui;background:#0B0B12;color:#EDEDF5;padding:32px">
         <h1>Agentry server is running</h1><p>Open the Agentry mobile app and enter this URL as your server.</p>
         <p>Run <code>npm run build:web</code> to also serve the web app here.</p></body>`,
      ),
    );
  }

  app.use(errorHandler);
  return app;
}
