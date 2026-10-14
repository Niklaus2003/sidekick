/**
 * Sidekick - AI Provider Router & Free-Tier Fallback Engine (Slice 9)
 * Features:
 * - Exponential backoff (1s, 2s) on HTTP 429 (Too Many Requests) or quota exhaustion
 * - Automatic failover between Groq (Primary) and Gemini (Fallback)
 * - Multimodal visual routing (Slice 8) to Gemini Flash
 * - Non-intrusive status callbacks for UI warning badges
 */

import { streamGroqContent, generateGroqContent } from "./groq_client.js";
import { streamGenerateContent, generateContent } from "./gemini_client.js";
import { getSettings } from "../shared/storage_utils.js";
import { SYSTEM_ENGLISH_DIRECTIVE } from "./prompt_templates.js";

const DEFAULT_GROQ_MODEL = "openai/gpt-oss-120b";
const DEFAULT_GEMINI_MODEL = "gemini-3.5-flash-lite";

/**
 * Sleep helper for exponential backoff
 * @param {number} ms
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Helper to determine if an error is a rate limit (HTTP 429) or quota exhaustion
 * @param {any} err
 * @returns {boolean}
 */
export function isRateLimitError(err) {
  if (!err) return false;
  if (err.status === 429) return true;

  const msg = (err.message || "").toLowerCase();
  return (
    msg.includes("429") ||
    msg.includes("rate limit") ||
    msg.includes("rate_limit") ||
    msg.includes("quota") ||
    msg.includes("resource_exhausted") ||
    msg.includes("too many requests")
  );
}

/**
 * Execute an AI request with exponential backoff for rate limits
 * @template T
 * @param {() => Promise<T>} fn
 * @param {string} providerName
 * @param {number} [maxRetries=1]
 * @returns {Promise<T>}
 */
async function executeWithBackoff(fn, providerName, maxRetries = 1) {
  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (err) {
      if (isRateLimitError(err) && attempt < maxRetries) {
        attempt++;
        const backoffMs = attempt * 1000; // 1s, 2s
        console.warn(`[Sidekick Router] ${providerName} rate-limited (HTTP 429). Retrying in ${backoffMs}ms... (Attempt ${attempt}/${maxRetries})`);
        await sleep(backoffMs);
        continue;
      }
      throw err;
    }
  }
}

/**
 * Streaming content generator with rate-limit resilience and automatic Groq <-> Gemini failover
 * @param {object} options
 * @param {string} options.prompt
 * @param {string} [options.imageData] Optional base64 screenshot for multimodal visual Q&A
 * @param {string} [options.systemInstruction=SYSTEM_ENGLISH_DIRECTIVE]
 * @param {string} [options.groqModel]
 * @param {string} [options.geminiModel]
 * @param {(fullText: string, chunkText: string) => void} options.onChunk
 * @param {(provider: "groq" | "gemini", reason?: string, isRateLimit?: boolean) => void} [options.onProviderChange]
 * @returns {Promise<{ text: string, provider: "groq" | "gemini", isFallback?: boolean }>}
 */
export async function streamAiContent({
  prompt,
  imageData,
  systemInstruction = SYSTEM_ENGLISH_DIRECTIVE,
  groqModel,
  geminiModel,
  onChunk,
  onProviderChange
}) {
  const settings = await getSettings();
  const hasGroqKey = Boolean(settings.groqApiKey && settings.groqApiKey.trim());
  const hasGeminiKey = Boolean(settings.geminiApiKey && settings.geminiApiKey.trim());

  // Visual Multimodal Query (Slice 8): Route to Gemini Flash (image support)
  if (imageData) {
    if (!hasGeminiKey) {
      throw new Error("Visual multimodal queries require a Google AI Studio Gemini API key configured in Settings.");
    }

    if (onProviderChange) {
      onProviderChange("gemini", "Analyzing visual screen capture with Gemini Flash...", false);
    }

    try {
      const text = await executeWithBackoff(
        () =>
          streamGenerateContent({
            prompt,
            imageData,
            systemInstruction,
            model: geminiModel || settings.modelPreference || DEFAULT_GEMINI_MODEL,
            apiKey: settings.geminiApiKey,
            onChunk
          }),
        "Gemini Multimodal",
        1
      );
      return { text, provider: "gemini" };
    } catch (err) {
      console.error("[Sidekick Router] Gemini multimodal visual query error:", err);
      throw new Error(`Visual analysis failed: ${err.message}`);
    }
  }

  // Text Query: Try Primary (Groq LPU) with automatic failover to Gemini
  if (hasGroqKey) {
    try {
      if (onProviderChange) onProviderChange("groq", "Streaming via Groq LPU...", false);

      const text = await executeWithBackoff(
        () =>
          streamGroqContent({
            prompt,
            systemInstruction,
            model: groqModel || settings.groqModel || DEFAULT_GROQ_MODEL,
            apiKey: settings.groqApiKey,
            onChunk
          }),
        "Groq",
        1
      );

      return { text, provider: "groq" };
    } catch (groqErr) {
      const isRateLimit = isRateLimitError(groqErr);
      const failReason = isRateLimit
        ? "Operating on Gemini fallback due to Groq rate limit (429)"
        : `Operating on Gemini fallback (Groq: ${groqErr.message})`;

      console.warn("[Sidekick Router] Groq failed, switching to Gemini:", failReason);

      if (hasGeminiKey) {
        if (onProviderChange) {
          onProviderChange("gemini", failReason, isRateLimit);
        }

        try {
          const text = await executeWithBackoff(
            () =>
              streamGenerateContent({
                prompt,
                systemInstruction,
                model: geminiModel || settings.modelPreference || DEFAULT_GEMINI_MODEL,
                apiKey: settings.geminiApiKey,
                onChunk
              }),
            "Gemini Fallback",
            1
          );

          return { text, provider: "gemini", isFallback: true };
        } catch (geminiErr) {
          throw new Error(`Both Groq (${groqErr.message}) and Gemini fallback (${geminiErr.message}) failed.`);
        }
      } else {
        throw new Error(
          isRateLimit
            ? "Groq rate limit exceeded (HTTP 429) and no Gemini fallback key is configured. Please add a Gemini key in Settings."
            : `Groq request failed: ${groqErr.message}`
        );
      }
    }
  }

  // If no Groq key, use Gemini directly
  if (hasGeminiKey) {
    if (onProviderChange) {
      onProviderChange("gemini", "Operating on Gemini (No Groq key configured)", false);
    }

    try {
      const text = await executeWithBackoff(
        () =>
          streamGenerateContent({
            prompt,
            systemInstruction,
            model: geminiModel || settings.modelPreference || DEFAULT_GEMINI_MODEL,
            apiKey: settings.geminiApiKey,
            onChunk
          }),
        "Gemini",
        1
      );

      return { text, provider: "gemini" };
    } catch (geminiErr) {
      if (isRateLimitError(geminiErr)) {
        throw new Error("Gemini rate limit exceeded (HTTP 429). Please configure a Groq key in Settings for automatic free-tier failover.");
      }
      throw geminiErr;
    }
  }

  throw new Error("No API credentials configured. Please open Settings and enter your Groq or Gemini API key.");
}

/**
 * Non-streaming content generator with rate-limit resilience and automatic failover
 * @param {object} options
 * @param {string} options.prompt
 * @param {string} [options.imageData]
 * @param {string} [options.systemInstruction=SYSTEM_ENGLISH_DIRECTIVE]
 * @param {string} [options.groqModel]
 * @param {string} [options.geminiModel]
 * @returns {Promise<{ text: string, provider: "groq" | "gemini", isFallback?: boolean }>}
 */
export async function generateAiContent({
  prompt,
  imageData,
  systemInstruction = SYSTEM_ENGLISH_DIRECTIVE,
  groqModel,
  geminiModel
}) {
  const settings = await getSettings();
  const hasGroqKey = Boolean(settings.groqApiKey && settings.groqApiKey.trim());
  const hasGeminiKey = Boolean(settings.geminiApiKey && settings.geminiApiKey.trim());

  if (imageData) {
    if (!hasGeminiKey) throw new Error("Visual analysis requires a Gemini API key.");
    const text = await executeWithBackoff(
      () =>
        generateContent({
          prompt,
          imageData,
          systemInstruction,
          model: geminiModel || settings.modelPreference || DEFAULT_GEMINI_MODEL,
          apiKey: settings.geminiApiKey
        }),
      "Gemini Multimodal",
      1
    );
    return { text, provider: "gemini" };
  }

  if (hasGroqKey) {
    try {
      const text = await executeWithBackoff(
        () =>
          generateGroqContent({
            prompt,
            systemInstruction,
            model: groqModel || settings.groqModel || DEFAULT_GROQ_MODEL,
            apiKey: settings.groqApiKey
          }),
        "Groq",
        1
      );
      return { text, provider: "groq" };
    } catch (groqErr) {
      if (hasGeminiKey) {
        console.warn("[Sidekick Router] Groq failed, switching to Gemini:", groqErr.message);
        const text = await executeWithBackoff(
          () =>
            generateContent({
              prompt,
              systemInstruction,
              model: geminiModel || settings.modelPreference || DEFAULT_GEMINI_MODEL,
              apiKey: settings.geminiApiKey
            }),
          "Gemini Fallback",
          1
        );
        return { text, provider: "gemini", isFallback: true };
      }
      throw groqErr;
    }
  }

  if (hasGeminiKey) {
    const text = await executeWithBackoff(
      () =>
        generateContent({
          prompt,
          systemInstruction,
          model: geminiModel || settings.modelPreference || DEFAULT_GEMINI_MODEL,
          apiKey: settings.geminiApiKey
        }),
      "Gemini",
      1
    );
    return { text, provider: "gemini" };
  }

  throw new Error("No API key configured. Please add your Groq or Gemini key in Settings.");
}
