import { AiSuggestionStatus } from "@prisma/client";
import { formatInTimeZone } from "date-fns-tz";
import { config } from "../../../config.js";
import { prisma } from "../../../db.js";
import { ensureTodayRoutineInstances, localDateEnd, localDateStart } from "../../../services.js";
import { OpenRouterService } from "./openrouter.service.js";

type DigestMode = "morning" | "on_demand" | "today";

type DigestTaskItem = {
  title: string;
  status: "OPEN" | "DONE";
  dueDate: Date | null;
  assigneeNames: string[];
};

export type DigestContextV2 = {
  home: { name: string; timezone: string };
  digestMode: DigestMode;
  localNow: string;
  dateLabel: string;
  tasks: {
    openToday: number;
    doneToday: number;
    overdue: number;
    dueSoon: number;
    perAssignee: Array<{ name: string; open: number; dueToday: number; overdue: number }>;
    topFocus: Array<{ title: string; reason: string; dueLabel: string; assignees: string[] }>;
  };
  routines: { openToday: number; doneToday: number };
  events: { today: string[]; upcoming: string[] };
  chat: {
    discussionHighlights: string[];
    suggestionsPending: number;
    suggestionsApproved: number;
    suggestionsRejected: number;
    topPendingSuggestions: Array<{ type: string; title: string }>;
    lastRunAt: string | null;
    freshRun: boolean;
    recentErrors: number;
  };
  nextSteps: string[];
};

function normalizeTitle(value: string): string {
  return value.toLowerCase().replace(/[^a-zA-Zа-яА-Я0-9\s]/g, "").replace(/\s+/g, " ").trim();
}

export function scoreTaskForDigest(input: {
  task: DigestTaskItem;
  nowStart: Date;
  todayEnd: Date;
  dueSoonEnd: Date;
  recentSuggestionTitles: string[];
}): { score: number; reason: string; dueLabel: string } {
  const task = input.task;
  if (task.status === "DONE") {
    return { score: -1000, reason: "уже выполнено", dueLabel: "выполнено" };
  }

  let score = 0;
  let reason = "важная задача";
  let dueLabel = "без срока";

  if (task.dueDate) {
    if (task.dueDate < input.nowStart) {
      score += 120;
      reason = "просрочено";
      dueLabel = "просрочено";
    } else if (task.dueDate <= input.todayEnd) {
      score += 90;
      reason = "дедлайн сегодня";
      dueLabel = "сегодня";
    } else if (task.dueDate <= input.dueSoonEnd) {
      score += 60;
      reason = "дедлайн скоро";
      dueLabel = "скоро";
    } else {
      score += 20;
      dueLabel = "позже";
    }
  } else {
    score += 10;
  }

  const normalized = normalizeTitle(task.title);
  const discussed = input.recentSuggestionTitles.some((title) => title.includes(normalized) || normalized.includes(title));
  if (discussed) {
    score += 35;
    reason = reason === "важная задача" ? "обсуждали в чате" : `${reason}, обсуждали в чате`;
  }
  if (task.assigneeNames.length === 0 || task.assigneeNames.length > 1) {
    score += 8;
  }

  return { score, reason, dueLabel };
}

export function pickTopFocusTasks(input: {
  tasks: DigestTaskItem[];
  nowStart: Date;
  todayEnd: Date;
  dueSoonEnd: Date;
  recentSuggestionTitles: string[];
}): Array<{ title: string; reason: string; dueLabel: string; assignees: string[] }> {
  const ranked = input.tasks
    .map((task) => {
      const rank = scoreTaskForDigest({
        task,
        nowStart: input.nowStart,
        todayEnd: input.todayEnd,
        dueSoonEnd: input.dueSoonEnd,
        recentSuggestionTitles: input.recentSuggestionTitles
      });
      return { task, ...rank };
    })
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score);

  const picked: Array<{ title: string; reason: string; dueLabel: string; assignees: string[] }> = [];
  const seen = new Set<string>();
  for (const row of ranked) {
    const key = normalizeTitle(row.task.title);
    if (!key || seen.has(key)) continue;
    picked.push({
      title: row.task.title,
      reason: row.reason,
      dueLabel: row.dueLabel,
      assignees: row.task.assigneeNames
    });
    seen.add(key);
    if (picked.length >= 3) break;
  }
  return picked;
}

export function buildDeterministicDigestText(context: DigestContextV2): string {
  const focusLine = context.tasks.topFocus[0]
    ? `${context.tasks.topFocus[0].title} (${context.tasks.topFocus[0].reason})`
    : "критичных пунктов не найдено, держим ритм по плану дня";

  const topSection =
    context.tasks.topFocus.length > 0
      ? context.tasks.topFocus
          .map((item, idx) => `${idx + 1}. ${item.title} — ${item.reason}${item.assignees.length ? ` (${item.assignees.join(", ")})` : ""}`)
          .join("\n")
      : "1. Срочных задач нет. Проверьте AI Inbox и выберите, что подтвердить.";

  const assigneeSection =
    context.tasks.perAssignee.length > 0
      ? context.tasks.perAssignee
          .slice(0, 4)
          .map((row) => `• ${row.name}: открыто ${row.open}, на сегодня ${row.dueToday}, просрочено ${row.overdue}`)
          .join("\n")
      : "• Пока без назначений.";

  const chatSection =
    context.chat.discussionHighlights.length > 0
      ? context.chat.discussionHighlights.slice(0, 3).map((line) => `• ${line}`).join("\n")
      : "• Чат был спокойный, новых значимых тем не выделено.";

  const aiSuggestionsSection =
    context.chat.topPendingSuggestions.length > 0
      ? context.chat.topPendingSuggestions.map((item) => `• ${item.type.toLowerCase()}: ${item.title}`).join("\n")
      : "• Новых AI-кандидатов нет.";

  return [
    `FamilyPulse — дайджест (${context.dateLabel})`,
    context.home.name,
    "",
    `Сегодня в фокусе: ${focusLine}.`,
    "",
    "Главное на сегодня (Top 3):",
    topSection,
    "",
    "По времени:",
    `• Сегодня: открыто ${context.tasks.openToday}, выполнено ${context.tasks.doneToday}`,
    `• Скоро: ${context.tasks.dueSoon}`,
    `• Просрочено: ${context.tasks.overdue}`,
    "",
    "Кому что:",
    assigneeSection,
    "",
    "Что обсудили в чате:",
    chatSection,
    "",
    "AI-предложения:",
    `• Pending: ${context.chat.suggestionsPending}, approved: ${context.chat.suggestionsApproved}, rejected: ${context.chat.suggestionsRejected}`,
    aiSuggestionsSection,
    "",
    "Следующий шаг:",
    context.nextSteps.map((step) => `• ${step}`).join("\n")
  ].join("\n");
}

const DIGEST_V2_SYSTEM_PROMPT = `Ты помощник FamilyPulse. На вход тебе дают JSON-контекст с фактами.
Задача: превратить его в полезный, краткий и дружелюбный дайджест на русском для Telegram.
Правила:
- Используй только данные из JSON, не выдумывай факты.
- Не показывай внутренние ID и технические поля.
- Соблюдай структуру: заголовок, фокус, Top 3, сроки, кому что, чат, AI-предложения, следующий шаг.
- Если данных мало, честно скажи и дай полезный next step.
- Максимум ~1200 символов.
- Форматируй списками и короткими абзацами.
- Не дублируй одинаковые пункты.`;

async function formatDigestWithLlm(context: DigestContextV2, openRouterService: OpenRouterService): Promise<string> {
  const userPrompt = JSON.stringify(context);
  const response = await openRouterService.chatCompletion({
    model: config.openrouterModelSummary,
    systemPrompt: DIGEST_V2_SYSTEM_PROMPT,
    userPrompt,
    responseMode: "text",
    timeoutMs: 18_000
  });
  return response.content.trim();
}

export async function applyLlmFormattingWithFallback(input: {
  context: DigestContextV2;
  fallbackText: string;
  enabled: boolean;
  formatter: (context: DigestContextV2) => Promise<string>;
  onError?: (error: unknown) => void;
}): Promise<{ text: string; usedLlm: boolean }> {
  if (!input.enabled) {
    return { text: input.fallbackText, usedLlm: false };
  }
  try {
    const llmText = await input.formatter(input.context);
    if (!llmText || llmText.length < 20) {
      throw new Error("LLM digest response is too short");
    }
    return { text: llmText, usedLlm: true };
  } catch (error) {
    input.onError?.(error);
    return { text: input.fallbackText, usedLlm: false };
  }
}

export class DigestV2Service {
  constructor(private readonly openRouterService = new OpenRouterService()) {}

  private async buildContext(homeId: string, mode: DigestMode, hours: number): Promise<DigestContextV2> {
    const home = await prisma.home.findUnique({
      where: { id: homeId },
      select: { id: true, name: true, timezone: true, members: { include: { user: true } } }
    });
    if (!home) {
      throw new Error("Home not found");
    }

    const now = new Date();
    const localDate = formatInTimeZone(now, home.timezone, "yyyy-MM-dd");
    const localNow = formatInTimeZone(now, home.timezone, "yyyy-MM-dd HH:mm");
    const dayStart = localDateStart(localDate, home.timezone);
    const dayEnd = localDateEnd(localDate, home.timezone);
    const dueSoonEnd = new Date(dayEnd.getTime() + 3 * 24 * 60 * 60 * 1000);
    const since = new Date(now.getTime() - Math.min(Math.max(hours, 1), 168) * 60 * 60 * 1000);

    await ensureTodayRoutineInstances(homeId, localDate);

    const [tasks, routines, eventsToday, eventsUpcoming, aiSuggestionsWindow, lastRun, recentRunErrors] = await Promise.all([
      prisma.task.findMany({
        where: { homeId },
        include: {
          assignee: { select: { firstName: true, username: true } },
          assignees: { include: { user: { select: { firstName: true, username: true } } } }
        },
        orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
        take: 120
      }),
      prisma.routineInstance.findMany({
        where: { homeId, date: { gte: dayStart, lte: dayEnd } },
        select: { isDone: true }
      }),
      prisma.event.findMany({
        where: { homeId, AND: [{ startAt: { lte: dayEnd } }, { endAt: { gte: dayStart } }] },
        orderBy: { startAt: "asc" },
        take: 6
      }),
      prisma.event.findMany({
        where: { homeId, startAt: { gt: dayEnd, lte: dueSoonEnd } },
        orderBy: { startAt: "asc" },
        take: 6
      }),
      prisma.aiSuggestion.findMany({
        where: { homeId, createdAt: { gte: since } },
        orderBy: { createdAt: "desc" },
        take: 120
      }),
      prisma.aiExtractionRun.findFirst({
        where: { homeId, status: "SUCCESS", createdAt: { gte: since } },
        orderBy: { createdAt: "desc" }
      }),
      prisma.aiExtractionRun.count({
        where: { homeId, status: "ERROR", createdAt: { gte: since } }
      })
    ]);

    const recentSuggestionTitles = aiSuggestionsWindow
      .filter((s) => s.status === "PENDING")
      .slice(0, 20)
      .map((s) => normalizeTitle(s.title))
      .filter(Boolean);

    const digestTasks: DigestTaskItem[] = tasks.map((task) => {
      const assigneeNames = [
        ...(task.assignee ? [task.assignee] : []),
        ...task.assignees.map((a) => a.user)
      ]
        .map((u) => u.firstName || u.username || "")
        .filter(Boolean);
      return {
        title: task.title,
        status: task.status,
        dueDate: task.dueDate,
        assigneeNames: [...new Set(assigneeNames)]
      };
    });

    const topFocus = pickTopFocusTasks({
      tasks: digestTasks,
      nowStart: dayStart,
      todayEnd: dayEnd,
      dueSoonEnd,
      recentSuggestionTitles
    });

    const openToday = tasks.filter((task) => task.status === "OPEN" && (!task.dueDate || task.dueDate <= dayEnd)).length;
    const doneToday = tasks.filter((task) => task.status === "DONE" && task.doneAt && task.doneAt >= dayStart && task.doneAt <= dayEnd).length;
    const overdue = tasks.filter((task) => task.status === "OPEN" && task.dueDate && task.dueDate < dayStart).length;
    const dueSoon = tasks.filter((task) => task.status === "OPEN" && task.dueDate && task.dueDate > dayEnd && task.dueDate <= dueSoonEnd).length;

    const perAssignee = home.members
      .map((member) => {
        const name = member.user.firstName || member.user.username || "Участник";
        const mine = tasks.filter(
          (task) =>
            task.assigneeId === member.userId ||
            task.assignees.some((assignee) => assignee.userId === member.userId)
        );
        return {
          name,
          open: mine.filter((task) => task.status === "OPEN").length,
          dueToday: mine.filter((task) => task.status === "OPEN" && task.dueDate && task.dueDate <= dayEnd).length,
          overdue: mine.filter((task) => task.status === "OPEN" && task.dueDate && task.dueDate < dayStart).length
        };
      })
      .filter((row) => row.open > 0 || row.dueToday > 0 || row.overdue > 0)
      .sort((a, b) => b.overdue - a.overdue || b.dueToday - a.dueToday || b.open - a.open);

    const discussionHighlights: string[] = [];
    const extractedSummary = (lastRun?.rawResponse as any)?.extraction?.summary;
    if (typeof extractedSummary === "string" && extractedSummary.trim()) {
      discussionHighlights.push(extractedSummary.trim());
    }
    const pendingSuggestions = aiSuggestionsWindow.filter((s) => s.status === "PENDING");
    if (pendingSuggestions.length > 0) {
      discussionHighlights.push(`AI заметил ${pendingSuggestions.length} потенциальных пункта, требующих решения.`);
    }

    const context: DigestContextV2 = {
      home: { name: home.name, timezone: home.timezone },
      digestMode: mode,
      localNow,
      dateLabel: formatInTimeZone(now, home.timezone, "EEE, dd MMM"),
      tasks: {
        openToday,
        doneToday,
        overdue,
        dueSoon,
        perAssignee,
        topFocus
      },
      routines: {
        openToday: routines.filter((row) => !row.isDone).length,
        doneToday: routines.filter((row) => row.isDone).length
      },
      events: {
        today: eventsToday.map((event) => event.title),
        upcoming: eventsUpcoming.map((event) => event.title)
      },
      chat: {
        discussionHighlights,
        suggestionsPending: aiSuggestionsWindow.filter((s) => s.status === "PENDING").length,
        suggestionsApproved: aiSuggestionsWindow.filter((s) => s.status === "APPROVED").length,
        suggestionsRejected: aiSuggestionsWindow.filter((s) => s.status === "REJECTED").length,
        topPendingSuggestions: pendingSuggestions.slice(0, 5).map((s) => ({ type: s.type, title: s.title })),
        lastRunAt: lastRun?.createdAt ? lastRun.createdAt.toISOString() : null,
        freshRun: Boolean(lastRun && now.getTime() - lastRun.createdAt.getTime() <= 2 * 60 * 60 * 1000),
        recentErrors: recentRunErrors
      },
      nextSteps: [
        topFocus[0]
          ? `Начните с: "${topFocus[0].title}".`
          : "Откройте AI Inbox и подтвердите полезные предложения.",
        pendingSuggestions.length > 0
          ? "Проверьте AI-кандидаты и подтвердите только действительно нужные."
          : "Если есть новые обсуждения в чате, дождитесь следующего AI-анализа."
      ]
    };
    return context;
  }

  async buildDigestV2(input: { homeId: string; mode: DigestMode; hours?: number; useLlm?: boolean }): Promise<{
    version: "v2";
    text: string;
    textFallback: string;
    context: DigestContextV2;
    usedLlm: boolean;
  }> {
    const context = await this.buildContext(input.homeId, input.mode, input.hours ?? 24);
    const fallbackText = buildDeterministicDigestText(context);
    const shouldUseLlm =
      (input.useLlm ?? true) &&
      config.aiFeatureEnabled &&
      Boolean(config.openrouterApiKey) &&
      config.aiDigestV2Enabled;

    const resolved = await applyLlmFormattingWithFallback({
      context,
      fallbackText,
      enabled: shouldUseLlm,
      formatter: (ctx) => formatDigestWithLlm(ctx, this.openRouterService),
      onError: (error) => {
        console.warn("[AI][DigestV2] LLM summary failed, fallback used", error instanceof Error ? error.message : error);
      }
    });
    return {
      version: "v2",
      text: resolved.text,
      textFallback: fallbackText,
      context,
      usedLlm: resolved.usedLlm
    };
  }
}

