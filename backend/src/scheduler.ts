import cron from "node-cron";
import type { Telegraf } from "telegraf";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { checkinKeyboard } from "./bot.js";
import { syncAllEnabledFeeds } from "./calendar.js";
import { config } from "./config.js";
import { prisma } from "./db.js";
import { buildDigestText } from "./services.js";

function toYmd(now: Date, timezone: string): string {
  return formatInTimeZone(now, timezone, "yyyy-MM-dd");
}

function localRange(dateYmd: string, timezone: string) {
  const start = fromZonedTime(`${dateYmd}T00:00:00`, timezone);
  const end = fromZonedTime(`${dateYmd}T23:59:59`, timezone);
  return { start, end };
}

function plusDays(dateYmd: string, timezone: string, days: number): string {
  const base = fromZonedTime(`${dateYmd}T12:00:00`, timezone);
  return formatInTimeZone(new Date(base.getTime() + days * 24 * 60 * 60 * 1000), timezone, "yyyy-MM-dd");
}

async function sendDeadlineReminder(bot: Telegraf, link: { id: string; homeId: string; telegramChatId: string }, timezone: string) {
  const now = new Date();
  const ymd = toYmd(now, timezone);
  const tomorrowYmd = plusDays(ymd, timezone, 1);
  const today = localRange(ymd, timezone);
  const tomorrow = localRange(tomorrowYmd, timezone);

  const [dueToday, overdue, dueTomorrow] = await Promise.all([
    prisma.task.findMany({
      where: { homeId: link.homeId, status: "OPEN", dueDate: { gte: today.start, lte: today.end } },
      select: { title: true }
    }),
    prisma.task.findMany({
      where: { homeId: link.homeId, status: "OPEN", dueDate: { lt: today.start } },
      select: { title: true }
    }),
    prisma.task.findMany({
      where: { homeId: link.homeId, status: "OPEN", dueDate: { gte: tomorrow.start, lte: tomorrow.end } },
      select: { title: true }
    })
  ]);

  const morningText = [
    "FamilyPulse: задачи на сегодня",
    dueToday.length ? dueToday.map((task) => `• ${task.title}`).join("\n") : "• Нет задач с дедлайном на сегодня"
  ].join("\n");

  const eveningText = [
    "FamilyPulse: дедлайны (вечерний обзор)",
    overdue.length ? `Просрочено:\n${overdue.map((task) => `• ${task.title}`).join("\n")}` : "Просроченных задач нет",
    dueTomorrow.length
      ? `Дедлайн завтра:\n${dueTomorrow.map((task) => `• ${task.title}`).join("\n")}`
      : "На завтра дедлайнов нет"
  ].join("\n\n");

  const hhmm = formatInTimeZone(now, timezone, "HH:mm");
  if (hhmm === config.reminderMorningTime) {
    const linkRow = await prisma.chatLink.findUnique({ where: { id: link.id } });
    if (linkRow?.lastDeadlineMorningYmd !== ymd) {
      await bot.telegram.sendMessage(link.telegramChatId, morningText);
      await prisma.chatLink.update({
        where: { id: link.id },
        data: { lastDeadlineMorningYmd: ymd }
      });
    }
  }

  if (hhmm === config.reminderEveningTime) {
    const linkRow = await prisma.chatLink.findUnique({ where: { id: link.id } });
    if (linkRow?.lastDeadlineEveningYmd !== ymd) {
      await bot.telegram.sendMessage(link.telegramChatId, eveningText);
      await prisma.chatLink.update({
        where: { id: link.id },
        data: { lastDeadlineEveningYmd: ymd }
      });
    }
  }
}

export function startScheduler(options?: { bot?: Telegraf | null }) {
  let tick = 0;
  const mainTask = cron.schedule("* * * * *", async () => {
    const links = await prisma.chatLink.findMany({
      where: { enabled: true },
      include: { home: true }
    });

    tick += 1;
    const shouldSyncFeeds = tick % Math.max(1, config.calendarSyncIntervalMinutes) === 0;
    if (shouldSyncFeeds) {
      await syncAllEnabledFeeds();
    }

    for (const link of links) {
      const tz = link.home.timezone;
      const now = new Date();
      const hhmm = formatInTimeZone(now, tz, "HH:mm");
      const ymd = formatInTimeZone(now, tz, "yyyy-MM-dd");
      const bot = options?.bot ?? null;

      if (bot && hhmm === "09:00" && link.lastDigestYmd !== ymd) {
        const text = await buildDigestText(link.homeId, tz, now);
        await bot.telegram.sendMessage(link.telegramChatId, text);
        await prisma.chatLink.update({
          where: { id: link.id },
          data: { lastDigestYmd: ymd }
        });
      }

      if (bot && hhmm === config.checkinTime && link.lastCheckinYmd !== ymd) {
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

      if (bot) {
        await sendDeadlineReminder(bot, link, tz);
      }
    }
  });

  return () => {
    mainTask.stop();
  };
}
