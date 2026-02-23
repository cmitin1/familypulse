import { AiSuggestionStatus } from "@prisma/client";
import { prisma } from "../../../db.js";
import { ensureTodayRoutineInstances, localDateEnd, localDateStart, ymdInTimezone } from "../../../services.js";

export class AiSummaryService {
  private extractDiscussionSummary(rawResponse: unknown): string | null {
    if (!rawResponse || typeof rawResponse !== "object") {
      return null;
    }
    const extraction = (rawResponse as any).extraction;
    if (!extraction || typeof extraction !== "object") {
      return null;
    }
    const summary = extraction.summary;
    return typeof summary === "string" && summary.trim().length > 0 ? summary.trim() : null;
  }

  async buildTodaySummary(homeId: string, userId?: string) {
    const home = await prisma.home.findUnique({ where: { id: homeId } });
    if (!home) {
      throw new Error("Home not found");
    }
    const dateYmd = ymdInTimezone(new Date(), home.timezone);
    await ensureTodayRoutineInstances(homeId, dateYmd);
    const start = localDateStart(dateYmd, home.timezone);
    const end = localDateEnd(dateYmd, home.timezone);
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [todayTasks, todayRoutines, todayEvents, aiSuggestions] = await Promise.all([
      prisma.task.findMany({
        where: {
          homeId,
          AND: [
            { OR: [{ dueDate: null }, { dueDate: { gte: start, lte: end } }] },
            ...(userId ? [{ OR: [{ assigneeId: userId }, { assignees: { some: { userId } } }, { assigneeId: null }] }] : [])
          ]
        },
        include: {
          assignee: { select: { id: true, firstName: true, username: true } },
          assignees: { include: { user: { select: { id: true, firstName: true, username: true } } } }
        },
        orderBy: { createdAt: "desc" },
        take: 20
      }),
      prisma.routineInstance.findMany({
        where: { homeId, date: { gte: start, lte: end } },
        include: {
          routine: true,
          assignee: { select: { id: true, firstName: true, username: true } }
        },
        orderBy: { createdAt: "asc" }
      }),
      prisma.event.findMany({
        where: { homeId, AND: [{ startAt: { lte: end } }, { endAt: { gte: start } }] },
        orderBy: { startAt: "asc" },
        take: 10
      }),
      prisma.aiSuggestion.findMany({
        where: {
          homeId,
          status: AiSuggestionStatus.PENDING,
          createdAt: { gte: since }
        },
        orderBy: { createdAt: "desc" },
        take: 15
      })
    ]);

    const summaryText = `Сегодня: задач ${todayTasks.length}, рутин ${todayRoutines.length}, событий ${todayEvents.length}, AI-кандидатов ${aiSuggestions.length}.`;
    return {
      summaryText,
      stats: {
        tasks: todayTasks.length,
        routines: todayRoutines.length,
        events: todayEvents.length,
        aiSuggestions: aiSuggestions.length
      },
      todayTasks,
      todayRoutines,
      todayEvents,
      aiSuggestions
    };
  }

  async buildDigest(homeId: string, hours = 24) {
    const safeHours = Math.min(Math.max(hours, 1), 168);
    const since = new Date(Date.now() - safeHours * 60 * 60 * 1000);
    const [lastRun, suggestions] = await Promise.all([
      prisma.aiExtractionRun.findFirst({
        where: { homeId, status: "SUCCESS", createdAt: { gte: since } },
        orderBy: { createdAt: "desc" }
      }),
      prisma.aiSuggestion.findMany({
        where: { homeId, createdAt: { gte: since } },
        orderBy: { createdAt: "desc" },
        take: 100
      })
    ]);

    const byType = {
      task: suggestions.filter((s) => s.type === "TASK").length,
      event: suggestions.filter((s) => s.type === "EVENT").length,
      question: suggestions.filter((s) => s.type === "QUESTION").length
    };
    const pending = suggestions.filter((s) => s.status === "PENDING").length;
    const discussionSummary = this.extractDiscussionSummary(lastRun?.rawResponse);
    const summaryText = [
      discussionSummary ? `Что обсуждали: ${discussionSummary}` : `AI digest за ${safeHours}ч.`,
      `Найдено: задачи ${byType.task}, события ${byType.event}, вопросы ${byType.question}.`,
      `Требуют внимания (pending): ${pending}.`,
      lastRun?.rawResponse ? "Есть свежий AI run." : "Свежих AI run пока нет."
    ].join(" ");

    return {
      summaryText,
      hours: safeHours,
      counts: {
        total: suggestions.length,
        ...byType,
        pending
      },
      discussionSummary,
      lastRunAt: lastRun?.createdAt ?? null,
      latestSuggestions: suggestions.slice(0, 15)
    };
  }
}
