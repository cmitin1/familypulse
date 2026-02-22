import dotenv from "dotenv";

dotenv.config();

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing env var: ${name}`);
  }
  return value;
}

export const config = {
  port: Number(process.env.PORT ?? 4000),
  nodeEnv: process.env.NODE_ENV ?? "development",
  databaseUrl: required("DATABASE_URL"),
  jwtSecret: required("JWT_SECRET"),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? "7d",
  telegramBotToken: required("TELEGRAM_BOT_TOKEN"),
  telegramBotUsername: required("TELEGRAM_BOT_USERNAME"),
  telegramMiniAppName: process.env.TELEGRAM_MINI_APP_NAME ?? "familypulse",
  miniAppUrl: required("MINI_APP_URL"),
  backendUrl: required("BACKEND_URL"),
  corsOrigin: process.env.CORS_ORIGIN ?? "*"
};
