-- Create enums
CREATE TYPE "HomeRole" AS ENUM ('OWNER', 'MEMBER');
CREATE TYPE "InviteStatus" AS ENUM ('ACTIVE', 'REVOKED');
CREATE TYPE "TaskStatus" AS ENUM ('OPEN', 'DONE');
CREATE TYPE "RoutineScheduleType" AS ENUM ('DAILY', 'WEEKLY');
CREATE TYPE "AssigneeMode" AS ENUM ('FIXED', 'ROTATE');
CREATE TYPE "SourceType" AS ENUM ('TASK', 'ROUTINE', 'CHECKIN');

-- Create tables
CREATE TABLE "User" (
  "id" TEXT NOT NULL,
  "telegramId" TEXT NOT NULL,
  "username" TEXT,
  "firstName" TEXT,
  "lastName" TEXT,
  "activeHomeId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Home" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "timezone" TEXT NOT NULL DEFAULT 'UTC',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Home_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "HomeMember" (
  "id" TEXT NOT NULL,
  "homeId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "role" "HomeRole" NOT NULL DEFAULT 'MEMBER',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "HomeMember_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Invite" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "homeId" TEXT NOT NULL,
  "createdById" TEXT NOT NULL,
  "maxUses" INTEGER,
  "usesCount" INTEGER NOT NULL DEFAULT 0,
  "expiresAt" TIMESTAMP(3),
  "status" "InviteStatus" NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Invite_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Task" (
  "id" TEXT NOT NULL,
  "homeId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "dueDate" TIMESTAMP(3),
  "assigneeId" TEXT,
  "points" INTEGER NOT NULL DEFAULT 5,
  "status" "TaskStatus" NOT NULL DEFAULT 'OPEN',
  "doneAt" TIMESTAMP(3),
  "doneById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Routine" (
  "id" TEXT NOT NULL,
  "homeId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "scheduleType" "RoutineScheduleType" NOT NULL,
  "daysOfWeek" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
  "timeOfDay" TEXT,
  "assigneeMode" "AssigneeMode" NOT NULL,
  "fixedAssigneeId" TEXT,
  "points" INTEGER NOT NULL DEFAULT 3,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Routine_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RoutineInstance" (
  "id" TEXT NOT NULL,
  "homeId" TEXT NOT NULL,
  "routineId" TEXT NOT NULL,
  "date" TIMESTAMP(3) NOT NULL,
  "assigneeId" TEXT,
  "isDone" BOOLEAN NOT NULL DEFAULT false,
  "doneAt" TIMESTAMP(3),
  "doneById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RoutineInstance_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ScoreEvent" (
  "id" TEXT NOT NULL,
  "homeId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "sourceType" "SourceType" NOT NULL,
  "sourceId" TEXT NOT NULL,
  "points" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ScoreEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Streak" (
  "id" TEXT NOT NULL,
  "homeId" TEXT NOT NULL,
  "date" TIMESTAMP(3) NOT NULL,
  "closedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Streak_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ChatLink" (
  "id" TEXT NOT NULL,
  "homeId" TEXT NOT NULL,
  "telegramChatId" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "lastDigestYmd" TEXT,
  "lastCheckinYmd" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ChatLink_pkey" PRIMARY KEY ("id")
);

-- Indexes and unique constraints
CREATE UNIQUE INDEX "User_telegramId_key" ON "User"("telegramId");
CREATE UNIQUE INDEX "HomeMember_homeId_userId_key" ON "HomeMember"("homeId", "userId");
CREATE UNIQUE INDEX "Invite_code_key" ON "Invite"("code");
CREATE UNIQUE INDEX "RoutineInstance_routineId_date_key" ON "RoutineInstance"("routineId", "date");
CREATE UNIQUE INDEX "Streak_homeId_date_key" ON "Streak"("homeId", "date");
CREATE UNIQUE INDEX "ScoreEvent_homeId_userId_sourceType_sourceId_key"
  ON "ScoreEvent"("homeId", "userId", "sourceType", "sourceId");
CREATE UNIQUE INDEX "ChatLink_homeId_telegramChatId_key" ON "ChatLink"("homeId", "telegramChatId");

-- Foreign keys
ALTER TABLE "User" ADD CONSTRAINT "User_activeHomeId_fkey"
  FOREIGN KEY ("activeHomeId") REFERENCES "Home"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "HomeMember" ADD CONSTRAINT "HomeMember_homeId_fkey"
  FOREIGN KEY ("homeId") REFERENCES "Home"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HomeMember" ADD CONSTRAINT "HomeMember_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Invite" ADD CONSTRAINT "Invite_homeId_fkey"
  FOREIGN KEY ("homeId") REFERENCES "Home"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Task" ADD CONSTRAINT "Task_homeId_fkey"
  FOREIGN KEY ("homeId") REFERENCES "Home"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Task" ADD CONSTRAINT "Task_assigneeId_fkey"
  FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Routine" ADD CONSTRAINT "Routine_homeId_fkey"
  FOREIGN KEY ("homeId") REFERENCES "Home"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Routine" ADD CONSTRAINT "Routine_fixedAssigneeId_fkey"
  FOREIGN KEY ("fixedAssigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "RoutineInstance" ADD CONSTRAINT "RoutineInstance_homeId_fkey"
  FOREIGN KEY ("homeId") REFERENCES "Home"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RoutineInstance" ADD CONSTRAINT "RoutineInstance_routineId_fkey"
  FOREIGN KEY ("routineId") REFERENCES "Routine"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RoutineInstance" ADD CONSTRAINT "RoutineInstance_assigneeId_fkey"
  FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "RoutineInstance" ADD CONSTRAINT "RoutineInstance_doneById_fkey"
  FOREIGN KEY ("doneById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ScoreEvent" ADD CONSTRAINT "ScoreEvent_homeId_fkey"
  FOREIGN KEY ("homeId") REFERENCES "Home"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ScoreEvent" ADD CONSTRAINT "ScoreEvent_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Streak" ADD CONSTRAINT "Streak_homeId_fkey"
  FOREIGN KEY ("homeId") REFERENCES "Home"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChatLink" ADD CONSTRAINT "ChatLink_homeId_fkey"
  FOREIGN KEY ("homeId") REFERENCES "Home"("id") ON DELETE CASCADE ON UPDATE CASCADE;
