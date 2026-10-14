/**
 * Sidekick - AI System Directives & Prompt Templates
 * Enforces strict English-only communication, grounding, and structured formatting
 */

/**
 * Mandatory System Instruction applied to all Gemini calls
 */
export const SYSTEM_ENGLISH_DIRECTIVE = `You are Sidekick, a secure, human-in-the-loop in-browser AI copilot that assists users with reading, understanding, and safely acting on web pages.

MANDATORY LANGUAGE POLICY:
1. You MUST communicate, reason, summarize, explain, and draft EXCLUSIVELY in clear, natural, professional English.
2. Under NO circumstance should you output Hindi, Hinglish, or any other language.
3. Even if the user prompt is written in Hindi (e.g., "mujhe samjhao", "ye kya hai") or another language, you must understand their intent and respond ONLY in English.
4. Even if the underlying webpage or document contains Hindi or multilingual content, your answers, summaries, and explanations MUST be delivered strictly in English.
5. If the user asks you to translate content, always translate it into clear English. NEVER translate into Hindi.`;

/**
 * Build grounded page chat prompt
 * @param {object} params
 * @param {string} [params.pageTitle]
 * @param {string} [params.pageUrl]
 * @param {string} [params.pageContent]
 * @param {string} params.userQuery
 * @returns {string}
 */
export function buildChatPrompt({ pageTitle = "", pageUrl = "", pageContent = "", userQuery }) {
  const contextSnippet = pageContent && pageContent.trim().length > 0
    ? `PAGE CONTEXT:
Title: ${pageTitle}
URL: ${pageUrl}

<PAGE_CONTENT>
${pageContent.trim()}
</PAGE_CONTENT>

GROUNDING INSTRUCTIONS:
- Answer the user's question using the page content provided above.
- If the page content does not contain the answer, explicitly and clearly state: "This page does not contain that information." in English. Do not hallucinate or invent unlisted facts.
- Respond strictly in fluent English.`
    : `GENERAL BROWSER ASSISTANT:
Respond to the user's request strictly in fluent English.`;

  return `${contextSnippet}

USER REQUEST:
${userQuery}`;
}

/**
 * Build structured article summary prompt
 * @param {object} params
 * @param {string} params.articleTitle
 * @param {string} params.articleText
 * @param {"concise" | "detailed"} [params.detailLevel="concise"]
 * @returns {string}
 */
export function buildSummaryPrompt({ articleTitle = "", articleText, detailLevel = "concise" }) {
  const isDetailed = detailLevel === "detailed";

  return `Please generate a structured, easy-to-read summary of the following article strictly in clear English.

ARTICLE TITLE: ${articleTitle}

<ARTICLE_TEXT>
${articleText.trim()}
</ARTICLE_TEXT>

OUTPUT FORMAT REQUIREMENTS:
1. ## One-Line TL;DR
   A single, impactful sentence capturing the core thesis.
2. ## Key Takeaways
   ${isDetailed ? "7-10 comprehensive bullet points detailing key facts, data, arguments, and conclusions." : "Exactly 5 concise, actionable bullet points."}
3. ## What To Do Next / Actionable Insight
   1-2 concrete action items or takeaways for the reader.

CRITICAL: Respond exclusively in English. Do not include any Hindi or Hinglish phrases.`;
}

/**
 * Build YouTube video summary prompt
 * @param {object} params
 * @param {string} params.videoTitle
 * @param {string} [params.channelName]
 * @param {string} [params.description]
 * @param {string} [params.transcriptText]
 * @returns {string}
 */
export function buildYouTubeSummaryPrompt({ videoTitle, channelName = "", description = "", transcriptText = "" }) {
  return `Please generate a structured summary for this YouTube video strictly in clear English.

VIDEO TITLE: ${videoTitle}
CHANNEL: ${channelName}

VIDEO DESCRIPTION:
${description.slice(0, 1000)}

${transcriptText ? `TRANSCRIPT / TIMED CUES:\n${transcriptText.slice(0, 15000)}` : ""}

OUTPUT FORMAT:
1. ## Overview (TL;DR)
   A concise English summary of the video's main message.
2. ## Chapter Breakdowns & Key Points
   Bullet points covering main topics, including timestamps if available.
3. ## Main Conclusion / Action Items

CRITICAL: All output must be strictly in English.`;
}

/**
 * Build Explain in Plain English prompt
 * @param {object} params
 * @param {string} params.selectedText
 * @param {string} [params.tone="eli5"]
 * @returns {string}
 */
export function buildExplainPrompt({ selectedText, tone = "eli5" }) {
  return `Explain the following selected text in simple, clear, plain English (ELI5 - Explain Like I'm 5 style). Avoid dense jargon.

SELECTED TEXT:
"${selectedText.trim()}"

CRITICAL: Output must be strictly in plain English. Never output in Hindi or Hinglish.`;
}

/**
 * Build Translate to English prompt
 * @param {string} foreignText
 * @returns {string}
 */
export function buildTranslateToEnglishPrompt(foreignText) {
  return `Translate the following text into clear, fluent, natural English.

SOURCE TEXT:
"${foreignText.trim()}"

CRITICAL: Translate INTO English. The response must be entirely in English.`;
}
