import dotenv from "dotenv";

dotenv.config();

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing env var: ${name}`);
  }
  return value;
}

function optional(name: string): string | undefined {
  const value = process.env[name];
  return value ? value : undefined;
}

function bool(name: string, defaultValue: boolean): boolean {
  const value = process.env[name];
  if (!value) {
    return defaultValue;
  }
  return value.toLowerCase() === "true";
}

function int(name: string, defaultValue: number): number {
  const value = process.env[name];
  if (!value) {
    return defaultValue;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : defaultValue;
}

function boundedInt(name: string, defaultValue: number, min: number, max: number): number {
  const value = int(name, defaultValue);
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

export const config = {
  port: Number(process.env.PORT ?? 4000),
  nodeEnv: process.env.NODE_ENV ?? "development",
  databaseUrl: required("DATABASE_URL"),
  jwtSecret: required("JWT_SECRET"),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? "7d",
  enableBot: bool("ENABLE_BOT", false),
  enableScheduler: bool("ENABLE_SCHEDULER", false),
  calendarSyncIntervalMinutes: int("CALENDAR_SYNC_INTERVAL_MINUTES", 30),
  reminderMorningTime: process.env.REMINDER_MORNING_TIME ?? "09:00",
  reminderEveningTime: process.env.REMINDER_EVENING_TIME ?? "19:00",
  checkinTime: process.env.CHECKIN_TIME ?? "21:30",
  telegramBotToken: required("TELEGRAM_BOT_TOKEN"),
  telegramBotUsername: optional("TELEGRAM_BOT_USERNAME"),
  telegramMiniAppName: process.env.TELEGRAM_MINI_APP_NAME ?? "familypulse",
  miniAppUrl: required("MINI_APP_URL"),
  backendUrl: required("BACKEND_URL"),
  corsOrigin: process.env.CORS_ORIGIN ?? "*",
  aiFeatureEnabled: bool("AI_FEATURE_ENABLED", false),
  aiDigestV2Enabled: bool("AI_DIGEST_V2_ENABLED", true),
  aiChatAnalysisEnabled: bool("AI_CHAT_ANALYSIS_ENABLED", false),
  aiChatAnalysisBatchLimit: boundedInt("AI_CHAT_ANALYSIS_BATCH_LIMIT", 100, 1, 500),
  aiChatPromptVersion: process.env.AI_CHAT_PROMPT_VERSION ?? "v1",
  openrouterApiKey: optional("OPENROUTER_API_KEY"),
  openrouterBaseUrl: process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1",
  openrouterModelExtract: process.env.OPENROUTER_MODEL_EXTRACT ?? "openai/gpt-4o-mini",
  openrouterModelSummary: process.env.OPENROUTER_MODEL_SUMMARY ?? process.env.OPENROUTER_MODEL_EXTRACT ?? "openai/gpt-4o-mini"
};
