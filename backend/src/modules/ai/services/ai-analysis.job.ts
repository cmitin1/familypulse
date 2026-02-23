import { AiExtractionRunStatus } from "@prisma/client";
import { ZodError } from "zod";
import { config } from "../../../config.js";
import { prisma } from "../../../db.js";
import { ChatIntelligenceService } from "./chat-intelligence.service.js";
import { AiSuggestionService } from "./ai-suggestion.service.js";

type CandidateConnection = {
  id: string;
  homeId: string;
  telegramChatId: string;
  chatTitle: string | null;
  analysisIntervalMinutes: number;
  lastAnalyzedAt: Date | null;
  lastAnalyzedMessageId: number | null;
};

type ConnectionRunOutcome =
  | {
      status: "completed";
      messagesAnalyzed: number;
      suggestionsCreated: number;
      suggestionsDeduped: number;
      suggestionsSkippedBySourceRefs: number;
    }
  | { status: "no_new_messages"; messagesAnalyzed: 0; suggestionsCreated: 0; suggestionsDeduped: 0; suggestionsSkippedBySourceRefs: 0 }
  | { status: "disabled_or_unlinked"; messagesAnalyzed: 0; suggestionsCreated: 0; suggestionsDeduped: 0; suggestionsSkippedBySourceRefs: 0 }
  | { status: "in_progress"; messagesAnalyzed: 0; suggestionsCreated: 0; suggestionsDeduped: 0; suggestionsSkippedBySourceRefs: 0 }
  | { status: "failed"; messagesAnalyzed: 0; suggestionsCreated: 0; suggestionsDeduped: 0; suggestionsSkippedBySourceRefs: 0; error: string };

export class AiAnalysisJobService {
  private static readonly inProgressConnections = new Set<string>();

  constructor(
    private readonly chatIntelligenceService = new ChatIntelligenceService(),
    private readonly aiSuggestionService = new AiSuggestionService()
  ) {}

  async runHourlyAnalysis(): Promise<void> {
    if (!config.aiFeatureEnabled || !config.aiChatAnalysisEnabled) {
      return;
    }
    if (!this.chatIntelligenceService.isConfigured()) {
      console.warn("[AI] OPENROUTER_API_KEY not configured, skipping analysis");
      return;
    }

    const connections = await prisma.aiChatConnection.findMany({
      where: { isEnabled: true }
    });

    for (const connection of connections) {
      try {
        if (!this.shouldRunNow(connection)) {
          continue;
        }
        await this.processConnection(connection);
      } catch (error) {
        console.error("[AI] Connection failed", {
          homeId: connection.homeId,
          telegramChatId: connection.telegramChatId,
          error: error instanceof Error ? error.message : "Unknown error"
        });
      }
    }
  }

  async runManualAnalysisForHome(input: { homeId: string; userId: string }) {
    if (!config.aiFeatureEnabled) {
      return {
        ok: false as const,
        status: "disabled" as const,
        homeId: input.homeId,
        message: "AI feature is disabled"
      };
    }
    if (!config.aiChatAnalysisEnabled) {
      return {
        ok: false as const,
        status: "disabled" as const,
        homeId: input.homeId,
        message: "AI chat analysis is disabled"
      };
    }
    if (!this.chatIntelligenceService.isConfigured()) {
      return {
        ok: false as const,
        status: "misconfigured" as const,
        homeId: input.homeId,
        message: "OPENROUTER_API_KEY is not configured"
      };
    }

    const connections = await prisma.aiChatConnection.findMany({
      where: { homeId: input.homeId, isEnabled: true }
    });
    if (!connections.length) {
      return {
        ok: false as const,
        status: "no_connections" as const,
        homeId: input.homeId,
        message: "No enabled AI chat connections for this home"
      };
    }

    console.info("[AI] Manual refresh started", {
      homeId: input.homeId,
      userId: input.userId,
      chatConnections: connections.length
    });

    let processedChats = 0;
    let messagesAnalyzed = 0;
    let suggestionsCreated = 0;
    let suggestionsDeduped = 0;
    let skippedBySourceRefs = 0;
    let noNewMessages = 0;
    let inProgress = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const connection of connections) {
      const outcome = await this.processConnection(connection, true);
      if (outcome.status === "disabled_or_unlinked") {
        continue;
      }
      if (outcome.status === "in_progress") {
        inProgress += 1;
        continue;
      }
      if (outcome.status === "failed") {
        failed += 1;
        errors.push(`[${connection.telegramChatId}] ${outcome.error}`);
        continue;
      }
      processedChats += 1;
      if (outcome.status === "no_new_messages") {
        noNewMessages += 1;
        continue;
      }
      messagesAnalyzed += outcome.messagesAnalyzed;
      suggestionsCreated += outcome.suggestionsCreated;
      suggestionsDeduped += outcome.suggestionsDeduped;
      skippedBySourceRefs += outcome.suggestionsSkippedBySourceRefs;
    }

    const status =
      failed > 0 && processedChats === 0
        ? "failed"
        : messagesAnalyzed === 0 && suggestionsCreated === 0 && noNewMessages > 0
          ? "no_new_messages"
          : "completed";

    const response = {
      ok: status !== "failed",
      status,
      homeId: input.homeId,
      processedChats,
      messagesAnalyzed,
      suggestionsCreated,
      suggestionsDeduped,
      skippedBySourceRefs,
      noNewMessagesChats: noNewMessages,
      inProgressChats: inProgress,
      failedChats: failed,
      errors,
      message:
        status === "no_new_messages"
          ? "No new messages for analysis"
          : status === "completed"
            ? "AI analysis completed"
            : "AI analysis finished with errors"
    } as const;

    console.info("[AI] Manual refresh finished", response);
    return response;
  }

  private shouldRunNow(connection: CandidateConnection): boolean {
    if (!connection.lastAnalyzedAt) {
      return true;
    }
    const nextAt = connection.lastAnalyzedAt.getTime() + connection.analysisIntervalMinutes * 60 * 1000;
    return Date.now() >= nextAt;
  }

  private async processConnection(connection: CandidateConnection, force = false): Promise<ConnectionRunOutcome> {
    const runKey = `${connection.homeId}:${connection.telegramChatId}`;
    if (AiAnalysisJobService.inProgressConnections.has(runKey)) {
      return {
        status: "in_progress",
        messagesAnalyzed: 0,
        suggestionsCreated: 0,
        suggestionsDeduped: 0,
        suggestionsSkippedBySourceRefs: 0
      };
    }
    AiAnalysisJobService.inProgressConnections.add(runKey);
    try {
    const link = await prisma.chatLink.findUnique({
      where: {
        homeId_telegramChatId: {
          homeId: connection.homeId,
          telegramChatId: connection.telegramChatId
        }
      }
    });
    if (!link?.enabled) {
      return {
        status: "disabled_or_unlinked",
        messagesAnalyzed: 0,
        suggestionsCreated: 0,
        suggestionsDeduped: 0,
        suggestionsSkippedBySourceRefs: 0
      };
    }
    if (!force && !this.shouldRunNow(connection)) {
      return {
        status: "disabled_or_unlinked",
        messagesAnalyzed: 0,
        suggestionsCreated: 0,
        suggestionsDeduped: 0,
        suggestionsSkippedBySourceRefs: 0
      };
    }

    const where = connection.lastAnalyzedMessageId
      ? {
          telegramChatId: connection.telegramChatId,
          telegramMessageId: { gt: connection.lastAnalyzedMessageId }
        }
      : {
          telegramChatId: connection.telegramChatId,
          sentAt: {
            gt: connection.lastAnalyzedAt ?? new Date(Date.now() - 24 * 60 * 60 * 1000)
          }
        };

    const messages = await prisma.telegramMessage.findMany({
      where,
      orderBy: { telegramMessageId: "asc" },
      take: Math.max(1, config.aiChatAnalysisBatchLimit)
    });
    if (!messages.length) {
      console.info("[AI] Skip empty batch", {
        homeId: connection.homeId,
        telegramChatId: connection.telegramChatId
      });
      await prisma.aiChatConnection.update({
        where: { id: connection.id },
        data: { lastAnalyzedAt: new Date() }
      });
      return {
        status: "no_new_messages",
        messagesAnalyzed: 0,
        suggestionsCreated: 0,
        suggestionsDeduped: 0,
        suggestionsSkippedBySourceRefs: 0
      };
    }

    const periodStart = messages[0].sentAt;
    const periodEnd = messages[messages.length - 1].sentAt;
    const run = await prisma.aiExtractionRun.create({
      data: {
        homeId: connection.homeId,
        aiChatConnectionId: connection.id,
        status: AiExtractionRunStatus.PENDING,
        model: config.openrouterModelExtract,
        provider: "openrouter",
        promptVersion: config.aiChatPromptVersion,
        periodStart,
        periodEnd,
        messagesCount: messages.length
      }
    });

    console.info("[AI] Run started", {
      runId: run.id,
      homeId: connection.homeId,
      telegramChatId: connection.telegramChatId,
      messagesCount: messages.length
    });

    try {
      const extraction = await this.chatIntelligenceService.extract({
        chatTitle: connection.chatTitle,
        messages: messages.map((message) => ({
          telegramMessageId: message.telegramMessageId,
          telegramUserId: message.telegramUserId,
          senderName: message.senderName,
          username: message.username,
          text: message.text,
          sentAt: message.sentAt
        }))
      });

      const created = await this.aiSuggestionService.saveFromExtraction({
        homeId: connection.homeId,
        sourceChatId: connection.telegramChatId,
        extractionRunId: run.id,
        suggestions: extraction.parsed.suggestions,
        allowedMessageIds: messages.map((message) => message.telegramMessageId)
      });

      await prisma.aiExtractionRun.update({
        where: { id: run.id },
        data: {
          status: AiExtractionRunStatus.SUCCESS,
          inputTokens: extraction.inputTokens,
          outputTokens: extraction.outputTokens,
          costUsd: extraction.costUsd ?? undefined,
          rawResponse: {
            providerResponse: extraction.rawResponse,
            extraction: extraction.parsed
          } as object,
          finishedAt: new Date()
        }
      });
      await prisma.aiChatConnection.update({
        where: { id: connection.id },
        data: {
          lastAnalyzedAt: new Date(),
          lastAnalyzedMessageId: messages[messages.length - 1].telegramMessageId
        }
      });

      console.info("[AI] Run success", {
        runId: run.id,
        homeId: connection.homeId,
        suggestions: created.created
      });
      return {
        status: "completed",
        messagesAnalyzed: messages.length,
        suggestionsCreated: created.created,
        suggestionsDeduped: created.deduped,
        suggestionsSkippedBySourceRefs: created.skippedBySourceRefs
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown extraction error";
      const errorType =
        error instanceof ZodError ? "validation_error" : error instanceof SyntaxError ? "json_parse_error" : "runtime_error";
      await prisma.aiExtractionRun.update({
        where: { id: run.id },
        data: {
          status: AiExtractionRunStatus.ERROR,
          errorMessage: message.slice(0, 500),
          finishedAt: new Date()
        }
      });
      console.error("[AI] Run failed", {
        runId: run.id,
        homeId: connection.homeId,
        errorType,
        error: message
      });
      return {
        status: "failed",
        messagesAnalyzed: 0,
        suggestionsCreated: 0,
        suggestionsDeduped: 0,
        suggestionsSkippedBySourceRefs: 0,
        error: message
      };
    }
    } finally {
      AiAnalysisJobService.inProgressConnections.delete(runKey);
    }
  }
}
