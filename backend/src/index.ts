import app from "./app.js";
import { config } from "./config.js";
import { prisma } from "./db.js";
import { bot } from "./bot.js";
import { startScheduler } from "./scheduler.js";

async function start() {
  await prisma.$connect();

  await bot.launch();
  startScheduler();

  app.listen(config.port, () => {
    console.log(`Backend listening on :${config.port}`);
  });

  process.once("SIGINT", async () => {
    await bot.stop("SIGINT");
    await prisma.$disconnect();
    process.exit(0);
  });
  process.once("SIGTERM", async () => {
    await bot.stop("SIGTERM");
    await prisma.$disconnect();
    process.exit(0);
  });
}

start().catch((err) => {
  console.error(err);
  process.exit(1);
});
