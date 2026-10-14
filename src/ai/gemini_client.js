/**
 * Sidekick - Gemini API Client
 * Targets Google AI Studio REST endpoints with streaming and strict English enforcement
 */

import { getSettings, getApiKey } from "../shared/storage_utils.js";
import { SYSTEM_ENGLISH_DIRECTIVE } from "./prompt_templates.js";
import { validateEnglishResponse } from "./response_validator.js";

const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta";

/**
 * Standard content generation (non-streaming)
 * @param {object} options
 * @param {string} options.prompt
 * @param {string} [options.systemInstruction]
 * @param {string} [options.model]
 * @param {string} [options.apiKey]
 * @param {number} [options.temperature=0.7]
/**
 * Format inline base64 image data part for Gemini Multimodal API (Slice 8)
 * @param {string | { mimeType?: string, data: string }} imageData
 * @returns {object | null}
 */
export function formatInlineDataPart(imageData) {
  if (!imageData) return null;

  let mimeType = "image/png";
  let base64Data = imageData;

  if (typeof imageData === "object" && imageData.data) {
    mimeType = imageData.mimeType || imageData.mime_type || "image/png";
    base64Data = imageData.data;
  } else if (typeof imageData === "string") {
    const match = imageData.match(/^data:([^;]+);base64,(.+)$/);
    if (match) {
      mimeType = match[1];
      base64Data = match[2];
    }
  }

  return {
    inline_data: {
      mime_type: mimeType,
      data: base64Data
    }
  };
}

/**
 * Standard content generation (non-streaming, text or multimodal)
 * @param {object} options
 * @param {string} options.prompt
 * @param {string} [options.imageData] Base64 data URL or raw base64 PNG
 * @param {string} [options.systemInstruction]
 * @param {string} [options.model]
 * @param {string} [options.apiKey]
 * @param {number} [options.temperature=0.7]
 * @param {number} [options.maxOutputTokens=2048]
 * @returns {Promise<string>}
 */
export async function generateContent({
  prompt,
  imageData,
  systemInstruction = SYSTEM_ENGLISH_DIRECTIVE,
  model,
  apiKey,
  temperature = 0.7,
  maxOutputTokens = 2048
}) {
  const settings = await getSettings();
  const effectiveKey = apiKey || settings.geminiApiKey;
  const effectiveModel = model || settings.modelPreference || "gemini-3.5-flash-lite";

  if (!effectiveKey) {
    throw new Error("Gemini API key is not configured. Please open Settings and add your API key.");
  }

  const endpoint = `${GEMINI_API_BASE}/models/${effectiveModel}:generateContent?key=${effectiveKey.trim()}`;

  const parts = [{ text: prompt }];
  if (imageData) {
    const imagePart = formatInlineDataPart(imageData);
    if (imagePart) parts.push(imagePart);
  }

  const payload = {
    systemInstruction: {
      parts: [{ text: systemInstruction }]
    },
    contents: [
      {
        parts
      }
    ],
    generationConfig: {
      temperature,
      maxOutputTokens
    }
  };

  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
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
  const candidate = data.candidates?.[0];
  const responseText = candidate?.content?.parts?.[0]?.text || "";

  // Validate strict English rule
  const validation = validateEnglishResponse(responseText);
  if (!validation.valid) {
    console.warn("[Sidekick Gemini] Non-English output detected, auto-correcting:", validation.reason);
    return await correctToEnglish(responseText, effectiveKey, effectiveModel);
  }

  return responseText;
}

/**
 * Streaming content generation using Server-Sent Events (SSE, text or multimodal)
 * @param {object} options
 * @param {string} options.prompt
 * @param {string} [options.imageData] Base64 data URL or raw base64 PNG
 * @param {string} [options.systemInstruction]
 * @param {string} [options.model]
 * @param {string} [options.apiKey]
 * @param {number} [options.temperature=0.7]
 * @param {number} [options.maxOutputTokens=2048]
 * @param {(fullText: string, chunkText: string) => void} options.onChunk
 * @returns {Promise<string>} Full accumulated text
 */
export async function streamGenerateContent({
  prompt,
  imageData,
  systemInstruction = SYSTEM_ENGLISH_DIRECTIVE,
  model,
  apiKey,
  temperature = 0.7,
  maxOutputTokens = 2048,
  onChunk
}) {
  const settings = await getSettings();
  const effectiveKey = apiKey || settings.geminiApiKey;
  const effectiveModel = model || settings.modelPreference || "gemini-3.5-flash-lite";

  if (!effectiveKey) {
    throw new Error("Gemini API key is not configured. Please open Settings and add your API key.");
  }

  const endpoint = `${GEMINI_API_BASE}/models/${effectiveModel}:streamGenerateContent?alt=sse&key=${effectiveKey.trim()}`;

  const parts = [{ text: prompt }];
  if (imageData) {
    const imagePart = formatInlineDataPart(imageData);
    if (imagePart) parts.push(imagePart);
  }

  const payload = {
    systemInstruction: {
      parts: [{ text: systemInstruction }]
    },
    contents: [
      {
        parts
      }
    ],
    generationConfig: {
      temperature,
      maxOutputTokens
    }
  };

  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
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
    throw new Error("Streaming response body is unavailable.");
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
      buffer = lines.pop() || ""; // Keep any incomplete line

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith("data: ")) {
          const jsonStr = trimmed.slice(6).trim();
          if (jsonStr === "[DONE]") continue;

          try {
            const data = JSON.parse(jsonStr);
            const chunk = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
            if (chunk) {
              accumulatedText += chunk;
              if (onChunk && typeof onChunk === "function") {
                onChunk(accumulatedText, chunk);
              }
            }
          } catch {
            // Ignore incomplete SSE chunk parses
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  // Final verification for strict English policy
  const validation = validateEnglishResponse(accumulatedText);
  if (!validation.valid) {
    console.warn("[Sidekick Gemini] Streamed response violated English-only policy. Correcting.");
    return await correctToEnglish(accumulatedText, effectiveKey, effectiveModel);
  }

  return accumulatedText;
}

/**
 * Corrective pass to translate non-English response into English if needed
 * @param {string} rawText
 * @param {string} apiKey
 * @param {string} model
 * @returns {Promise<string>}
 */
async function correctToEnglish(rawText, apiKey, model) {
  const correctionPrompt = `Translate the following text completely and cleanly into natural English. Do not include any foreign characters or explanations:
"""
${rawText}
"""`;

  try {
    const corrected = await generateContent({
      prompt: correctionPrompt,
      systemInstruction: SYSTEM_ENGLISH_DIRECTIVE,
      apiKey,
      model,
      temperature: 0.2
    });
    return corrected;
  } catch (err) {
    console.error("[Sidekick Gemini] Auto-correction pass failed:", err);
    return rawText;
  }
}
