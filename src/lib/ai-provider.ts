import "server-only";

type GenerateOptions = {
  provider: "gemini" | "typhoon";
  apiKey: string;
  model: string;
  system: string;
  input: string;
  maxTokens: number;
  schema?: Record<string, unknown>;
};

function object(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function providerError(message: string, status: number) {
  return Object.assign(new Error(message), { status });
}

export async function generateAIText(options: GenerateOptions): Promise<string> {
  const { provider, apiKey, model, system, input, maxTokens, schema } = options;

  if (provider === "gemini") {
    const { GoogleGenAI } = await import("@google/genai");
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.interactions.create({
      model,
      store: false,
      system_instruction: system,
      input,
      response_format: schema
        ? { type: "text", mime_type: "application/json", schema }
        : undefined,
      generation_config: { max_output_tokens: maxTokens },
    }, { maxRetries: 0, timeout: 90_000 });

    return response.output_text?.trim() ?? "";
  }

  // No automatic retries or fallback to a different provider.
  // JSON is requested in the prompt; the route validates every result before saving.
  let response: Response;
  let raw: string;
  try {
    response = await fetch("https://api.opentyphoon.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "system",
            content: schema
              ? `${system}\nตอบเป็น JSON object เท่านั้น ไม่ใส่กรอบโค้ดหรือคำอธิบาย และต้องตรงกับ JSON Schema นี้:\n${JSON.stringify(schema)}`
              : system,
          },
          { role: "user", content: input },
        ],
        max_tokens: maxTokens,
        temperature: 0.6,
        stream: false,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(90_000),
    });
    // Read once, including error responses, to avoid consuming the body twice.
    raw = await response.text();
  } catch (error) {
    if (error instanceof Error && /TimeoutError|AbortError/.test(error.name)) {
      throw providerError("Typhoon request timed out", 504);
    }
    throw error;
  }

  let payload: Record<string, unknown>;
  try {
    payload = object(JSON.parse(raw));
  } catch {
    throw providerError("Typhoon returned a non-JSON response", response.ok ? 502 : response.status);
  }

  if (!response.ok) {
    const error = object(payload.error);
    throw providerError(
      typeof error.message === "string" ? error.message : `Typhoon HTTP ${response.status}`,
      response.status,
    );
  }

  const choice = object(Array.isArray(payload.choices) ? payload.choices[0] : undefined);
  if (choice.finish_reason === "length") {
    throw providerError("AI_OUTPUT_TRUNCATED", 502);
  }
  const content = object(choice.message).content;
  if (typeof content !== "string") return "";

  const output = content.trim();
  // Accept one enclosing Markdown fence, but never extract JSON from arbitrary prose.
  const fenced = schema ? /^```(?:json)?\s*\n([\s\S]*?)\n```$/i.exec(output) : null;
  return fenced ? fenced[1].trim() : output;
}
