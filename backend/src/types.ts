import type { HomeRole, User } from "@prisma/client";

export type AuthUser = Pick<
  User,
  "id" | "telegramId" | "username" | "firstName" | "lastName" | "activeHomeId"
>;

export type RequestContext = {
  user: AuthUser;
  homeId: string;
  role: HomeRole;
};
