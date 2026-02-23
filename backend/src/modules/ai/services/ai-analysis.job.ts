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

export class AiAnalysisJobService {
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

  private shouldRunNow(connection: CandidateConnection): boolean {
    if (!connection.lastAnalyzedAt) {
      return true;
    }
    const nextAt = connection.lastAnalyzedAt.getTime() + connection.analysisIntervalMinutes * 60 * 1000;
    return Date.now() >= nextAt;
  }

  private async processConnection(connection: CandidateConnection) {
    const link = await prisma.chatLink.findUnique({
      where: {
        homeId_telegramChatId: {
          homeId: connection.homeId,
          telegramChatId: connection.telegramChatId
        }
      }
    });
    if (!link?.enabled) {
      return;
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
      return;
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
    }
  }
}
