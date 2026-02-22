import type { NextFunction, Request, Response } from "express";
import { verifyJwt } from "./auth.js";
import { prisma } from "./db.js";
import type { AuthUser } from "./types.js";

export type AuthedRequest = Request & { user: AuthUser };
export type HomeRequest = AuthedRequest & { context: { homeId: string; role: "OWNER" | "MEMBER" } };

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const token = authHeader.slice("Bearer ".length);
    const payload = verifyJwt(token);
    const user = await prisma.user.findUnique({ where: { id: payload.userId } });
    if (!user) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    (req as AuthedRequest).user = {
      id: user.id,
      telegramId: user.telegramId,
      username: user.username ?? undefined,
      firstName: user.firstName ?? undefined,
      lastName: user.lastName ?? undefined,
      activeHomeId: user.activeHomeId ?? undefined
    };
    return next();
  } catch {
    return res.status(401).json({ error: "Unauthorized" });
  }
}

export async function requireHome(req: Request, res: Response, next: NextFunction) {
  const user = (req as AuthedRequest).user;
  const homeId = user.activeHomeId;
  if (!homeId) {
    return res.status(400).json({ error: "No active home selected" });
  }

  const membership = await prisma.homeMember.findUnique({
    where: { homeId_userId: { homeId, userId: user.id } }
  });
  if (!membership) {
    return res.status(403).json({ error: "Forbidden: not a member of active home" });
  }

  (req as HomeRequest).context = { homeId, role: membership.role };
  return next();
}
