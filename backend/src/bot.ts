import { Markup, Telegraf } from "telegraf";
import { Prisma, SourceType } from "@prisma/client";
import { config } from "./config.js";
import { prisma } from "./db.js";
import { awardPointsIdempotent, buildDigestText } from "./services.js";

let botInstance: Telegraf | null = null;

function miniAppDirectUrl(payload: string) {
  if (!config.telegramBotUsername) {
    throw new Error("TELEGRAM_BOT_USERNAME is required to generate mini-app links");
  }
  return `https://t.me/${config.telegramBotUsername}/${config.telegramMiniAppName}?startapp=${encodeURIComponent(payload)}`;
}

async function resolveOwnerActiveHome(telegramUserId: string) {
  const user = await prisma.user.findUnique({ where: { telegramId: telegramUserId } });
  if (!user?.activeHomeId) return null;
  const member = await prisma.homeMember.findUnique({
    where: { homeId_userId: { homeId: user.activeHomeId, userId: user.id } },
    include: { home: true }
  });
  if (!member || member.role !== "OWNER") return null;
  return { user, home: member.home };
}

function setupBot(bot: Telegraf) {
  bot.start(async (ctx) => {
    await ctx.reply("FamilyPulse готов. Откройте Mini App:", {
      reply_markup: {
        inline_keyboard: [[{ text: "📋 Открыть FamilyPulse", web_app: { url: config.miniAppUrl } }]]
      }
    });
  });

  bot.command("app", async (ctx) => {
    await ctx.reply("Открыть FamilyPulse:", {
      reply_markup: {
        inline_keyboard: [[{ text: "📋 Открыть FamilyPulse", web_app: { url: config.miniAppUrl } }]]
      }
    });
  });

  bot.command("help", async (ctx) => {
    await ctx.reply("/start /invite /link /digest /help");
  });

  bot.command("invite", async (ctx) => {
    const owner = await resolveOwnerActiveHome(String(ctx.from?.id ?? ""));
    if (!owner) {
      await ctx.reply("Только owner с активным домом может создавать invite.");
      return;
    }
    const code = Math.random().toString(36).slice(2, 10).toUpperCase();
    await prisma.invite.create({
      data: {
        code,
        homeId: owner.home.id,
        createdById: owner.user.id
      }
    });
    const joinText = `Код приглашения: ${code}\nИли откройте: ${miniAppDirectUrl(`invite_${code}`)}`;
    await ctx.reply(
      joinText,
      Markup.inlineKeyboard([Markup.button.url("Open FamilyPulse", miniAppDirectUrl(`invite_${code}`))])
    );
  });

  bot.command("link", async (ctx) => {
    if (ctx.chat?.type === "private") {
      await ctx.reply("Команду /link используйте в семейной группе.");
      return;
    }
    const owner = await resolveOwnerActiveHome(String(ctx.from?.id ?? ""));
    if (!owner) {
      await ctx.reply("Только owner с активным домом может привязать группу.");
      return;
    }
    const chatId = String(ctx.chat?.id ?? "");
    await prisma.chatLink.upsert({
      where: { homeId_telegramChatId: { homeId: owner.home.id, telegramChatId: chatId } },
      create: {
        homeId: owner.home.id,
        telegramChatId: chatId,
        enabled: true
      },
      update: { enabled: true }
    });
    await ctx.reply(`Чат привязан к дому "${owner.home.name}".`);
  });

  bot.command("digest", async (ctx) => {
    const owner = await resolveOwnerActiveHome(String(ctx.from?.id ?? ""));
    if (!owner) {
      await ctx.reply("Только owner с активным домом.");
      return;
    }
    const links = await prisma.chatLink.findMany({ where: { homeId: owner.home.id, enabled: true } });
    const text = await buildDigestText(owner.home.id, owner.home.timezone);
    if (!links.length) {
      await ctx.reply("Нет привязанных групп. Используйте /link в группе.");
      return;
    }
    for (const link of links) {
      await bot.telegram.sendMessage(link.telegramChatId, text);
    }
    await ctx.reply("Дайджест отправлен.");
  });

  bot.action(/checkin:(.+):(.+)/, async (ctx) => {
    const homeId = ctx.match[1];
    const dateYmd = ctx.match[2];
    const telegramId = String(ctx.from.id);
    const user = await prisma.user.findUnique({ where: { telegramId } });
    if (!user) {
      await ctx.answerCbQuery("Авторизуйтесь в Mini App", { show_alert: true });
      return;
    }
    const membership = await prisma.homeMember.findUnique({
      where: { homeId_userId: { homeId, userId: user.id } }
    });
    if (!membership) {
      await ctx.answerCbQuery("Вы не состоите в этом доме", { show_alert: true });
      return;
    }

    const date = new Date(`${dateYmd}T00:00:00.000Z`);
    try {
      await prisma.streak.create({
        data: { homeId, date, closedById: user.id }
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        await ctx.answerCbQuery("День уже закрыт");
        return;
      }
      throw error;
    }
    await awardPointsIdempotent({
      homeId,
      userId: user.id,
      sourceType: SourceType.CHECKIN,
      sourceId: dateYmd,
      points: 2
    });
    await ctx.answerCbQuery("День закрыт ✅");
  });
}

export function startBot() {
  if (botInstance) {
    return botInstance;
  }
  if (!config.telegramBotToken) {
    throw new Error("TELEGRAM_BOT_TOKEN is required when ENABLE_BOT=true");
  }
  if (!config.telegramBotUsername) {
    throw new Error("TELEGRAM_BOT_USERNAME is required when ENABLE_BOT=true");
  }
  const bot = new Telegraf(config.telegramBotToken);
  setupBot(bot);
  bot.launch();
  botInstance = bot;
  return bot;
}

export function stopBot() {
  if (!botInstance) {
    return;
  }
  botInstance.stop("SIGTERM");
  botInstance = null;
}

export function getBot() {
  return botInstance;
}

export function checkinKeyboard(homeId: string, dateYmd: string) {
  return Markup.inlineKeyboard([Markup.button.callback("Закрыть день ✅", `checkin:${homeId}:${dateYmd}`)]);
}
