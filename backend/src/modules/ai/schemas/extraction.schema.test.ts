import assert from "node:assert/strict";
import test from "node:test";
import { extractionResultSchema } from "./extraction.schema.js";

test("extraction schema accepts valid payload", () => {
  const result = extractionResultSchema.parse({
    summary: "Краткая сводка",
    suggestions: [
      {
        type: "task",
        title: "Купить молоко",
        description: "До вечера",
        confidence: 0.82,
        assignee: { mode: "single", userHints: ["мама"] },
        time: { dueAtText: "сегодня 19:00", startAtText: null, endAtText: null },
        sourceMessageIds: [101, 102]
      }
    ]
  });
  assert.equal(result.suggestions.length, 1);
  assert.equal(result.suggestions[0]?.type, "task");
});

test("extraction schema rejects wrong type", () => {
  assert.throws(() =>
    extractionResultSchema.parse({
      summary: "x",
      suggestions: [
        {
          type: "note",
          title: "test",
          assignee: { mode: "unassigned", userHints: [] },
          time: { dueAtText: null, startAtText: null, endAtText: null },
          sourceMessageIds: [1]
        }
      ]
    })
  );
});
