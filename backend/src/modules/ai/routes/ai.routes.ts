import { AiSuggestionStatus, AiSuggestionType } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import type { HomeRequest } from "../../../middleware.js";
import { AiSuggestionService } from "../services/ai-suggestion.service.js";
import { AiSummaryService } from "../services/ai-summary.service.js";
import { AiAnalysisJobService } from "../services/ai-analysis.job.js";
import { config } from "../../../config.js";

const router = Router();
const suggestionService = new AiSuggestionService();
const summaryService = new AiSummaryService();
const analysisJobService = new AiAnalysisJobService();

const listQuerySchema = z.object({
  status: z.enum(["pending", "approved", "rejected", "ignored"]).optional(),
  type: z.enum(["task", "event", "question"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
  cursor: z.string().min(1).optional()
});

function mapStatus(status: "pending" | "approved" | "rejected" | "ignored" | undefined) {
  if (!status) return undefined;
  if (status === "approved") return AiSuggestionStatus.APPROVED;
  if (status === "rejected") return AiSuggestionStatus.REJECTED;
  if (status === "ignored") return AiSuggestionStatus.IGNORED;
  return AiSuggestionStatus.PENDING;
}

function mapType(type: "task" | "event" | "question" | undefined) {
  if (!type) return undefined;
  if (type === "event") return AiSuggestionType.EVENT;
  if (type === "question") return AiSuggestionType.QUESTION;
  return AiSuggestionType.TASK;
}

function aiGuard(req: HomeRequest, res: any): boolean {
  if (!config.aiFeatureEnabled) {
    res.status(400).json({ error: "AI-модуль отключен" });
    return false;
  }
  return true;
}

router.get("/suggestions", async (req, res) => {
  if (!aiGuard(req as HomeRequest, res)) return;
  const parsed = listQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid query", details: parsed.error.flatten() });
  }
  const ctx = (req as HomeRequest).context;
  const rows = await suggestionService.list(ctx.homeId, {
    status: mapStatus(parsed.data.status),
    type: mapType(parsed.data.type),
    limit: parsed.data.limit,
    cursor: parsed.data.cursor
  });
  return res.json(rows);
});

async function setSuggestionStatus(req: HomeRequest, res: any, status: AiSuggestionStatus) {
  if (!aiGuard(req as HomeRequest, res)) return;
  const approveOverrideSchema = z.object({
    dueDate: z.string().datetime().nullable().optional(),
    assigneeIds: z.array(z.string().min(1)).optional()
  });
  const parsedOverride = approveOverrideSchema.safeParse(req.body ?? {});
  if (!parsedOverride.success) {
    return res.status(400).json({ error: "Invalid payload", details: parsedOverride.error.flatten() });
  }
  const updated = await suggestionService.setStatus({
    homeId: req.context.homeId,
    suggestionId: req.params.id,
    status,
    approvedByUserId: req.user.id,
    taskOverride:
      status === AiSuggestionStatus.APPROVED
        ? {
            dueDate:
              parsedOverride.data.dueDate !== undefined
                ? parsedOverride.data.dueDate
                  ? new Date(parsedOverride.data.dueDate)
                  : null
                : undefined,
            assigneeIds:
              parsedOverride.data.assigneeIds !== undefined
                ? [...new Set(parsedOverride.data.assigneeIds)]
                : undefined
          }
        : undefined
  });
  if (!updated) {
    return res.status(404).json({ error: "Suggestion not found" });
  }
  return res.json(updated);
}

router.post("/suggestions/:id/approve", async (req, res) =>
  setSuggestionStatus(req as HomeRequest, res, AiSuggestionStatus.APPROVED)
);
router.post("/suggestions/:id/reject", async (req, res) =>
  setSuggestionStatus(req as HomeRequest, res, AiSuggestionStatus.REJECTED)
);
router.post("/suggestions/:id/ignore", async (req, res) =>
  setSuggestionStatus(req as HomeRequest, res, AiSuggestionStatus.IGNORED)
);

router.post("/suggestions/refresh", async (req, res) => {
  if (!aiGuard(req as HomeRequest, res)) return;
  const ctx = req as HomeRequest;
  const result = await analysisJobService.runManualAnalysisForHome({
    homeId: ctx.context.homeId,
    userId: ctx.user.id
  });

  if (!result.ok) {
    const statusCode =
      result.status === "no_connections"
        ? 409
        : result.status === "disabled" || result.status === "misconfigured"
          ? 400
          : 500;
    return res.status(statusCode).json(result);
  }
  return res.json(result);
});

router.get("/summary/today", async (req, res) => {
  if (!aiGuard(req as HomeRequest, res)) return;
  const ctx = (req as HomeRequest).context;
  const user = (req as HomeRequest).user;
  const payload = await summaryService.buildTodaySummary(ctx.homeId, user.id);
  return res.json(payload);
});

router.get("/summary/digest", async (req, res) => {
  if (!aiGuard(req as HomeRequest, res)) return;
  const schema = z.object({ hours: z.coerce.number().int().min(1).max(168).default(24) });
  const parsed = schema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid query", details: parsed.error.flatten() });
  }
  const ctx = (req as HomeRequest).context;
  const payload = await summaryService.buildDigest(ctx.homeId, parsed.data.hours);
  return res.json(payload);
});

export default router;
