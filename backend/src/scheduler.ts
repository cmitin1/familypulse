import cron from "node-cron";
import { formatInTimeZone } from "date-fns-tz";
import { bot, checkinKeyboard } from "./bot.js";
import { prisma } from "./db.js";
import { buildDigestText } from "./services.js";

export function startScheduler() {
  cron.schedule("* * * * *", async () => {
    const links = await prisma.chatLink.findMany({
      where: { enabled: true },
      include: { home: true }
    });

    for (const link of links) {
      const tz = link.home.timezone;
      const now = new Date();
      const hhmm = formatInTimeZone(now, tz, "HH:mm");
      const ymd = formatInTimeZone(now, tz, "yyyy-MM-dd");

      if (hhmm === "09:00" && link.lastDigestYmd !== ymd) {
        const text = await buildDigestText(link.homeId, tz, now);
        await bot.telegram.sendMessage(link.telegramChatId, text);
        await prisma.chatLink.update({
          where: { id: link.id },
          data: { lastDigestYmd: ymd }
        });
      }

      if (hhmm === "21:30" && link.lastCheckinYmd !== ymd) {
        await bot.telegram.sendMessage(
          link.telegramChatId,
          `FamilyPulse: вечерний чек-ин (${ymd})`,
          checkinKeyboard(link.homeId, ymd)
        );
        await prisma.chatLink.update({
          where: { id: link.id },
          data: { lastCheckinYmd: ymd }
        });
      }
    }
  });
}
