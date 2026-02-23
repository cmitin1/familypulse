import { config } from "../../../config.js";

type OpenRouterUsage = {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
};

type OpenRouterResponse = {
  id?: string;
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
  usage?: OpenRouterUsage;
};

type ChatCompletionInput = {
  systemPrompt: string;
  userPrompt: string;
  model: string;
  timeoutMs?: number;
};

const DEFAULT_TIMEOUT_MS = 20_000;
const MAX_ATTEMPTS = 2;

function timeoutSignal(timeoutMs: number): AbortSignal {
  const controller = new AbortController();
  setTimeout(() => controller.abort(), timeoutMs).unref?.();
  return controller.signal;
}

function parseCostUsd(usage?: OpenRouterUsage): number | null {
  if (!usage?.total_tokens) {
    return null;
  }
  const roughCost = (usage.total_tokens / 1000) * 0.0005;
  return Number.isFinite(roughCost) ? roughCost : null;
}

export class OpenRouterService {
  isConfigured(): boolean {
    return Boolean(config.openrouterApiKey);
  }

  async chatCompletion(input: ChatCompletionInput): Promise<{
    content: string;
    raw: OpenRouterResponse;
    inputTokens: number | null;
    outputTokens: number | null;
    costUsd: number | null;
  }> {
    if (!config.openrouterApiKey) {
      throw new Error("OPENROUTER_API_KEY is not configured");
    }

    const url = `${config.openrouterBaseUrl.replace(/\/$/, "")}/chat/completions`;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      try {
        const response = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${config.openrouterApiKey}`
          },
          body: JSON.stringify({
            model: input.model,
            response_format: { type: "json_object" },
            messages: [
              { role: "system", content: input.systemPrompt },
              { role: "user", content: input.userPrompt }
            ]
          }),
          signal: timeoutSignal(input.timeoutMs ?? DEFAULT_TIMEOUT_MS)
        });

        if (!response.ok) {
          const body = await response.text();
          throw new Error(`OpenRouter HTTP ${response.status}: ${body.slice(0, 300)}`);
        }

        const raw = (await response.json()) as OpenRouterResponse;
        const content = raw.choices?.[0]?.message?.content?.trim() ?? "";
        if (!content) {
          throw new Error("OpenRouter returned empty content");
        }
        return {
          content,
          raw,
          inputTokens: raw.usage?.prompt_tokens ?? null,
          outputTokens: raw.usage?.completion_tokens ?? null,
          costUsd: parseCostUsd(raw.usage)
        };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error("Unknown OpenRouter error");
        if (attempt < MAX_ATTEMPTS) {
          await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
        }
      }
    }

    throw lastError ?? new Error("OpenRouter request failed");
  }
}
