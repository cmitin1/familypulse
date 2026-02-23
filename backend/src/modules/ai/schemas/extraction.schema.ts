import { z } from "zod";

export const extractionSuggestionSchema = z.object({
  type: z.enum(["task", "event", "question"]),
  title: z.string().trim().min(1),
  description: z.string().trim().nullable().optional(),
  confidence: z.number().min(0).max(1).optional(),
  assignee: z
    .object({
      mode: z.enum(["single", "all", "unassigned"]).default("unassigned"),
      userHints: z.array(z.string().trim().min(1)).default([])
    })
    .default({ mode: "unassigned", userHints: [] }),
  time: z
    .object({
      dueAtText: z.string().trim().nullable().optional(),
      startAtText: z.string().trim().nullable().optional(),
      endAtText: z.string().trim().nullable().optional()
    })
    .default({ dueAtText: null, startAtText: null, endAtText: null }),
  sourceMessageIds: z.array(z.number().int().positive()).default([])
});

export const extractionResultSchema = z.object({
  summary: z.string().trim().default(""),
  suggestions: z.array(extractionSuggestionSchema).default([])
});

export type ExtractionResult = z.infer<typeof extractionResultSchema>;
export type ExtractionSuggestion = z.infer<typeof extractionSuggestionSchema>;
