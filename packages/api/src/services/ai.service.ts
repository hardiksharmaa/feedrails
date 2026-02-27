import Groq from "groq-sdk";
import dotenv from "dotenv";

dotenv.config();

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

type Sentiment = "POSITIVE" | "NEUTRAL" | "NEGATIVE";

interface Analysis {
  sentiment: Sentiment;
  tags: string[];
  urgencyScore: number;
  summary: string;
}

interface BatchAnalysisItem extends Analysis {
  id: string;
}

const FALLBACK_ANALYSIS: Analysis = {
  sentiment: "NEUTRAL",
  tags: ["general feedback"],
  urgencyScore: 5,
  summary: "User shared feedback that requires review.",
};

function clampUrgency(value: unknown): number {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return FALLBACK_ANALYSIS.urgencyScore;
  return Math.max(1, Math.min(10, Math.round(numericValue)));
}

function normalizeSentiment(value: unknown): Sentiment {
  const normalized = String(value ?? "").trim().toUpperCase();
  if (normalized === "POSITIVE" || normalized === "NEUTRAL" || normalized === "NEGATIVE") {
    return normalized;
  }
  return FALLBACK_ANALYSIS.sentiment;
}

function normalizeTags(value: unknown): string[] {
  if (!Array.isArray(value)) return FALLBACK_ANALYSIS.tags;

  const cleaned = value
    .map((tag) => String(tag).trim())
    .filter((tag) => tag.length > 0)
    .slice(0, 6);

  return cleaned.length > 0 ? cleaned : FALLBACK_ANALYSIS.tags;
}

function normalizeSummary(value: unknown): string {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text.length > 0 ? text : FALLBACK_ANALYSIS.summary;
}

function toAnalysis(payload: unknown): Analysis {
  const record = (payload && typeof payload === "object" ? payload : {}) as Record<string, unknown>;

  return {
    sentiment: normalizeSentiment(record.sentiment),
    tags: normalizeTags(record.tags),
    urgencyScore: clampUrgency(record.urgencyScore),
    summary: normalizeSummary(record.summary),
  };
}

function extractJsonBlock(text: string): string {
  const withoutFences = text.replace(/```json|```/gi, "").trim();
  const firstBrace = withoutFences.indexOf("{");
  const lastBrace = withoutFences.lastIndexOf("}");

  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return withoutFences.slice(firstBrace, lastBrace + 1);
  }

  return withoutFences;
}

function parseJsonSafely(raw: string): unknown {
  const candidate = extractJsonBlock(raw);
  const variants = [
    candidate,
    candidate.replace(/}\s*}$/, "}"),
    candidate.replace(/\\n\s*}\s*}$/, "\\n\"}"),
    candidate.replace(/\\n\s*}$/, "\\n\"}"),
  ];

  for (const variant of variants) {
    try {
      return JSON.parse(variant);
    } catch {
      continue;
    }
  }

  throw new Error("AI response JSON parsing failed");
}

function parseAnalysisHeuristically(raw: string): Analysis {
  const text = extractJsonBlock(raw);

  const sentimentMatch = text.match(/"sentiment"\s*:\s*"(POSITIVE|NEUTRAL|NEGATIVE)"/i);
  const urgencyMatch = text.match(/"urgencyScore"\s*:\s*(\d{1,2})/i);
  const tagsMatch = text.match(/"tags"\s*:\s*\[([\s\S]*?)\]/i);

  const summaryClosedMatch = text.match(/"summary"\s*:\s*"([\s\S]*?)"\s*(,|})/i);
  const summaryOpenMatch = text.match(/"summary"\s*:\s*"([\s\S]*)$/i);
  const rawSummary = summaryClosedMatch?.[1] ?? summaryOpenMatch?.[1] ?? "";

  const cleanedSummary = rawSummary
    .replace(/\\n/g, " ")
    .replace(/\\"/g, '"')
    .replace(/}\s*}$/, "")
    .replace(/}\s*$/, "")
    .replace(/\s+/g, " ")
    .trim();

  const parsedTags = (tagsMatch?.[1] ?? "")
    .match(/"([^"]+)"/g)
    ?.map((tag) => tag.replace(/^"|"$/g, "").trim())
    .filter((tag) => tag.length > 0);

  return {
    sentiment: normalizeSentiment(sentimentMatch?.[1]),
    tags: normalizeTags(parsedTags),
    urgencyScore: clampUrgency(urgencyMatch?.[1]),
    summary: normalizeSummary(cleanedSummary),
  };
}

function getFailedGeneration(error: unknown): string | null {
  if (!error || typeof error !== "object") return null;

  const outer = error as {
    error?: {
      error?: {
        failed_generation?: string;
      };
    };
  };

  return outer.error?.error?.failed_generation ?? null;
}

function getRetryDelayMs(error: unknown): number {
  if (!error || typeof error !== 'object') {
    return 0;
  }

  const message = String((error as { message?: unknown }).message ?? '');
  if (!message.includes('rate_limit_exceeded')) {
    return 0;
  }

  const match = message.match(/Please try again in\s*([0-9.]+)s/i);
  const seconds = match ? Number(match[1]) : 2;
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return 2000;
  }

  return Math.min(Math.ceil(seconds * 1000) + 300, 10000);
}

function sleep(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function toBatchAnalysis(payload: unknown): BatchAnalysisItem[] {
  const record = (payload && typeof payload === 'object' ? payload : {}) as {
    items?: Array<Record<string, unknown>>;
  };

  const items = Array.isArray(record.items) ? record.items : [];
  return items
    .map((item) => {
      const id = String(item.id ?? '').trim();
      if (!id) {
        return null;
      }
      const base = toAnalysis(item);
      return { id, ...base } satisfies BatchAnalysisItem;
    })
    .filter((item): item is BatchAnalysisItem => item !== null);
}

export class AiService {
  static async analyzeFeedback(content: string) {
    try {
      console.log("Requesting AI Synthesis from Groq (Llama 3)...");
      
      const chatCompletion = await groq.chat.completions.create({
        messages: [
          {
            role: "system",
            content: `You are a customer feedback analyzer. Return a strict JSON object with no markdown and no extra text.
            JSON Schema:
            {
              "sentiment": "POSITIVE" | "NEUTRAL" | "NEGATIVE",
              "tags": string[],
              "urgencyScore": number (1-10),
              "summary": string (1 sentence)
            }
            Rules:
            - Ensure valid JSON syntax.
            - Do not include trailing braces, comments, or code fences.
            - Keep summary concise in one sentence.`
          },
          {
            role: "user",
            content: `Analyze this review: "${content}"`
          }
        ],
        model: "llama-3.3-70b-versatile",
        response_format: { type: "json_object" },
        temperature: 0.1, 
      });

      const responseText = chatCompletion.choices[0].message.content;
      if (!responseText) throw new Error("Empty response from AI");

      return toAnalysis(parseJsonSafely(responseText));
    } catch (error: any) {
      console.error("Groq AI Error:", error.message);

      const failedGeneration = getFailedGeneration(error);
      if (failedGeneration) {
        try {
          console.warn("Recovering from Groq json_validate_failed response.");
          return toAnalysis(parseJsonSafely(failedGeneration));
        } catch (recoveryError: any) {
          console.error("Failed to recover AI output:", recoveryError.message);
          console.warn("Using heuristic extraction for malformed AI response.");
          return parseAnalysisHeuristically(failedGeneration);
        }
      }

      console.warn("Falling back to default analysis due to unrecoverable AI response.");
      return FALLBACK_ANALYSIS;
    }
  }

  static async analyzeFeedbackBatch(items: Array<{ id: string; content: string }>) {
    if (items.length === 0) {
      return [] as BatchAnalysisItem[];
    }

    const safeItems = items.slice(0, 10).map((item) => ({
      id: item.id,
      content: String(item.content ?? '').trim(),
    }));

    let lastError: unknown = null;

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        console.log(`Requesting Groq batch synthesis for ${safeItems.length} feedback items...`);

        const chatCompletion = await groq.chat.completions.create({
          messages: [
            {
              role: 'system',
              content: `You analyze customer feedback in batches. Return strict JSON with no markdown.
              JSON Schema:
              {
                "items": [
                  {
                    "id": string,
                    "sentiment": "POSITIVE" | "NEUTRAL" | "NEGATIVE",
                    "tags": string[],
                    "urgencyScore": number (1-10),
                    "summary": string (1 sentence)
                  }
                ]
              }
              Rules:
              - Include every input id exactly once.
              - Valid JSON only.
              - Keep summary concise in one sentence.`
            },
            {
              role: 'user',
              content: JSON.stringify({ items: safeItems }),
            },
          ],
          model: 'llama-3.3-70b-versatile',
          response_format: { type: 'json_object' },
          temperature: 0.1,
        });

        const responseText = chatCompletion.choices[0].message.content;
        if (!responseText) {
          throw new Error('Empty response from AI');
        }

        const parsed = toBatchAnalysis(parseJsonSafely(responseText));
        const lookup = new Map(parsed.map((item) => [item.id, item]));

        return safeItems.map((item) => {
          const result = lookup.get(item.id);
          if (result) {
            return result;
          }

          return {
            id: item.id,
            ...FALLBACK_ANALYSIS,
          } satisfies BatchAnalysisItem;
        });
      } catch (error: any) {
        lastError = error;
        console.error('Groq Batch AI Error:', error.message);

        const retryDelayMs = getRetryDelayMs(error);
        if (retryDelayMs > 0 && attempt < 2) {
          await sleep(retryDelayMs);
          continue;
        }

        break;
      }
    }

    const failedGeneration = getFailedGeneration(lastError);
    if (failedGeneration) {
      try {
        const parsed = toBatchAnalysis(parseJsonSafely(failedGeneration));
        const lookup = new Map(parsed.map((item) => [item.id, item]));
        return safeItems.map((item) => lookup.get(item.id) ?? { id: item.id, ...FALLBACK_ANALYSIS });
      } catch {
        return safeItems.map((item) => ({ id: item.id, ...FALLBACK_ANALYSIS }));
      }
    }

    return safeItems.map((item) => ({ id: item.id, ...FALLBACK_ANALYSIS }));
  }
}