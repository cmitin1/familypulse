import crypto from "crypto";
import jwt from "jsonwebtoken";
import { config } from "./config.js";

export type TelegramValidatedUser = {
  id: string;
  username?: string;
  first_name?: string;
  last_name?: string;
};

export function validateTelegramInitData(initData: string): TelegramValidatedUser {
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) {
    throw new Error("initData hash is missing");
  }
  if (!/^[a-f0-9]{64}$/i.test(hash)) {
    throw new Error("initData hash format invalid");
  }

  const entries: string[] = [];
  for (const [key, value] of params.entries()) {
    if (key !== "hash") {
      entries.push(`${key}=${value}`);
    }
  }
  entries.sort((a, b) => a.localeCompare(b));
  const dataCheckString = entries.join("\n");

  const secret = crypto
    .createHmac("sha256", "WebAppData")
    .update(config.telegramBotToken)
    .digest();

  const computedHash = crypto.createHmac("sha256", secret).update(dataCheckString).digest("hex");
  const computedHashBuf = Buffer.from(computedHash, "hex");
  const incomingHashBuf = Buffer.from(hash, "hex");
  if (computedHashBuf.length !== incomingHashBuf.length || !crypto.timingSafeEqual(computedHashBuf, incomingHashBuf)) {
    throw new Error("Invalid initData signature");
  }

  const authDateRaw = params.get("auth_date");
  if (!authDateRaw) {
    throw new Error("auth_date missing");
  }
  const authDate = Number(authDateRaw);
  const nowSec = Math.floor(Date.now() / 1000);
  const maxAgeSec = 24 * 60 * 60;
  const maxFutureSkewSec = 5 * 60;
  if (!Number.isFinite(authDate) || authDate > nowSec + maxFutureSkewSec || nowSec - authDate > maxAgeSec) {
    throw new Error("initData expired");
  }

  const userRaw = params.get("user");
  if (!userRaw) {
    throw new Error("user payload missing");
  }

  const user = JSON.parse(userRaw) as TelegramValidatedUser;
  if (!user?.id) {
    throw new Error("user payload invalid");
  }
  return user;
}

export function signJwt(payload: { userId: string }) {
  return jwt.sign(payload, config.jwtSecret, { expiresIn: config.jwtExpiresIn, algorithm: "HS256" });
}

export function verifyJwt(token: string): { userId: string } {
  return jwt.verify(token, config.jwtSecret, { algorithms: ["HS256"] }) as { userId: string };
}
