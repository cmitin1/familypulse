import { AssigneeMode, Prisma, RoutineScheduleType, SourceType } from "@prisma/client";
import { fromZonedTime, formatInTimeZone } from "date-fns-tz";
import { prisma } from "./db.js";

export function ymdInTimezone(date: Date, timezone: string): string {
  return formatInTimeZone(date, timezone, "yyyy-MM-dd");
}

export function localDateStart(dateYmd: string, timezone: string): Date {
  return fromZonedTime(`${dateYmd}T00:00:00`, timezone);
}

export function localDateEnd(dateYmd: string, timezone: string): Date {
  return fromZonedTime(`${dateYmd}T23:59:59`, timezone);
}

export async function awardPointsIdempotent(input: {
  homeId: string;
  userId: string;
  sourceType: SourceType;
  sourceId: string;
  points: number;
}) {
  try {
    await prisma.scoreEvent.create({
      data: {
        homeId: input.homeId,
        userId: input.userId,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        points: input.points
      }
    });
    return { awarded: true };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { awarded: false };
    }
    throw error;
  }
}

function weekdayFromYmd(dateYmd: string): number {
  const [year, month, day] = dateYmd.split("-").map((part) => Number(part));
  return new Date(Date.UTC(year, (month ?? 1) - 1, day ?? 1)).getUTCDay();
}

function shouldRoutineRunToday(daysOfWeek: number[], scheduleType: RoutineScheduleType, dateYmd: string): boolean {
  if (scheduleType === "DAILY") {
    return true;
  }
  const day = weekdayFromYmd(dateYmd);
  return daysOfWeek.includes(day);
}

async function assignRotate(homeId: string, dateYmd: string): Promise<string | null> {
  const members = await prisma.homeMember.findMany({
    where: { homeId },
    orderBy: { userId: "asc" }
  });
  if (!members.length) {
    return null;
  }
  const num = Number(dateYmd.replaceAll("-", ""));
  const idx = num % members.length;
  return members[idx]?.userId ?? null;
}

export async function ensureTodayRoutineInstances(homeId: string, dateYmd: string) {
  const home = await prisma.home.findUnique({
    where: { id: homeId },
    select: { timezone: true }
  });
  if (!home) {
    return;
  }
  const targetDate = localDateStart(dateYmd, home.timezone);
  const routines = await prisma.routine.findMany({
    where: { homeId, isActive: true },
    orderBy: { createdAt: "asc" }
  });

  for (const routine of routines) {
    if (!shouldRoutineRunToday(routine.daysOfWeek, routine.scheduleType, dateYmd)) {
      continue;
    }

    let assigneeId: string | null = routine.fixedAssigneeId;
    if (routine.assigneeMode === AssigneeMode.ROTATE) {
      assigneeId = await assignRotate(homeId, dateYmd);
    }

    await prisma.routineInstance.upsert({
      where: {
        routineId_date: {
          routineId: routine.id,
          date: targetDate
        }
      },
      create: {
        homeId,
        routineId: routine.id,
        date: targetDate,
        assigneeId
      },
      // Existing instance for this routine/date must stay stable.
      update: {}
    });
  }
}

export async function buildDigestText(homeId: string, timezone: string, now = new Date()) {
  const ymd = ymdInTimezone(now, timezone);
  const start = localDateStart(ymd, timezone);
  const end = localDateEnd(ymd, timezone);

  const [tasksOpen, tasksDone, routinesOpen, routinesDone, top] = await Promise.all([
    prisma.task.count({ where: { homeId, status: "OPEN", OR: [{ dueDate: null }, { dueDate: { lte: end } }] } }),
    prisma.task.count({ where: { homeId, status: "DONE", doneAt: { gte: start, lte: end } } }),
    prisma.routineInstance.count({ where: { homeId, date: { gte: start, lte: end }, isDone: false } }),
    prisma.routineInstance.count({ where: { homeId, date: { gte: start, lte: end }, isDone: true } }),
    prisma.scoreEvent.groupBy({
      by: ["userId"],
      where: { homeId, createdAt: { gte: start, lte: end } },
      _sum: { points: true },
      orderBy: { _sum: { points: "desc" } },
      take: 3
    })
  ]);

  const topRows = await Promise.all(
    top.map(async (row) => {
      const user = await prisma.user.findUnique({ where: { id: row.userId } });
      const name = user?.firstName || user?.username || "member";
      return `• ${name}: ${row._sum.points ?? 0}`;
    })
  );

  return [
    "FamilyPulse: утренний дайджест",
    `Дата: ${ymd}`,
    `Задачи: ${tasksDone} done / ${tasksOpen} open`,
    `Рутины: ${routinesDone} done / ${routinesOpen} open`,
    topRows.length ? "Топ за сегодня:\n" + topRows.join("\n") : "Пока нет очков за сегодня"
  ].join("\n");
}
