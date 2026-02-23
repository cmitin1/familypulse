import { Prisma } from "@prisma/client";
import { prisma } from "../../../db.js";

type TelegramMessageLike = {
  message_id?: number;
  date?: number;
  text?: string;
  caption?: string;
  from?: {
    id?: number | string;
    first_name?: string;
    last_name?: string;
    username?: string;
  };
  chat?: {
    id?: number | string;
    title?: string;
  };
  reply_to_message?: {
    message_id?: number;
  };
};

function detectRawType(msg: any): string {
  if (msg?.text) return "text";
  if (msg?.photo) return "photo";
  if (msg?.document) return "document";
  if (msg?.voice) return "voice";
  if (msg?.video) return "video";
  if (msg?.sticker) return "sticker";
  return "unknown";
}

function senderName(msg: TelegramMessageLike): string | null {
  const first = msg.from?.first_name?.trim() ?? "";
  const last = msg.from?.last_name?.trim() ?? "";
  const full = `${first} ${last}`.trim();
  return full || null;
}

export async function persistTelegramIncomingMessage(rawMessage: unknown) {
  const msg = rawMessage as TelegramMessageLike;
  const telegramChatId = String(msg.chat?.id ?? "");
  const telegramMessageId = Number(msg.message_id ?? 0);
  if (!telegramChatId || !telegramMessageId) {
    return { ok: false as const, reason: "missing_ids" as const };
  }

  try {
    await prisma.telegramMessage.create({
      data: {
        telegramChatId,
        telegramMessageId,
        telegramUserId: msg.from?.id !== undefined ? String(msg.from.id) : null,
        senderName: senderName(msg),
        username: msg.from?.username ?? null,
        text: msg.text ?? msg.caption ?? null,
        rawType: detectRawType(msg),
        sentAt: msg.date ? new Date(msg.date * 1000) : new Date(),
        replyToTelegramMessageId: msg.reply_to_message?.message_id ?? null,
        rawJson: rawMessage as Prisma.JsonObject
      }
    });
    return { ok: true as const };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { ok: true as const, dedup: true as const };
    }
    throw error;
  }
}

export async function ensureAiChatConnection(input: {
  homeId: string;
  telegramChatId: string;
  chatTitle?: string | null;
  enabled?: boolean;
}) {
  await prisma.aiChatConnection.upsert({
    where: {
      homeId_telegramChatId: {
        homeId: input.homeId,
        telegramChatId: input.telegramChatId
      }
    },
    create: {
      homeId: input.homeId,
      telegramChatId: input.telegramChatId,
      chatTitle: input.chatTitle ?? null,
      isEnabled: input.enabled ?? false
    },
    update: {
      chatTitle: input.chatTitle ?? undefined,
      ...(input.enabled !== undefined ? { isEnabled: input.enabled } : {})
    }
  });
}
