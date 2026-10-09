import { createApp } from "./app.js";
import { createLLM } from "./agent/llm.js";
import { ExpoNotifier } from "./agent/notifier.js";
import { Runner } from "./agent/runner.js";
import { Scheduler } from "./agent/scheduler.js";
import { config, ensureJwtSecret } from "./config.js";
import { openDatabase } from "./db.js";

ensureJwtSecret();

const db = openDatabase();
const llm = createLLM();
const runner = new Runner(db, llm, new ExpoNotifier(db), { allowPrivateNetwork: process.env.ALLOW_PRIVATE_HTTP === "true" });
const scheduler = new Scheduler(db, runner);

const recovered = runner.recover();
scheduler.start();

const server = createApp({ db, llm, runner, scheduler }).listen(config.port, "0.0.0.0", () => {
  console.log(`Agentry server listening on http://0.0.0.0:${config.port}`);
  console.log(llm.name === "mock" ? "⚠ Demo mode: set ANTHROPIC_API_KEY to run agents on Claude." : "Model provider: Anthropic");
  if (recovered) console.log(`Resumed ${recovered} interrupted run(s).`);
});

function shutdown() {
  scheduler.stopAll();
  server.close(() => {
    db.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 5_000).unref();
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
