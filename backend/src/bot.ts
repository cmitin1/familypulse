import { Markup, Telegraf } from "telegraf";
import { AiSuggestionStatus, Prisma, SourceType } from "@prisma/client";
import { config } from "./config.js";
import { prisma } from "./db.js";
import { awardPointsIdempotent, buildDigestText, localDateStart } from "./services.js";
import { buildDigestBotText, buildTodayBotText } from "./modules/ai/services/ai-bot-text.service.js";
import { ensureAiChatConnection, persistTelegramIncomingMessage } from "./modules/ai/services/telegram-ingestion.service.js";

let botInstance: Telegraf | null = null;

const TELEGRAM_COMMANDS = [
  { command: "start", description: "Запуск бота и ссылка на Mini App" },
  { command: "app", description: "Открыть FamilyPulse Mini App" },
  { command: "help", description: "Список доступных команд" },
  { command: "invite", description: "Создать инвайт в дом (owner)" },
  { command: "link", description: "Привязать текущую группу к дому" },
  { command: "ai_on", description: "Включить AI-анализ чата (owner)" },
  { command: "ai_off", description: "Выключить AI-анализ чата (owner)" },
  { command: "today", description: "Сводка на сегодня" },
  { command: "digest", description: "Краткая сводка за 24 часа" },
  { command: "ai_tasks", description: "Показать AI-кандидаты (owner)" }
];

async function registerTelegramCommands(bot: Telegraf) {
  try {
    await bot.telegram.setMyCommands(TELEGRAM_COMMANDS, { scope: { type: "all_private_chats" } });
    console.info("[BOT] Команды зарегистрированы для private chats");
  } catch (error) {
    console.error("[BOT] Ошибка регистрации команд для private chats", error instanceof Error ? error.message : error);
  }

  try {
    await bot.telegram.setMyCommands(TELEGRAM_COMMANDS, { scope: { type: "all_group_chats" } });
    console.info("[BOT] Команды зарегистрированы для group chats");
  } catch (error) {
    console.error("[BOT] Ошибка регистрации команд для group chats", error instanceof Error ? error.message : error);
  }
}

async function safeReply(ctx: any, text: string, extra?: any) {
  try {
    await ctx.reply(text, extra);
  } catch (error) {
    console.error("[BOT] Failed to send reply", {
      chatId: ctx.chat?.id,
      chatType: ctx.chat?.type,
      error: error instanceof Error ? error.message : error
    });
  }
}

async function replyMiniAppAware(ctx: any, text: string) {
  const isPrivate = ctx.chat?.type === "private";
  if (isPrivate) {
    await safeReply(ctx, text, {
      reply_markup: {
        inline_keyboard: [[{ text: "📋 Открыть FamilyPulse", web_app: { url: config.miniAppUrl } }]]
      }
    });
    return;
  }

  // In group chats Telegram may reject web_app buttons with BUTTON_TYPE_INVALID.
  // Send a safe fallback that doesn't use web_app.
  const fallback = [
    text,
    "",
    "Откройте бота в личном чате и используйте /app, чтобы запустить Mini App."
  ].join("\n");
  await safeReply(ctx, fallback);
}

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

async function resolveActiveHomeMember(telegramUserId: string) {
  const user = await prisma.user.findUnique({ where: { telegramId: telegramUserId } });
  if (!user?.activeHomeId) return null;
  const member = await prisma.homeMember.findUnique({
    where: { homeId_userId: { homeId: user.activeHomeId, userId: user.id } },
    include: { home: true }
  });
  if (!member) return null;
  return { user, home: member.home, role: member.role };
}

async function ensureChatAccess(homeId: string, chatId: string, chatType: string | undefined) {
  if (chatType === "private") {
    return true;
  }
  const link = await prisma.chatLink.findUnique({
    where: { homeId_telegramChatId: { homeId, telegramChatId: chatId } },
    select: { id: true, enabled: true }
  });
  return Boolean(link?.enabled);
}

function setupBot(bot: Telegraf) {
  bot.catch((error, ctx) => {
    console.error("[BOT] Update handling error", {
      chatId: ctx.chat?.id,
      chatType: ctx.chat?.type,
      updateType: ctx.updateType,
      error: error instanceof Error ? error.message : error
    });
  });

  bot.use(async (ctx, next) => {
    try {
      if ("message" in ctx.update) {
        await persistTelegramIncomingMessage((ctx.update as any).message);
      }
    } catch (error) {
      console.error("[AI] Telegram message ingest failed", error instanceof Error ? error.message : error);
    }
    await next();
  });

  bot.start(async (ctx) => {
    await replyMiniAppAware(ctx, "FamilyPulse готов. Откройте Mini App:");
  });

  bot.command("app", async (ctx) => {
    await replyMiniAppAware(ctx, "Открыть FamilyPulse:");
  });

  bot.command("help", async (ctx) => {
    await ctx.reply("/start /invite /link /ai_on /ai_off /today /digest /ai_tasks /help");
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
    const linkedToAnotherHome = await prisma.chatLink.findFirst({
      where: {
        telegramChatId: chatId,
        homeId: { not: owner.home.id }
      },
      select: { homeId: true }
    });
    if (linkedToAnotherHome) {
      await ctx.reply("Этот чат уже привязан к другому дому. Сначала отвяжите его там.");
      return;
    }
    await prisma.chatLink.upsert({
      where: { homeId_telegramChatId: { homeId: owner.home.id, telegramChatId: chatId } },
      create: {
        homeId: owner.home.id,
        telegramChatId: chatId,
        enabled: true
      },
      update: { enabled: true }
    });
    await ensureAiChatConnection({
      homeId: owner.home.id,
      telegramChatId: chatId,
      chatTitle: "title" in (ctx.chat ?? {}) ? (ctx.chat as any).title ?? null : null,
      enabled: false
    });
    await ctx.reply(`Чат привязан к дому "${owner.home.name}". AI-анализ выключен по умолчанию. Включите его командой /ai_on.`);
  });

  bot.command("ai_on", async (ctx) => {
    if (ctx.chat?.type === "private") {
      await ctx.reply("Команду /ai_on используйте в семейной группе.");
      return;
    }
    const owner = await resolveOwnerActiveHome(String(ctx.from?.id ?? ""));
    if (!owner) {
      await ctx.reply("Только owner с активным домом может включить AI-анализ.");
      return;
    }
    const chatId = String(ctx.chat?.id ?? "");
    const link = await prisma.chatLink.findUnique({
      where: { homeId_telegramChatId: { homeId: owner.home.id, telegramChatId: chatId } },
      select: { id: true, enabled: true }
    });
    if (!link?.enabled) {
      await ctx.reply("Сначала привяжите этот чат к дому командой /link.");
      return;
    }
    await ensureAiChatConnection({
      homeId: owner.home.id,
      telegramChatId: chatId,
      chatTitle: "title" in (ctx.chat ?? {}) ? (ctx.chat as any).title ?? null : null,
      enabled: true
    });
    await ctx.reply("AI-анализ чата включен ✅");
  });

  bot.command("ai_off", async (ctx) => {
    if (ctx.chat?.type === "private") {
      await ctx.reply("Команду /ai_off используйте в семейной группе.");
      return;
    }
    const owner = await resolveOwnerActiveHome(String(ctx.from?.id ?? ""));
    if (!owner) {
      await ctx.reply("Только owner с активным домом может выключить AI-анализ.");
      return;
    }
    const chatId = String(ctx.chat?.id ?? "");
    const link = await prisma.chatLink.findUnique({
      where: { homeId_telegramChatId: { homeId: owner.home.id, telegramChatId: chatId } },
      select: { id: true, enabled: true }
    });
    if (!link?.enabled) {
      await ctx.reply("Этот чат не привязан к текущему дому.");
      return;
    }
    await ensureAiChatConnection({
      homeId: owner.home.id,
      telegramChatId: chatId,
      chatTitle: "title" in (ctx.chat ?? {}) ? (ctx.chat as any).title ?? null : null,
      enabled: false
    });
    await ctx.reply("AI-анализ чата выключен ⏸️");
  });

  bot.command("today", async (ctx) => {
    const member = await resolveActiveHomeMember(String(ctx.from?.id ?? ""));
    if (!member) {
      await ctx.reply("Нужен активный дом в FamilyPulse.");
      return;
    }
    const chatId = String(ctx.chat?.id ?? "");
    const allowed = await ensureChatAccess(member.home.id, chatId, ctx.chat?.type);
    if (!allowed) {
      await ctx.reply("Команда доступна только в личном чате с ботом или в привязанной семейной группе.");
      return;
    }
    if (!config.aiFeatureEnabled) {
      const classic = await buildDigestText(member.home.id, member.home.timezone);
      await ctx.reply(`${classic}\n\nAI-модуль отключен.`);
      return;
    }
    const text = await buildTodayBotText(member.home.id, member.home.timezone);
    await ctx.reply(text);
  });

  bot.command("digest", async (ctx) => {
    const member = await resolveActiveHomeMember(String(ctx.from?.id ?? ""));
    if (!member) {
      await ctx.reply("Нужен активный дом в FamilyPulse.");
      return;
    }
    const chatId = String(ctx.chat?.id ?? "");
    const allowed = await ensureChatAccess(member.home.id, chatId, ctx.chat?.type);
    if (!allowed) {
      await ctx.reply("Команда доступна только в личном чате с ботом или в привязанной семейной группе.");
      return;
    }
    const text = config.aiFeatureEnabled
      ? await buildDigestBotText(member.home.id, member.home.timezone)
      : `${await buildDigestText(member.home.id, member.home.timezone)}\n\nAI-модуль отключен.`;
    await ctx.reply(text);
  });

  bot.command("ai_tasks", async (ctx) => {
    const owner = await resolveOwnerActiveHome(String(ctx.from?.id ?? ""));
    if (!owner) {
      await ctx.reply("Только owner с активным домом.");
      return;
    }
    const chatId = String(ctx.chat?.id ?? "");
    const allowed = await ensureChatAccess(owner.home.id, chatId, ctx.chat?.type);
    if (!allowed) {
      await ctx.reply("Команда доступна только в личном чате с ботом или в привязанной семейной группе.");
      return;
    }
    if (!config.aiFeatureEnabled) {
      await ctx.reply("AI-модуль отключен.");
      return;
    }
    const rows = await prisma.aiSuggestion.findMany({
      where: { homeId: owner.home.id, status: AiSuggestionStatus.PENDING },
      orderBy: { createdAt: "desc" },
      take: 10
    });
    if (!rows.length) {
      await ctx.reply("AI Inbox пуст: pending-кандидатов нет.");
      return;
    }
    const text = rows.map((item, idx) => `${idx + 1}. [${item.type.toLowerCase()}] ${item.title}`).join("\n");
    await ctx.reply(`AI Inbox (pending):\n${text}`);
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
      where: { homeId_userId: { homeId, userId: user.id } },
      include: { home: { select: { timezone: true } } }
    });
    if (!membership) {
      await ctx.answerCbQuery("Вы не состоите в этом доме", { show_alert: true });
      return;
    }

    const date = localDateStart(dateYmd, membership.home.timezone);
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
  void registerTelegramCommands(bot);
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
