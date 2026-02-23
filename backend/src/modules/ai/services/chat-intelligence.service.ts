import { extractionResultSchema, type ExtractionResult } from "../schemas/extraction.schema.js";
import { OpenRouterService } from "./openrouter.service.js";
import { config } from "../../../config.js";

type MessageInput = {
  telegramMessageId: number;
  telegramUserId: string | null;
  senderName: string | null;
  username: string | null;
  text: string | null;
  sentAt: Date;
};

const MAX_MESSAGE_TEXT_CHARS = 800;

const SYSTEM_PROMPT = `Ты анализируешь сообщения семейного чата и извлекаешь только полезные actionable items для FamilyPulse.
Возвращай ТОЛЬКО JSON по заданной схеме:
{
  "summary": "string",
  "suggestions": [
    {
      "type": "task | event | question",
      "title": "string",
      "description": "string | null",
      "confidence": 0.0,
      "assignee": {
        "mode": "single | all | unassigned",
        "userHints": ["string"]
      },
      "time": {
        "dueAtText": "string | null",
        "startAtText": "string | null",
        "endAtText": "string | null"
      },
      "sourceMessageIds": [123]
    }
  ]
}
Правила:
- Не выдумывай факты, даты и исполнителей.
- Для task обязательно предлагай исполнителя:
  - если явно неясно кто — mode=all.
- Если задача для всех — mode=all.
- Если обсуждение про совместную активность с датой/временем — event.
- Если вопрос без решения — question.
- Извлекай только items, по которым можно действовать.
- Избегай дублей в suggestions.
- sourceMessageIds используй только из переданного списка сообщений.
- Для task обязательно предлагай срок:
  - если явной даты нет, предложи реалистичный ближайший дедлайн (например завтра вечером) в dueAtText.
- Пиши summary кратко и на русском.`;

function toUserPrompt(input: { chatTitle?: string | null; messages: MessageInput[] }): string {
  const lines = input.messages.map((message) => {
    const author = message.senderName || message.username || message.telegramUserId || "unknown";
    const textRaw = message.text ?? "";
    const text =
      textRaw.length > MAX_MESSAGE_TEXT_CHARS ? `${textRaw.slice(0, MAX_MESSAGE_TEXT_CHARS)}…[truncated]` : textRaw;
    return `[${message.telegramMessageId}] ${message.sentAt.toISOString()} ${author}: ${text}`;
  });
  return [
    `promptVersion=${config.aiChatPromptVersion}`,
    `chatTitle=${input.chatTitle ?? "семейный чат"}`,
    "messages:",
    lines.join("\n")
  ].join("\n");
}

export class ChatIntelligenceService {
  constructor(private readonly openRouterService = new OpenRouterService()) {}

  isConfigured(): boolean {
    return this.openRouterService.isConfigured();
  }

  async extract(input: { chatTitle?: string | null; messages: MessageInput[] }): Promise<{
    parsed: ExtractionResult;
    rawResponse: unknown;
    inputTokens: number | null;
    outputTokens: number | null;
    costUsd: number | null;
  }> {
    const response = await this.openRouterService.chatCompletion({
      systemPrompt: SYSTEM_PROMPT,
      userPrompt: toUserPrompt(input),
      model: config.openrouterModelExtract
    });
    const rawJson = JSON.parse(response.content);
    const parsed = extractionResultSchema.parse(rawJson);
    return {
      parsed,
      rawResponse: response.raw,
      inputTokens: response.inputTokens,
      outputTokens: response.outputTokens,
      costUsd: response.costUsd
    };
  }
}
