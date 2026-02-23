CREATE TYPE "AiExtractionRunStatus" AS ENUM ('PENDING', 'SUCCESS', 'ERROR');
CREATE TYPE "AiSuggestionType" AS ENUM ('TASK', 'EVENT', 'QUESTION');
CREATE TYPE "AiSuggestionStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'IGNORED');
CREATE TYPE "AiAssigneeMode" AS ENUM ('SINGLE', 'ALL', 'UNASSIGNED');

CREATE TABLE "TelegramMessage" (
  "id" TEXT NOT NULL,
  "telegramChatId" TEXT NOT NULL,
  "telegramMessageId" INTEGER NOT NULL,
  "telegramUserId" TEXT,
  "senderName" TEXT,
  "username" TEXT,
  "text" TEXT,
  "rawType" TEXT NOT NULL,
  "sentAt" TIMESTAMP(3) NOT NULL,
  "replyToTelegramMessageId" INTEGER,
  "rawJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TelegramMessage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AiChatConnection" (
  "id" TEXT NOT NULL,
  "homeId" TEXT NOT NULL,
  "telegramChatId" TEXT NOT NULL,
  "chatTitle" TEXT,
  "isEnabled" BOOLEAN NOT NULL DEFAULT false,
  "analysisIntervalMinutes" INTEGER NOT NULL DEFAULT 60,
  "lastAnalyzedAt" TIMESTAMP(3),
  "lastAnalyzedMessageId" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AiChatConnection_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AiExtractionRun" (
  "id" TEXT NOT NULL,
  "homeId" TEXT NOT NULL,
  "aiChatConnectionId" TEXT NOT NULL,
  "status" "AiExtractionRunStatus" NOT NULL DEFAULT 'PENDING',
  "model" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "promptVersion" TEXT NOT NULL,
  "periodStart" TIMESTAMP(3) NOT NULL,
  "periodEnd" TIMESTAMP(3) NOT NULL,
  "messagesCount" INTEGER NOT NULL,
  "inputTokens" INTEGER,
  "outputTokens" INTEGER,
  "costUsd" DECIMAL(10, 6),
  "rawResponse" JSONB,
  "errorMessage" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finishedAt" TIMESTAMP(3),
  CONSTRAINT "AiExtractionRun_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AiSuggestion" (
  "id" TEXT NOT NULL,
  "homeId" TEXT NOT NULL,
  "sourceChatId" TEXT NOT NULL,
  "type" "AiSuggestionType" NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "status" "AiSuggestionStatus" NOT NULL DEFAULT 'PENDING',
  "confidence" DOUBLE PRECISION,
  "proposedAssigneeMode" "AiAssigneeMode",
  "proposedAssigneeUserIds" JSONB,
  "proposedDueAt" TIMESTAMP(3),
  "proposedStartAt" TIMESTAMP(3),
  "proposedEndAt" TIMESTAMP(3),
  "sourceMessageRefs" JSONB NOT NULL,
  "dedupKey" TEXT,
  "aiExtractionRunId" TEXT,
  "approvedByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AiSuggestion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TelegramMessage_telegramChatId_telegramMessageId_key"
  ON "TelegramMessage"("telegramChatId", "telegramMessageId");
CREATE INDEX "TelegramMessage_telegramChatId_sentAt_idx"
  ON "TelegramMessage"("telegramChatId", "sentAt");
CREATE INDEX "TelegramMessage_telegramChatId_telegramMessageId_idx"
  ON "TelegramMessage"("telegramChatId", "telegramMessageId");

CREATE UNIQUE INDEX "AiChatConnection_homeId_telegramChatId_key"
  ON "AiChatConnection"("homeId", "telegramChatId");
CREATE INDEX "AiChatConnection_isEnabled_updatedAt_idx"
  ON "AiChatConnection"("isEnabled", "updatedAt");

CREATE INDEX "AiExtractionRun_homeId_createdAt_idx"
  ON "AiExtractionRun"("homeId", "createdAt");
CREATE INDEX "AiExtractionRun_aiChatConnectionId_createdAt_idx"
  ON "AiExtractionRun"("aiChatConnectionId", "createdAt");

CREATE INDEX "AiSuggestion_homeId_status_createdAt_idx"
  ON "AiSuggestion"("homeId", "status", "createdAt" DESC);
CREATE INDEX "AiSuggestion_homeId_type_status_idx"
  ON "AiSuggestion"("homeId", "type", "status");
CREATE INDEX "AiSuggestion_dedupKey_idx"
  ON "AiSuggestion"("dedupKey");

ALTER TABLE "AiChatConnection" ADD CONSTRAINT "AiChatConnection_homeId_fkey"
  FOREIGN KEY ("homeId") REFERENCES "Home"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AiExtractionRun" ADD CONSTRAINT "AiExtractionRun_homeId_fkey"
  FOREIGN KEY ("homeId") REFERENCES "Home"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AiExtractionRun" ADD CONSTRAINT "AiExtractionRun_aiChatConnectionId_fkey"
  FOREIGN KEY ("aiChatConnectionId") REFERENCES "AiChatConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AiSuggestion" ADD CONSTRAINT "AiSuggestion_homeId_fkey"
  FOREIGN KEY ("homeId") REFERENCES "Home"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AiSuggestion" ADD CONSTRAINT "AiSuggestion_aiExtractionRunId_fkey"
  FOREIGN KEY ("aiExtractionRunId") REFERENCES "AiExtractionRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AiSuggestion" ADD CONSTRAINT "AiSuggestion_approvedByUserId_fkey"
  FOREIGN KEY ("approvedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
