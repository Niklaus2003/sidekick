/**
 * Sidekick - AI Response Validator
 * Enforces strict English-only output and JSON extraction rules
 */

// Devanagari Unicode Range: U+0900 to U+097F
const DEVANAGARI_REGEX = /[\u0900-\u097F]/;

/**
 * Checks if a string contains any Devanagari (Hindi) characters
 * @param {string} text
 * @returns {boolean}
 */
export function containsDevanagari(text) {
  if (!text || typeof text !== "string") return false;
  return DEVANAGARI_REGEX.test(text);
}

/**
 * Validates that an LLM response conforms to the strict English-only policy
 * @param {string} text
 * @returns {{ valid: boolean, reason?: string }}
 */
export function validateEnglishResponse(text) {
  if (!text || typeof text !== "string") {
    return { valid: false, reason: "Response is empty or invalid" };
  }

  if (containsDevanagari(text)) {
    return {
      valid: false,
      reason: "Response contains Devanagari (Hindi) script, violating the English-only policy."
    };
  }

  return { valid: true };
}

/**
 * Extracts and parses JSON from model output, handling markdown code fences
 * @param {string} text
 * @returns {any | null}
 */
export function extractJsonFromText(text) {
  if (!text || typeof text !== "string") return null;

  let cleaned = text.trim();

  // Strip markdown code fences if present: ```json ... ``` or ``` ... ```
  const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenceMatch && fenceMatch[1]) {
    cleaned = fenceMatch[1].trim();
  } else {
    // If no clean fences, look for the outermost { ... } or [ ... ]
    const firstBrace = cleaned.indexOf("{");
    const lastBrace = cleaned.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      cleaned = cleaned.slice(firstBrace, lastBrace + 1);
    }
  }

  try {
    return JSON.parse(cleaned);
  } catch (err) {
    console.warn("[Sidekick Validator] JSON parse failed on text:", text, err);
    return null;
  }
}
