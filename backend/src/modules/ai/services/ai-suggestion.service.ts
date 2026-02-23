import { AiAssigneeMode, AiSuggestionStatus, AiSuggestionType, type Prisma } from "@prisma/client";
import { prisma } from "../../../db.js";
import type { ExtractionSuggestion } from "../schemas/extraction.schema.js";

type HomeMemberLite = {
  userId: string;
  user: {
    firstName: string | null;
    username: string | null;
  };
};

function toSuggestionType(input: string): AiSuggestionType {
  if (input === "event") return AiSuggestionType.EVENT;
  if (input === "question") return AiSuggestionType.QUESTION;
  return AiSuggestionType.TASK;
}

function toAssigneeMode(input: string): AiAssigneeMode {
  if (input === "single") return AiAssigneeMode.SINGLE;
  if (input === "all") return AiAssigneeMode.ALL;
  return AiAssigneeMode.UNASSIGNED;
}

function parseDateLoose(value?: string | null): Date | null {
  if (!value) return null;
  const normalized = value.trim();
  if (!normalized) return null;
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function makeDedupKey(chatId: string, suggestion: ExtractionSuggestion): string {
  const normTitle = suggestion.title.trim().toLowerCase();
  const type = suggestion.type.toLowerCase();
  const sourceFingerprint = [...suggestion.sourceMessageIds].sort((a, b) => a - b).join(",");
  const timeFingerprint = [suggestion.time.dueAtText ?? "", suggestion.time.startAtText ?? "", suggestion.time.endAtText ?? ""]
    .join("|")
    .trim()
    .toLowerCase();
  return `${chatId}:${type}:${normTitle}:${sourceFingerprint}:${timeFingerprint}`.slice(0, 255);
}

function resolveAssigneeUserIds(hints: string[], members: HomeMemberLite[]): string[] {
  if (!hints.length) return [];
  const normalizedHints = hints.map((h) => h.trim().toLowerCase()).filter(Boolean);
  if (!normalizedHints.length) return [];
  const matched = new Set<string>();
  for (const member of members) {
    const name = member.user.firstName?.toLowerCase() ?? "";
    const username = member.user.username?.toLowerCase() ?? "";
    for (const hint of normalizedHints) {
      if ((name && name.includes(hint)) || (username && username.includes(hint))) {
        matched.add(member.userId);
      }
    }
  }
  return [...matched];
}

export class AiSuggestionService {
  async saveFromExtraction(input: {
    homeId: string;
    sourceChatId: string;
    extractionRunId: string;
    suggestions: ExtractionSuggestion[];
    allowedMessageIds?: number[];
  }) {
    const allowedMessageIds = new Set(input.allowedMessageIds ?? []);
    const members = await prisma.homeMember.findMany({
      where: { homeId: input.homeId },
      select: {
        userId: true,
        user: { select: { firstName: true, username: true } }
      }
    });

    let created = 0;
    for (const item of input.suggestions) {
      const dedupKey = makeDedupKey(input.sourceChatId, item);
      const exists = await prisma.aiSuggestion.findFirst({
        where: {
          homeId: input.homeId,
          dedupKey,
          createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
        },
        select: { id: true }
      });
      if (exists) {
        continue;
      }

      const assigneeIds = resolveAssigneeUserIds(item.assignee.userHints, members);
      const assigneeMode = toAssigneeMode(item.assignee.mode);
      const dueAt = parseDateLoose(item.time.dueAtText);
      const startAt = parseDateLoose(item.time.startAtText);
      const endAt = parseDateLoose(item.time.endAtText);

      const descriptionParts = [item.description ?? null];
      if (!dueAt && item.time.dueAtText) {
        descriptionParts.push(`Срок: ${item.time.dueAtText}`);
      }
      if (!startAt && item.time.startAtText) {
        descriptionParts.push(`Начало: ${item.time.startAtText}`);
      }
      if (!endAt && item.time.endAtText) {
        descriptionParts.push(`Окончание: ${item.time.endAtText}`);
      }
      const description = descriptionParts.filter(Boolean).join("\n");

      const sourceMessageIds =
        item.sourceMessageIds.length > 0
          ? item.sourceMessageIds.filter((id) => allowedMessageIds.size === 0 || allowedMessageIds.has(id))
          : [];
      if (allowedMessageIds.size > 0 && sourceMessageIds.length === 0) {
        continue;
      }

      await prisma.aiSuggestion.create({
        data: {
          homeId: input.homeId,
          sourceChatId: input.sourceChatId,
          type: toSuggestionType(item.type),
          title: item.title,
          description: description || null,
          status: AiSuggestionStatus.PENDING,
          confidence: item.confidence ?? null,
          proposedAssigneeMode: assigneeMode,
          proposedAssigneeUserIds: assigneeIds.length ? assigneeIds : null,
          proposedDueAt: dueAt,
          proposedStartAt: startAt,
          proposedEndAt: endAt,
          sourceMessageRefs: sourceMessageIds.map((telegramMessageId) => ({
            telegramChatId: input.sourceChatId,
            telegramMessageId
          })),
          dedupKey,
          aiExtractionRunId: input.extractionRunId
        }
      });
      created += 1;
    }
    return { created };
  }

  async list(homeId: string, filter: {
    status?: AiSuggestionStatus;
    type?: AiSuggestionType;
    limit: number;
    cursor?: string;
  }) {
    const where: Prisma.AiSuggestionWhereInput = {
      homeId,
      ...(filter.status ? { status: filter.status } : {}),
      ...(filter.type ? { type: filter.type } : {})
    };
    const rows = await prisma.aiSuggestion.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: filter.limit,
      ...(filter.cursor ? { skip: 1, cursor: { id: filter.cursor } } : {})
    });
    const nextCursor = rows.length === filter.limit ? rows[rows.length - 1]?.id ?? null : null;
    return { rows, nextCursor };
  }

  async setStatus(input: {
    homeId: string;
    suggestionId: string;
    status: AiSuggestionStatus;
    approvedByUserId?: string;
  }) {
    const existing = await prisma.aiSuggestion.findFirst({
      where: { id: input.suggestionId, homeId: input.homeId }
    });
    if (!existing) {
      return null;
    }
    const updated = await prisma.aiSuggestion.update({
      where: { id: existing.id },
      data: {
        status: input.status,
        ...(input.status === AiSuggestionStatus.APPROVED
          ? { approvedByUserId: input.approvedByUserId ?? null }
          : {})
      }
    });
    return updated;
  }
}
