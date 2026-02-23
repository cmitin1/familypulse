import assert from "node:assert/strict";
import test from "node:test";
import {
  applyLlmFormattingWithFallback,
  buildDeterministicDigestText,
  pickTopFocusTasks,
  scoreTaskForDigest,
  type DigestContextV2
} from "./digest-v2.service.js";

function makeContext(overrides?: Partial<DigestContextV2>): DigestContextV2 {
  return {
    home: { name: "Тестовый дом", timezone: "Europe/Moscow" },
    digestMode: "on_demand",
    localNow: "2026-02-23 10:00",
    dateLabel: "Mon, 23 Feb",
    tasks: {
      openToday: 3,
      doneToday: 1,
      overdue: 1,
      dueSoon: 2,
      perAssignee: [{ name: "Аня", open: 2, dueToday: 1, overdue: 1 }],
      topFocus: [{ title: "Купить продукты", reason: "дедлайн сегодня", dueLabel: "сегодня", assignees: ["Аня"] }]
    },
    routines: { openToday: 2, doneToday: 1 },
    events: { today: ["Школа"], upcoming: ["Кружок"] },
    chat: {
      discussionHighlights: ["Обсудили покупки и дорогу в школу"],
      suggestionsPending: 2,
      suggestionsApproved: 1,
      suggestionsRejected: 0,
      topPendingSuggestions: [{ type: "TASK", title: "Купить молоко" }],
      lastRunAt: "2026-02-23T08:00:00.000Z",
      freshRun: true,
      recentErrors: 0
    },
    nextSteps: ["Начните с просроченной задачи.", "Проверьте AI Inbox."],
    ...overrides
  };
}

test("deterministic digest includes all sections when data is rich", () => {
  const text = buildDeterministicDigestText(makeContext());
  assert.match(text, /Сегодня в фокусе:/);
  assert.match(text, /Главное на сегодня/);
  assert.match(text, /По времени:/);
  assert.match(text, /Кому что:/);
  assert.match(text, /Что обсудили в чате:/);
  assert.match(text, /AI-предложения:/);
  assert.match(text, /Следующий шаг:/);
});

test("deterministic digest handles low-data context gracefully", () => {
  const text = buildDeterministicDigestText(
    makeContext({
      tasks: {
        openToday: 0,
        doneToday: 0,
        overdue: 0,
        dueSoon: 0,
        perAssignee: [],
        topFocus: []
      },
      chat: {
        discussionHighlights: [],
        suggestionsPending: 0,
        suggestionsApproved: 0,
        suggestionsRejected: 0,
        topPendingSuggestions: [],
        lastRunAt: null,
        freshRun: false,
        recentErrors: 1
      }
    })
  );
  assert.match(text, /Срочных задач нет/);
  assert.match(text, /Чат был спокойный/);
});

test("deterministic digest says when no AI suggestions", () => {
  const text = buildDeterministicDigestText(
    makeContext({
      chat: {
        discussionHighlights: [],
        suggestionsPending: 0,
        suggestionsApproved: 0,
        suggestionsRejected: 0,
        topPendingSuggestions: [],
        lastRunAt: null,
        freshRun: false,
        recentErrors: 0
      }
    })
  );
  assert.match(text, /Новых AI-кандидатов нет/);
});

test("ranking: overdue should rank above no-due task", () => {
  const nowStart = new Date("2026-02-23T00:00:00.000Z");
  const todayEnd = new Date("2026-02-23T23:59:59.000Z");
  const dueSoonEnd = new Date("2026-02-26T23:59:59.000Z");
  const overdue = scoreTaskForDigest({
    task: { title: "Просрочка", status: "OPEN", dueDate: new Date("2026-02-20T10:00:00.000Z"), assigneeNames: [] },
    nowStart,
    todayEnd,
    dueSoonEnd,
    recentSuggestionTitles: []
  });
  const noDue = scoreTaskForDigest({
    task: { title: "Без срока", status: "OPEN", dueDate: null, assigneeNames: [] },
    nowStart,
    todayEnd,
    dueSoonEnd,
    recentSuggestionTitles: []
  });
  assert.ok(overdue.score > noDue.score);
});

test("ranking: due today should rank above no-due task", () => {
  const nowStart = new Date("2026-02-23T00:00:00.000Z");
  const todayEnd = new Date("2026-02-23T23:59:59.000Z");
  const dueSoonEnd = new Date("2026-02-26T23:59:59.000Z");
  const ranked = pickTopFocusTasks({
    tasks: [
      { title: "Без срока", status: "OPEN", dueDate: null, assigneeNames: [] },
      { title: "Сделать сегодня", status: "OPEN", dueDate: new Date("2026-02-23T12:00:00.000Z"), assigneeNames: [] }
    ],
    nowStart,
    todayEnd,
    dueSoonEnd,
    recentSuggestionTitles: []
  });
  assert.equal(ranked[0]?.title, "Сделать сегодня");
});

test("ranking: duplicate-like titles should not flood top3", () => {
  const nowStart = new Date("2026-02-23T00:00:00.000Z");
  const todayEnd = new Date("2026-02-23T23:59:59.000Z");
  const dueSoonEnd = new Date("2026-02-26T23:59:59.000Z");
  const ranked = pickTopFocusTasks({
    tasks: [
      { title: "Купить молоко", status: "OPEN", dueDate: new Date("2026-02-23T10:00:00.000Z"), assigneeNames: [] },
      { title: "Купить молоко!", status: "OPEN", dueDate: new Date("2026-02-23T11:00:00.000Z"), assigneeNames: [] },
      { title: "Оплатить кружок", status: "OPEN", dueDate: new Date("2026-02-24T10:00:00.000Z"), assigneeNames: [] }
    ],
    nowStart,
    todayEnd,
    dueSoonEnd,
    recentSuggestionTitles: []
  });
  assert.equal(ranked.filter((row) => row.title.toLowerCase().includes("молоко")).length, 1);
});

test("LLM error falls back to deterministic text", async () => {
  const context = makeContext();
  const fallbackText = buildDeterministicDigestText(context);
  const result = await applyLlmFormattingWithFallback({
    context,
    fallbackText,
    enabled: true,
    formatter: async () => {
      throw new Error("llm unavailable");
    }
  });
  assert.equal(result.usedLlm, false);
  assert.equal(result.text, fallbackText);
});

