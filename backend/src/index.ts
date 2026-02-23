import { config } from "./config.js";
import { startBot, stopBot } from "./bot.js";
import { startScheduler } from "./scheduler.js";

async function main() {
  // Подхватываем Express app из app.ts независимо от того, как он экспортируется
  const mod: any = await import("./app");
  const maybeCreate = typeof mod.createApp === "function" ? mod.createApp() : null;
  const app: any = mod.default ?? mod.app ?? maybeCreate;

  if (!app || typeof app.listen !== "function") {
    throw new Error(
      "Cannot find Express app export in ./app (expected default export, named 'app', or createApp())."
    );
  }

  // Health endpoint
  if (typeof app.get === "function") {
    app.get("/health", (_req: any, res: any) => res.status(200).json({ ok: true }));
  }

  const port = Number(process.env.PORT || config.port || 4000);
  const host = process.env.HOST || "0.0.0.0";
  let stopScheduler: (() => void) | null = null;

  const server = app.listen(port, host, () => {
    console.log(`FamilyPulse API listening on http://${host}:${port}`);
  });

  let bot = null;
  if (config.enableBot) {
    bot = startBot();
    console.log("Telegram bot started");
  }
  if (config.enableScheduler) {
    stopScheduler = startScheduler({ bot });
    console.log("Scheduler started");
  }

  const shutdown = () => {
    if (stopScheduler) {
      stopScheduler();
      stopScheduler = null;
    }
    stopBot();
    server.close(() => process.exit(0));
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

main().catch((err) => {
  console.error("Fatal startup error:", err);
  process.exit(1);
});
