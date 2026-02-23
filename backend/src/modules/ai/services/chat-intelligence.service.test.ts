import assert from "node:assert/strict";
import test from "node:test";
import { ChatIntelligenceService } from "./chat-intelligence.service.js";

test("chat intelligence returns validated parsed result", async () => {
  const service = new ChatIntelligenceService({
    isConfigured: () => true,
    chatCompletion: async () => ({
      content: JSON.stringify({
        summary: "Обсуждали закупку и встречу",
        suggestions: [
          {
            type: "event",
            title: "Поход к врачу",
            description: null,
            confidence: 0.7,
            assignee: { mode: "all", userHints: ["все"] },
            time: { dueAtText: null, startAtText: "завтра 10:00", endAtText: "завтра 11:00" },
            sourceMessageIds: [201]
          }
        ]
      }),
      raw: {},
      inputTokens: 10,
      outputTokens: 20,
      costUsd: 0.001
    })
  } as any);

  const result = await service.extract({
    chatTitle: "Семья",
    messages: [
      {
        telegramMessageId: 201,
        telegramUserId: "1",
        senderName: "Мама",
        username: "mama",
        text: "Давайте завтра к врачу в 10:00",
        sentAt: new Date("2026-01-01T10:00:00.000Z")
      }
    ]
  });

  assert.equal(result.parsed.summary.length > 0, true);
  assert.equal(result.parsed.suggestions[0]?.type, "event");
});
