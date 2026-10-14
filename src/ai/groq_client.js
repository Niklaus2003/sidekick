/**
 * Sidekick - Groq API Client (Primary Provider)
 * High-speed inference using open-weight models on Groq LPUs with strict English guardrails
 */

import { getSettings } from "../shared/storage_utils.js";
import { SYSTEM_ENGLISH_DIRECTIVE } from "./prompt_templates.js";
import { validateEnglishResponse } from "./response_validator.js";

const GROQ_API_BASE = "https://api.groq.com/openai/v1";
export const DEFAULT_GROQ_MODEL = "openai/gpt-oss-120b";

/**
 * Standard content generation via Groq (non-streaming)
 * @param {object} options
 * @param {string} options.prompt
 * @param {string} [options.systemInstruction]
 * @param {string} [options.model]
 * @param {string} [options.apiKey]
 * @param {number} [options.temperature=0.7]
 * @param {number} [options.maxTokens=2048]
 * @returns {Promise<string>}
 */
export async function generateGroqContent({
  prompt,
  systemInstruction = SYSTEM_ENGLISH_DIRECTIVE,
  model,
  apiKey,
  temperature = 0.7,
  maxTokens = 2048
}) {
  const settings = await getSettings();
  const effectiveKey = apiKey || settings.groqApiKey;
  const effectiveModel = model || settings.groqModel || DEFAULT_GROQ_MODEL;

  if (!effectiveKey) {
    throw new Error("Groq API key is not configured. Please add your Groq key in Settings.");
  }

  const endpoint = `${GROQ_API_BASE}/chat/completions`;

  const payload = {
    model: effectiveModel,
    messages: [
      { role: "system", content: systemInstruction },
      { role: "user", content: prompt }
    ],
    temperature,
    max_tokens: maxTokens,
    stream: false
  };

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${effectiveKey.trim()}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const errorMessage = errorData.error?.message || `HTTP ${response.status}: ${response.statusText}`;
    const err = new Error(errorMessage);
    err.status = response.status;
    throw err;
  }

  const data = await response.json();
  const responseText = data.choices?.[0]?.message?.content || "";

  // Validate strict English rule
  const validation = validateEnglishResponse(responseText);
  if (!validation.valid) {
    console.warn("[Sidekick Groq] Non-English output detected, reason:", validation.reason);
  }

  return responseText;
}

/**
 * Streaming content generation via Groq using Server-Sent Events (SSE)
 * @param {object} options
 * @param {string} options.prompt
 * @param {string} [options.systemInstruction]
 * @param {string} [options.model]
 * @param {string} [options.apiKey]
 * @param {number} [options.temperature=0.7]
 * @param {number} [options.maxTokens=2048]
 * @param {(fullText: string, chunkText: string) => void} options.onChunk
 * @returns {Promise<string>}
 */
export async function streamGroqContent({
  prompt,
  systemInstruction = SYSTEM_ENGLISH_DIRECTIVE,
  model,
  apiKey,
  temperature = 0.7,
  maxTokens = 2048,
  onChunk
}) {
  const settings = await getSettings();
  const effectiveKey = apiKey || settings.groqApiKey;
  const effectiveModel = model || settings.groqModel || DEFAULT_GROQ_MODEL;

  if (!effectiveKey) {
    throw new Error("Groq API key is not configured. Please add your Groq key in Settings.");
  }

  const endpoint = `${GROQ_API_BASE}/chat/completions`;

  const payload = {
    model: effectiveModel,
    messages: [
      { role: "system", content: systemInstruction },
      { role: "user", content: prompt }
    ],
    temperature,
    max_tokens: maxTokens,
    stream: true
  };

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${effectiveKey.trim()}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const errorMessage = errorData.error?.message || `HTTP ${response.status}: ${response.statusText}`;
    const err = new Error(errorMessage);
    err.status = response.status;
    throw err;
  }

  if (!response.body) {
    throw new Error("Streaming response body from Groq is unavailable.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let accumulatedText = "";
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith("data: ")) {
          const jsonStr = trimmed.slice(6).trim();
          if (jsonStr === "[DONE]") continue;

          try {
            const data = JSON.parse(jsonStr);
            const chunk = data.choices?.[0]?.delta?.content || "";
            if (chunk) {
              accumulatedText += chunk;
              if (onChunk && typeof onChunk === "function") {
                onChunk(accumulatedText, chunk);
              }
            }
          } catch {
            // Incomplete JSON chunk, will be parsed on next read
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  return accumulatedText;
}
