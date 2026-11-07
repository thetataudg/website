// lib/ai/groq.ts
// The smallest possible Groq client: one JSON-mode chat completion with a
// timeout. Returns null when there is no key, the call fails or the reply is
// not JSON, so every caller treats AI as optional.
import logger from "@/lib/logger";

const ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";
const DEFAULT_MODEL = "openai/gpt-oss-20b";

export function groqEnabled(): boolean {
  return Boolean(process.env.GROQ_API_KEY);
}

export async function groqJson<T = unknown>(
  system: string,
  user: string,
  opts: { timeoutMs?: number; maxTokens?: number } = {}
): Promise<T | null> {
  const key = process.env.GROQ_API_KEY;
  if (!key) return null;
  const model = process.env.GROQ_MODEL || DEFAULT_MODEL;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 10_000);
  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      signal: controller.signal,
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        temperature: 0.1,
        max_tokens: opts.maxTokens ?? 1200,
        // gpt-oss reasons before answering; keep that short for a sorter.
        ...(model.startsWith("openai/gpt-oss") ? { reasoning_effort: "low" } : {}),
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });
    if (!res.ok) {
      logger.warn({ status: res.status }, "Groq request failed");
      return null;
    }
    const json: any = await res.json();
    const content = json?.choices?.[0]?.message?.content;
    return typeof content === "string" ? (JSON.parse(content) as T) : null;
  } catch (err: any) {
    logger.warn({ err: err?.name === "AbortError" ? "timeout" : err?.message }, "Groq request errored");
    return null;
  } finally {
    clearTimeout(timer);
  }
}
