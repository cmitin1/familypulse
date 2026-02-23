import { config } from "../../../config.js";
import { AiSuggestionStatus } from "@prisma/client";
import { prisma } from "../../../db.js";
import { buildDigestText } from "../../../services.js";
import { AiSummaryService } from "./ai-summary.service.js";
import { DigestV2Service } from "./digest-v2.service.js";

export async function buildTodayBotText(homeId: string, timezone: string): Promise<string> {
  if (config.aiDigestV2Enabled) {
    const digestV2Service = new DigestV2Service();
    const digestV2 = await digestV2Service.buildDigestV2({
      homeId,
      mode: "today",
      hours: 24,
      useLlm: true
    });
    return digestV2.text;
  }

  const summaryService = new AiSummaryService();
  const [classicDigest, pendingSuggestions] = await Promise.all([
    buildDigestText(homeId, timezone),
    prisma.aiSuggestion.findMany({
      where: { homeId, status: AiSuggestionStatus.PENDING },
      orderBy: { createdAt: "desc" },
      take: 5
    })
  ]);
  const today = await summaryService.buildTodaySummary(homeId);
  const todayCore = today
    ? `Сегодня: задачи ${today.todayTasks.length}, рутины ${today.todayRoutines.length}, события ${today.todayEvents.length}.`
    : "Сегодня: данных по дому пока недостаточно.";
  if (!pendingSuggestions.length) {
    return `${todayCore}\n${classicDigest}\n\nAI Inbox: новых кандидатов нет.`;
  }
  const aiLines = pendingSuggestions.map((item) => `• [${item.type.toLowerCase()}] ${item.title}`);
  return `${todayCore}\n${classicDigest}\n\nAI Inbox (pending):\n${aiLines.join("\n")}`;
}

export async function buildDigestBotText(homeId: string, timezone: string, mode: "on_demand" | "morning" = "on_demand"): Promise<string> {
  if (config.aiDigestV2Enabled) {
    const digestV2Service = new DigestV2Service();
    const digestV2 = await digestV2Service.buildDigestV2({
      homeId,
      mode,
      hours: 24,
      useLlm: true
    });
    return digestV2.text;
  }

  const summaryService = new AiSummaryService();
  const [classicDigest, aiDigest] = await Promise.all([
    buildDigestText(homeId, timezone),
    summaryService.buildDigest(homeId, 24)
  ]);
  const breakdown = `AI: task ${aiDigest.counts.task}, event ${aiDigest.counts.event}, question ${aiDigest.counts.question}, pending ${aiDigest.counts.pending}`;
  return [classicDigest, "", aiDigest.summaryText, breakdown].join("\n");
}
