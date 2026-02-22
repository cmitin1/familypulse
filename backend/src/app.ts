import express from "express";
import cors from "cors";
import { z } from "zod";
import { SourceType, TaskStatus } from "@prisma/client";
import { validateTelegramInitData, signJwt } from "./auth.js";
import { config } from "./config.js";
import { prisma } from "./db.js";
import { AuthedRequest, HomeRequest, requireAuth, requireHome } from "./middleware.js";
import {
  awardPointsIdempotent,
  ensureTodayRoutineInstances,
  localDateEnd,
  localDateStart,
  ymdInTimezone
} from "./services.js";

const app = express();
app.use(cors({ origin: config.corsOrigin === "*" ? true : config.corsOrigin }));
app.use(express.json());

const ymdSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format");

function zodBadRequest(res: express.Response, parsed: { error: z.ZodError }) {
  return res.status(400).json({
    error: "Validation failed",
    details: parsed.error.flatten()
  });
}

app.get("/health", (_req, res) => res.json({ ok: true }));

app.post("/auth/telegram", async (req, res) => {
  const schema = z.object({ initData: z.string().min(10) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid request body", issues: parsed.error.flatten() });
  }

  try {
    const tgUser = validateTelegramInitData(parsed.data.initData);
    const user = await prisma.user.upsert({
      where: { telegramId: String(tgUser.id) },
      update: {
        username: tgUser.username ?? null,
        firstName: tgUser.first_name ?? null,
        lastName: tgUser.last_name ?? null
      },
      create: {
        telegramId: String(tgUser.id),
        username: tgUser.username ?? null,
        firstName: tgUser.first_name ?? null,
        lastName: tgUser.last_name ?? null
      }
    });

    const memberships = await prisma.homeMember.findMany({
      where: { userId: user.id },
      include: { home: true },
      orderBy: { createdAt: "asc" }
    });
    const activeHomeId = user.activeHomeId ?? memberships[0]?.homeId ?? null;
    if (activeHomeId !== user.activeHomeId) {
      await prisma.user.update({ where: { id: user.id }, data: { activeHomeId } });
    }
    const token = signJwt({ userId: user.id });
    return res.json({
      token,
      user,
      homes: memberships.map((m) => m.home),
      activeHomeId
    });
  } catch {
    return res.status(401).json({ error: "Invalid Telegram initData" });
  }
});

app.use(requireAuth);

app.post("/homes", async (req, res) => {
  const schema = z.object({ name: z.string().min(2), timezone: z.string().optional() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid payload", issues: parsed.error.flatten() });
  }
  const user = (req as AuthedRequest).user;
  const home = await prisma.home.create({
    data: {
      name: parsed.data.name,
      timezone: parsed.data.timezone ?? "UTC",
      members: { create: { userId: user.id, role: "OWNER" } }
    }
  });
  await prisma.user.update({ where: { id: user.id }, data: { activeHomeId: home.id } });
  return res.status(201).json(home);
});

app.get("/homes/current", async (req, res) => {
  const user = (req as AuthedRequest).user;
  if (!user.activeHomeId) {
    return res.json({ home: null, members: [] });
  }
  const membership = await prisma.homeMember.findUnique({
    where: { homeId_userId: { homeId: user.activeHomeId, userId: user.id } }
  });
  if (!membership) {
    return res.status(403).json({ error: "Forbidden" });
  }
  const home = await prisma.home.findUnique({
    where: { id: user.activeHomeId },
    include: {
      members: { include: { user: true } },
      chatLinks: true
    }
  });
  return res.json(home);
});

app.post("/homes/switch", async (req, res) => {
  const schema = z.object({ homeId: z.string().min(1) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid payload" });
  }
  const user = (req as AuthedRequest).user;
  const membership = await prisma.homeMember.findUnique({
    where: { homeId_userId: { homeId: parsed.data.homeId, userId: user.id } }
  });
  if (!membership) {
    return res.status(403).json({ error: "Forbidden" });
  }
  await prisma.user.update({ where: { id: user.id }, data: { activeHomeId: parsed.data.homeId } });
  return res.json({ ok: true, activeHomeId: parsed.data.homeId });
});

app.post("/invites", async (req, res) => {
  const schema = z.object({
    maxUses: z.number().int().positive().optional(),
    expiresAt: z.string().datetime().optional()
  });
  const parsed = schema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid payload" });
  }
  const ctx = (req as HomeRequest).context;
  if (ctx.role !== "OWNER") {
    return res.status(403).json({ error: "Only owner can create invites" });
  }
  const code = Math.random().toString(36).slice(2, 10).toUpperCase();
  const invite = await prisma.invite.create({
    data: {
      code,
      homeId: ctx.homeId,
      createdById: (req as HomeRequest).user.id,
      maxUses: parsed.data.maxUses,
      expiresAt: parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : undefined
    }
  });
  return res.status(201).json(invite);
});

app.post("/invites/join", async (req, res) => {
  const schema = z.object({ code: z.string().min(4) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid payload" });
  }

  const user = (req as AuthedRequest).user;
  try {
    const result = await prisma.$transaction(async (tx) => {
      const invite = await tx.invite.findUnique({ where: { code: parsed.data.code.toUpperCase() } });
      if (!invite || invite.status !== "ACTIVE") {
        return { status: 404 as const, body: { error: "Invite not found" } };
      }
      if (invite.expiresAt && invite.expiresAt < new Date()) {
        return { status: 400 as const, body: { error: "Invite expired" } };
      }

      const updateWhere: any = { id: invite.id, status: "ACTIVE" };
      if (invite.expiresAt) {
        updateWhere.expiresAt = { gt: new Date() };
      }
      if (invite.maxUses) {
        updateWhere.usesCount = { lt: invite.maxUses };
      }

      const inviteUpdated = await tx.invite.updateMany({
        where: updateWhere,
        data: { usesCount: { increment: 1 } }
      });
      if (inviteUpdated.count === 0) {
        return { status: 400 as const, body: { error: "Invite limit reached" } };
      }

      await tx.homeMember.upsert({
        where: { homeId_userId: { homeId: invite.homeId, userId: user.id } },
        create: { homeId: invite.homeId, userId: user.id, role: "MEMBER" },
        update: {}
      });
      await tx.user.update({ where: { id: user.id }, data: { activeHomeId: invite.homeId } });
      return { status: 200 as const, body: { ok: true, homeId: invite.homeId } };
    });

    return res.status(result.status).json(result.body);
  } catch {
    return res.status(500).json({ error: "Failed to join invite" });
  }
});

app.use(requireHome);

app.post("/tasks", async (req, res) => {
  const schema = z.object({
    title: z.string().trim().min(1, "Title is required"),
    description: z.string().trim().optional(),
    dueDate: z.string().datetime().optional(),
    assigneeId: z.string().min(1).nullable().optional(),
    points: z.number().int().positive().optional()
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return zodBadRequest(res, parsed);
  }
  const { homeId } = (req as HomeRequest).context;
  if (parsed.data.assigneeId) {
    const assigneeMembership = await prisma.homeMember.findUnique({
      where: { homeId_userId: { homeId, userId: parsed.data.assigneeId } }
    });
    if (!assigneeMembership) {
      return res.status(400).json({ error: "Assignee is not a member of this home" });
    }
  }
  const task = await prisma.task.create({
    data: {
      homeId,
      title: parsed.data.title,
      description: parsed.data.description,
      dueDate: parsed.data.dueDate ? new Date(parsed.data.dueDate) : undefined,
      assigneeId: parsed.data.assigneeId ?? undefined,
      points: parsed.data.points ?? 5
    }
  });
  return res.status(201).json(task);
});

app.get("/tasks", async (req, res) => {
  const { homeId } = (req as HomeRequest).context;
  const home = await prisma.home.findUnique({ where: { id: homeId } });
  if (!home) {
    return res.status(404).json({ error: "Home not found" });
  }
  const scopeParsed = z.enum(["mine", "all"]).safeParse(req.query.scope ?? "all");
  if (!scopeParsed.success) {
    return zodBadRequest(res, scopeParsed);
  }
  const scope = scopeParsed.data;
  const dateRaw = String(req.query.date ?? "");
  const userId = (req as HomeRequest).user.id;

  const where: any = { homeId };
  if (scope === "mine") where.assigneeId = userId;
  if (dateRaw) {
    const dateParsed = ymdSchema.safeParse(dateRaw);
    if (!dateParsed.success) {
      return zodBadRequest(res, dateParsed);
    }
    const start = localDateStart(dateParsed.data, home.timezone);
    const end = localDateEnd(dateParsed.data, home.timezone);
    where.dueDate = { gte: start, lte: end };
  }
  const tasks = await prisma.task.findMany({
    where,
    include: { assignee: { select: { id: true, firstName: true, username: true } } },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }]
  });
  return res.json(tasks);
});

app.patch("/tasks/:id", async (req, res) => {
  const schema = z
    .object({
      status: z.nativeEnum(TaskStatus).optional(),
      assigneeId: z.string().min(1).nullable().optional(),
      dueDate: z.string().datetime().nullable().optional()
    })
    .refine((data) => data.status !== undefined || data.assigneeId !== undefined || data.dueDate !== undefined, {
      message: "Nothing to update"
    });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return zodBadRequest(res, parsed);
  }

  const { homeId } = (req as HomeRequest).context;
  const user = (req as HomeRequest).user;
  const task = await prisma.task.findFirst({ where: { id: req.params.id, homeId } });
  if (!task) {
    return res.status(404).json({ error: "Task not found" });
  }

  if (parsed.data.assigneeId) {
    const assigneeMembership = await prisma.homeMember.findUnique({
      where: { homeId_userId: { homeId, userId: parsed.data.assigneeId } }
    });
    if (!assigneeMembership) {
      return res.status(400).json({ error: "Assignee is not a member of this home" });
    }
  }

  const updateData: any = {};
  if (parsed.data.assigneeId !== undefined) {
    updateData.assigneeId = parsed.data.assigneeId;
  }
  if (parsed.data.dueDate !== undefined) {
    updateData.dueDate = parsed.data.dueDate ? new Date(parsed.data.dueDate) : null;
  }

  const isMarkingDone = parsed.data.status === TaskStatus.DONE && task.status !== TaskStatus.DONE;
  if (parsed.data.status !== undefined) {
    updateData.status = parsed.data.status;
    if (parsed.data.status === TaskStatus.DONE) {
      updateData.doneAt = task.doneAt ?? new Date();
      updateData.doneById = task.doneById ?? user.id;
    } else {
      updateData.doneAt = null;
      updateData.doneById = null;
    }
  }

  const updated = await prisma.task.update({
    where: { id: task.id },
    data: updateData
  });

  let awarded = false;
  if (isMarkingDone) {
    const awardResult = await awardPointsIdempotent({
      homeId,
      userId: user.id,
      sourceType: SourceType.TASK,
      sourceId: task.id,
      points: task.points
    });
    awarded = awardResult.awarded;
  }

  return res.json({ task: updated, awarded });
});

app.post("/tasks/:id/done", async (req, res) => {
  const { homeId } = (req as HomeRequest).context;
  const user = (req as HomeRequest).user;
  const task = await prisma.task.findFirst({ where: { id: req.params.id, homeId } });
  if (!task) {
    return res.status(404).json({ error: "Task not found" });
  }
  const updateResult = await prisma.task.updateMany({
    where: { id: task.id, homeId, status: "OPEN" },
    data: { status: "DONE", doneAt: new Date(), doneById: user.id }
  });
  if (updateResult.count === 0) {
    return res.json({ ok: true, awarded: false });
  }
  const awarded = await awardPointsIdempotent({
    homeId,
    userId: user.id,
    sourceType: SourceType.TASK,
    sourceId: task.id,
    points: task.points
  });
  return res.json({ ok: true, ...awarded });
});

app.post("/routines", async (req, res) => {
  const schema = z
    .object({
      title: z.string().trim().min(1, "Title is required"),
      scheduleType: z.enum(["DAILY", "WEEKLY"]),
      daysOfWeek: z.array(z.number().int().min(0).max(6)).optional(),
      timeOfDay: z.string().optional(),
      assigneeMode: z.enum(["FIXED", "ROTATE"]),
      fixedAssigneeId: z.string().min(1).optional(),
      points: z.number().int().positive().optional()
    })
    .superRefine((data, ctx) => {
      if (data.scheduleType === "WEEKLY" && (!data.daysOfWeek || data.daysOfWeek.length === 0)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "daysOfWeek is required for WEEKLY routines",
          path: ["daysOfWeek"]
        });
      }
      if (data.scheduleType === "DAILY" && data.daysOfWeek && data.daysOfWeek.length > 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "daysOfWeek must be empty for DAILY routines",
          path: ["daysOfWeek"]
        });
      }
      if (data.daysOfWeek) {
        const unique = new Set(data.daysOfWeek);
        if (unique.size !== data.daysOfWeek.length) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "daysOfWeek values must be unique",
            path: ["daysOfWeek"]
          });
        }
      }
      if (data.assigneeMode === "FIXED" && !data.fixedAssigneeId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "fixedAssigneeId is required for FIXED mode",
          path: ["fixedAssigneeId"]
        });
      }
      if (data.assigneeMode === "ROTATE" && data.fixedAssigneeId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "fixedAssigneeId is not allowed for ROTATE mode",
          path: ["fixedAssigneeId"]
        });
      }
    });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return zodBadRequest(res, parsed);
  }

  const { homeId, role } = (req as HomeRequest).context;
  if (role !== "OWNER") {
    return res.status(403).json({ error: "Only owner can create routines" });
  }
  if (parsed.data.fixedAssigneeId) {
    const assigneeMembership = await prisma.homeMember.findUnique({
      where: { homeId_userId: { homeId, userId: parsed.data.fixedAssigneeId } }
    });
    if (!assigneeMembership) {
      return res.status(400).json({ error: "Fixed assignee is not a member of this home" });
    }
  }
  const routine = await prisma.routine.create({
    data: {
      homeId,
      title: parsed.data.title,
      scheduleType: parsed.data.scheduleType,
      daysOfWeek:
        parsed.data.scheduleType === "WEEKLY"
          ? [...new Set(parsed.data.daysOfWeek ?? [])].sort((a, b) => a - b)
          : [],
      timeOfDay: parsed.data.timeOfDay,
      assigneeMode: parsed.data.assigneeMode,
      fixedAssigneeId: parsed.data.fixedAssigneeId,
      points: parsed.data.points ?? 3
    }
  });
  return res.status(201).json(routine);
});

app.get("/routines", async (req, res) => {
  const { homeId } = (req as HomeRequest).context;
  const routines = await prisma.routine.findMany({ where: { homeId }, orderBy: { createdAt: "desc" } });
  return res.json(routines);
});

app.post("/routines/:id/toggle", async (req, res) => {
  const { homeId, role } = (req as HomeRequest).context;
  if (role !== "OWNER") {
    return res.status(403).json({ error: "Only owner can toggle routines" });
  }
  const routine = await prisma.routine.findFirst({ where: { id: req.params.id, homeId } });
  if (!routine) {
    return res.status(404).json({ error: "Routine not found" });
  }
  const updated = await prisma.routine.update({
    where: { id: routine.id },
    data: { isActive: !routine.isActive }
  });
  return res.json(updated);
});

app.get("/today", async (req, res) => {
  const { homeId } = (req as HomeRequest).context;
  const scopeParsed = z.enum(["mine", "all"]).safeParse(req.query.scope ?? "all");
  if (!scopeParsed.success) {
    return zodBadRequest(res, scopeParsed);
  }
  const scope = scopeParsed.data;
  const home = await prisma.home.findUnique({ where: { id: homeId } });
  if (!home) {
    return res.status(404).json({ error: "Home not found" });
  }
  const dateParsed = ymdSchema.safeParse(String(req.query.date ?? ymdInTimezone(new Date(), home.timezone)));
  if (!dateParsed.success) {
    return zodBadRequest(res, dateParsed);
  }
  const dateYmd = dateParsed.data;
  await ensureTodayRoutineInstances(homeId, dateYmd);
  const start = localDateStart(dateYmd, home.timezone);
  const end = localDateEnd(dateYmd, home.timezone);
  const userId = (req as HomeRequest).user.id;

  const [tasks, routines, streak, userPoints] = await Promise.all([
    prisma.task.findMany({
      where: {
        homeId,
        OR: [{ dueDate: null }, { dueDate: { gte: start, lte: end } }],
        ...(scope === "mine" ? { assigneeId: userId } : {})
      },
      include: { assignee: { select: { id: true, firstName: true, username: true } } },
      orderBy: { createdAt: "desc" }
    }),
    prisma.routineInstance.findMany({
      where: {
        homeId,
        date: { gte: start, lte: end },
        ...(scope === "mine" ? { assigneeId: userId } : {})
      },
      include: {
        routine: true,
        assignee: { select: { id: true, firstName: true, username: true } }
      },
      orderBy: { createdAt: "asc" }
    }),
    prisma.streak.findUnique({ where: { homeId_date: { homeId, date: start } } }),
    prisma.scoreEvent.aggregate({
      where: { homeId, userId, createdAt: { gte: start, lte: end } },
      _sum: { points: true }
    })
  ]);
  const doneCount =
    tasks.filter((task) => task.status === TaskStatus.DONE).length + routines.filter((routine) => routine.isDone).length;
  const totalCount = tasks.length + routines.length;
  return res.json({
    date: dateYmd,
    tasks,
    routineInstances: routines,
    streakClosed: Boolean(streak),
    pointsToday: userPoints._sum.points ?? 0,
    doneCount,
    totalCount
  });
});

app.post("/routine-instances/:id/done", async (req, res) => {
  const { homeId } = (req as HomeRequest).context;
  const user = (req as HomeRequest).user;
  const instance = await prisma.routineInstance.findFirst({
    where: { id: req.params.id, homeId },
    include: { routine: true }
  });
  if (!instance) {
    return res.status(404).json({ error: "Routine instance not found" });
  }
  const updateResult = await prisma.routineInstance.updateMany({
    where: { id: instance.id, homeId, isDone: false },
    data: { isDone: true, doneAt: new Date(), doneById: user.id }
  });
  if (updateResult.count === 0) {
    return res.json({ ok: true, awarded: false });
  }
  const awarded = await awardPointsIdempotent({
    homeId,
    userId: user.id,
    sourceType: SourceType.ROUTINE,
    sourceId: instance.id,
    points: instance.routine.points
  });
  return res.json({ ok: true, ...awarded });
});

app.get("/scoreboard", async (req, res) => {
  const { homeId } = (req as HomeRequest).context;
  const period = req.query.period === "month" ? "month" : "week";
  const days = period === "month" ? 30 : 7;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const rows = await prisma.scoreEvent.groupBy({
    by: ["userId"],
    where: { homeId, createdAt: { gte: since } },
    _sum: { points: true },
    orderBy: { _sum: { points: "desc" } }
  });
  const users = await prisma.user.findMany({
    where: { id: { in: rows.map((r) => r.userId) } }
  });
  return res.json(
    rows.map((row) => ({
      userId: row.userId,
      name: users.find((u) => u.id === row.userId)?.firstName ?? users.find((u) => u.id === row.userId)?.username,
      points: row._sum.points ?? 0
    }))
  );
});

export default app;
