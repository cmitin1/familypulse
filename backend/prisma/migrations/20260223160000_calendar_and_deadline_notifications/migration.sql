-- Extend ChatLink for deadline reminder anti-spam markers
ALTER TABLE "ChatLink"
ADD COLUMN "lastDeadlineMorningYmd" TEXT,
ADD COLUMN "lastDeadlineEveningYmd" TEXT;

-- Create calendar feeds
CREATE TABLE "CalendarFeed" (
  "id" TEXT NOT NULL,
  "homeId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "icsUrl" TEXT NOT NULL,
  "isEnabled" BOOLEAN NOT NULL DEFAULT true,
  "lastSyncedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CalendarFeed_pkey" PRIMARY KEY ("id")
);

-- Create calendar events
CREATE TABLE "CalendarEvent" (
  "id" TEXT NOT NULL,
  "homeId" TEXT NOT NULL,
  "feedId" TEXT NOT NULL,
  "uid" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "location" TEXT,
  "startAt" TIMESTAMP(3) NOT NULL,
  "endAt" TIMESTAMP(3) NOT NULL,
  "allDay" BOOLEAN NOT NULL DEFAULT false,
  "hash" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CalendarEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CalendarFeed_homeId_icsUrl_key" ON "CalendarFeed"("homeId", "icsUrl");
CREATE UNIQUE INDEX "CalendarEvent_feedId_uid_startAt_key" ON "CalendarEvent"("feedId", "uid", "startAt");
CREATE INDEX "CalendarEvent_homeId_startAt_idx" ON "CalendarEvent"("homeId", "startAt");
CREATE INDEX "CalendarEvent_feedId_startAt_idx" ON "CalendarEvent"("feedId", "startAt");

ALTER TABLE "CalendarFeed" ADD CONSTRAINT "CalendarFeed_homeId_fkey"
  FOREIGN KEY ("homeId") REFERENCES "Home"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CalendarEvent" ADD CONSTRAINT "CalendarEvent_homeId_fkey"
  FOREIGN KEY ("homeId") REFERENCES "Home"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CalendarEvent" ADD CONSTRAINT "CalendarEvent_feedId_fkey"
  FOREIGN KEY ("feedId") REFERENCES "CalendarFeed"("id") ON DELETE CASCADE ON UPDATE CASCADE;
