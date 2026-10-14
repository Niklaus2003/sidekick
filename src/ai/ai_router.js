/**
 * Sidekick - AI Provider Router
 * Primary: Groq (openai/gpt-oss-120b) for ultra-fast, uncensored inference
 * Fallback: Gemini (gemini-3.5-flash-lite) for backup resilience
 */

import { streamGroqContent, generateGroqContent } from "./groq_client.js";
import { streamGenerateContent, generateContent } from "./gemini_client.js";
import { getSettings } from "../shared/storage_utils.js";
import { SYSTEM_ENGLISH_DIRECTIVE } from "./prompt_templates.js";

/**
 * Unified streaming generator with automatic Groq -> Gemini fallback
 * @param {object} options
 * @param {string} options.prompt
 * @param {string} [options.systemInstruction=SYSTEM_ENGLISH_DIRECTIVE]
 * @param {string} [options.groqModel]
 * @param {string} [options.geminiModel]
 * @param {(fullText: string, chunkText: string) => void} options.onChunk
 * @param {(provider: "groq" | "gemini", reason?: string) => void} [options.onProviderChange]
 * @returns {Promise<{ text: string, provider: "groq" | "gemini" }>}
 */
export async function streamAiContent({
  prompt,
  systemInstruction = SYSTEM_ENGLISH_DIRECTIVE,
  groqModel,
  geminiModel,
  onChunk,
  onProviderChange
}) {
  const settings = await getSettings();
  const hasGroqKey = Boolean(settings.groqApiKey && settings.groqApiKey.trim());
  const hasGeminiKey = Boolean(settings.geminiApiKey && settings.geminiApiKey.trim());

  // 1. Try Primary: Groq
  if (hasGroqKey) {
    try {
      if (onProviderChange) onProviderChange("groq");
      const text = await streamGroqContent({
        prompt,
        systemInstruction,
        model: groqModel || settings.groqModel || "openai/gpt-oss-120b",
        apiKey: settings.groqApiKey,
        onChunk
      });
      return { text, provider: "groq" };
    } catch (groqErr) {
      console.warn("[Sidekick Router] Groq failed, attempting Gemini fallback:", groqErr.message);

      if (hasGeminiKey) {
        if (onProviderChange) {
          onProviderChange("gemini", `Groq: ${groqErr.message}. Falling back to Gemini.`);
        }
        const text = await streamGenerateContent({
          prompt,
          systemInstruction,
          model: geminiModel || settings.modelPreference || "gemini-3.5-flash-lite",
          apiKey: settings.geminiApiKey,
          onChunk
        });
        return { text, provider: "gemini" };
      } else {
        throw new Error(`Groq request failed (${groqErr.message}) and no Gemini backup key is configured.`);
      }
    }
  }

  // 2. If no Groq key, fall back directly to Gemini
  if (hasGeminiKey) {
    if (onProviderChange) {
      onProviderChange("gemini", "Operating on Gemini fallback (No Groq key configured).");
    }
    const text = await streamGenerateContent({
      prompt,
      systemInstruction,
      model: geminiModel || settings.modelPreference || "gemini-3.5-flash-lite",
      apiKey: settings.geminiApiKey,
      onChunk
    });
    return { text, provider: "gemini" };
  }

  throw new Error("No API key configured. Please configure your Groq API key in Settings.");
}

/**
 * Unified non-streaming generator with automatic Groq -> Gemini fallback
 * @param {object} options
 * @param {string} options.prompt
 * @param {string} [options.systemInstruction=SYSTEM_ENGLISH_DIRECTIVE]
 * @param {string} [options.groqModel]
 * @param {string} [options.geminiModel]
 * @returns {Promise<{ text: string, provider: "groq" | "gemini" }>}
 */
export async function generateAiContent({
  prompt,
  systemInstruction = SYSTEM_ENGLISH_DIRECTIVE,
  groqModel,
  geminiModel
}) {
  const settings = await getSettings();
  const hasGroqKey = Boolean(settings.groqApiKey && settings.groqApiKey.trim());
  const hasGeminiKey = Boolean(settings.geminiApiKey && settings.geminiApiKey.trim());

  if (hasGroqKey) {
    try {
      const text = await generateGroqContent({
        prompt,
        systemInstruction,
        model: groqModel || settings.groqModel || "openai/gpt-oss-120b",
        apiKey: settings.groqApiKey
      });
      return { text, provider: "groq" };
    } catch (groqErr) {
      console.warn("[Sidekick Router] Groq failed, attempting Gemini fallback:", groqErr.message);
      if (hasGeminiKey) {
        const text = await generateContent({
          prompt,
          systemInstruction,
          model: geminiModel || settings.modelPreference || "gemini-3.5-flash-lite",
          apiKey: settings.geminiApiKey
        });
        return { text, provider: "gemini" };
      }
      throw groqErr;
    }
  }

  if (hasGeminiKey) {
    const text = await generateContent({
      prompt,
      systemInstruction,
      model: geminiModel || settings.modelPreference || "gemini-3.5-flash-lite",
      apiKey: settings.geminiApiKey
    });
    return { text, provider: "gemini" };
  }

  throw new Error("No API key configured. Please configure your Groq API key in Settings.");
}
