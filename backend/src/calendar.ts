import crypto from "node:crypto";
import * as ical from "node-ical";
import { prisma } from "./db.js";

const SYNC_PAST_DAYS = 30;
const SYNC_FUTURE_DAYS = 90;

type CalendarRange = {
  from: Date;
  to: Date;
};

function addDays(base: Date, days: number): Date {
  return new Date(base.getTime() + days * 24 * 60 * 60 * 1000);
}

export function defaultCalendarRange(now = new Date()): CalendarRange {
  return {
    from: addDays(now, -SYNC_PAST_DAYS),
    to: addDays(now, SYNC_FUTURE_DAYS)
  };
}

function eventHash(input: {
  uid: string;
  title: string;
  description: string | null;
  location: string | null;
  startAt: Date;
  endAt: Date;
  allDay: boolean;
}): string {
  return crypto
    .createHash("sha1")
    .update(
      [
        input.uid,
        input.title,
        input.description ?? "",
        input.location ?? "",
        input.startAt.toISOString(),
        input.endAt.toISOString(),
        input.allDay ? "1" : "0"
      ].join("|")
    )
    .digest("hex");
}

function normalizeEventDates(startAt: Date, endAt: Date | undefined): { startAt: Date; endAt: Date } {
  const safeStart = new Date(startAt);
  const safeEnd = endAt ? new Date(endAt) : new Date(startAt);
  if (safeEnd <= safeStart) {
    return { startAt: safeStart, endAt: new Date(safeStart.getTime() + 60 * 60 * 1000) };
  }
  return { startAt: safeStart, endAt: safeEnd };
}

export async function syncCalendarFeed(feedId: string, now = new Date()) {
  const feed = await prisma.calendarFeed.findUnique({ where: { id: feedId } });
  if (!feed) {
    throw new Error("Calendar feed not found");
  }

  const parsed = await ical.async.fromURL(feed.icsUrl);
  const range = defaultCalendarRange(now);
  const rows: Array<{
    homeId: string;
    feedId: string;
    uid: string;
    title: string;
    description: string | null;
    location: string | null;
    startAt: Date;
    endAt: Date;
    allDay: boolean;
    hash: string;
  }> = [];

  for (const item of Object.values(parsed) as any[]) {
    if (!item || item.type !== "VEVENT" || !item.start) {
      continue;
    }

    const uid = String(item.uid ?? item.id ?? "");
    if (!uid) {
      continue;
    }

    const { startAt, endAt } = normalizeEventDates(item.start as Date, item.end as Date | undefined);
    if (endAt < range.from || startAt > range.to) {
      continue;
    }

    const allDay = item.datetype === "date";
    const title = String(item.summary ?? "Без названия");
    const description = item.description ? String(item.description) : null;
    const location = item.location ? String(item.location) : null;
    const hash = eventHash({
      uid,
      title,
      description,
      location,
      startAt,
      endAt,
      allDay
    });

    rows.push({
      homeId: feed.homeId,
      feedId: feed.id,
      uid,
      title,
      description,
      location,
      startAt,
      endAt,
      allDay,
      hash
    });
  }

  await prisma.$transaction(async (tx) => {
    await tx.calendarEvent.deleteMany({
      where: {
        feedId: feed.id,
        startAt: {
          gte: range.from,
          lte: range.to
        }
      }
    });
    if (rows.length > 0) {
      await tx.calendarEvent.createMany({
        data: rows,
        skipDuplicates: true
      });
    }
    await tx.calendarFeed.update({
      where: { id: feed.id },
      data: { lastSyncedAt: now }
    });
  });

  return { synced: rows.length, from: range.from, to: range.to };
}

export async function syncAllEnabledFeeds() {
  const feeds = await prisma.calendarFeed.findMany({
    where: { isEnabled: true },
    select: { id: true }
  });
  const results: Array<{ feedId: string; ok: boolean; synced: number; error?: string }> = [];
  for (const feed of feeds) {
    try {
      const result = await syncCalendarFeed(feed.id);
      results.push({ feedId: feed.id, ok: true, synced: result.synced });
    } catch (error) {
      results.push({
        feedId: feed.id,
        ok: false,
        synced: 0,
        error: error instanceof Error ? error.message : "Unknown sync error"
      });
    }
  }
  return results;
}
