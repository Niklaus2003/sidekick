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
${pageContent.trim().slice(0, 20000)}
</PAGE_CONTENT>

GROUNDING DIRECTIVES:
1. Answer the user's question using ONLY the facts, figures, and context provided in <PAGE_CONTENT> above.
2. If the page content does NOT contain the answer, or if the user asks an unrelated question not discussed on this page (such as general trivia, unrelated geography, or external world facts), you MUST explicitly state: "This page does not contain that information." in English.
3. Under no circumstance should you hallucinate, speculate, or bring in external knowledge not present in the page content.
4. Respond strictly in fluent, natural English.`
    : `GENERAL BROWSER ASSISTANT:
Respond to the user's request strictly in fluent English.`;

  return `${contextSnippet}

USER QUESTION:
${userQuery}`;
}

/**
 * Build structured article summary prompt (Slice 3 & Slice 5)
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

MODE: ${isDetailed ? "DETAILED (Comprehensive In-Depth Analysis)" : "CONCISE (Fast Executive Summary)"}

OUTPUT FORMAT REQUIREMENTS:
1. ## One-Line TL;DR
   A single, impactful, high-level thesis sentence capturing the core essence.
2. ## Key Takeaways
   ${
     isDetailed
       ? "8 to 10 detailed, comprehensive bullet points detailing specific facts, data, arguments, background context, and nuanced conclusions."
       : "Exactly 5 concise, high-impact bullet points focusing strictly on essential facts."
   }
3. ## What To Do Next / Actionable Insight
   ${
     isDetailed
       ? "2 to 3 practical, concrete next steps, implementations, or workflow recommendations."
       : "1 to 2 concise action items for the reader."
   }

LANGUAGE & SAFETY POLICY:
- Respond EXCLUSIVELY in natural, fluent English.
- If the original article is written in a foreign language (e.g. Hindi, Spanish, French, German, Japanese, Chinese), you MUST translate all concepts cleanly into English.
- Under NO circumstance should any Hindi, Hinglish, or non-English characters appear in the output.`;
}

/**
 * Build YouTube video chapter summary prompt (Slice 4 & Slice 5)
 * @param {object} params
 * @param {string} params.videoTitle
 * @param {string} [params.channelName]
 * @param {string} [params.duration]
 * @param {string} [params.description]
 * @param {Array<{ timestamp: string, title: string }>} [params.chapters]
 * @param {string} [params.transcriptText]
 * @param {"concise" | "detailed"} [params.detailLevel="concise"]
 * @returns {string}
 */
export function buildYouTubeSummaryPrompt({
  videoTitle,
  channelName = "",
  duration = "",
  description = "",
  chapters = [],
  transcriptText = "",
  detailLevel = "concise"
}) {
  const isDetailed = detailLevel === "detailed";

  const chapterList =
    chapters && chapters.length > 0
      ? `KNOWN VIDEO CHAPTERS:\n${chapters.map((c) => `[${c.timestamp}] ${c.title}`).join("\n")}`
      : "";

  return `Please generate a structured, chronological chapter summary for this YouTube video strictly in clear English.

VIDEO TITLE: ${videoTitle}
CHANNEL: ${channelName}
${duration ? `DURATION: ${duration}` : ""}

${chapterList}

VIDEO DESCRIPTION:
${description.slice(0, 1500)}

${transcriptText ? `TRANSCRIPT & CUES:\n${transcriptText.slice(0, 15000)}` : ""}

MODE: ${isDetailed ? "DETAILED" : "CONCISE"}

OUTPUT FORMAT:
1. ## One-Line TL;DR
   A single clear sentence summarizing the entire video.
2. ## Chapter Breakdowns & Key Moments
   Chronological bullet points with clickable timestamp tags formatted strictly as [MM:SS] (or [HH:MM:SS]) followed by the takeaway.
   Example:
   * **[01:15]** Core problem statement and background overview.
   * **[04:30]** Key demonstration and architecture breakdown.
   ${isDetailed ? "Provide 7-10 detailed timestamped moments covering the entire duration." : "Provide 4-6 key timestamped moments."}
3. ## What To Do Next / Main Conclusion
   1-2 concrete action items or practical takeaways from the video.

CRITICAL LANGUAGE RULE:
- All output must be strictly in English. Translate any foreign speech, captions, or descriptions completely into English.
- Use the exact bracketed timestamp format [MM:SS] so viewers can navigate directly to key moments.`;
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
 * Build Translate to English prompt (Slice 7)
 * @param {string | object} params
 * @returns {string}
 */
export function buildTranslatePrompt(params) {
  const text = typeof params === "string" ? params : (params?.selectedText || "");
  return buildTranslateToEnglishPrompt(text);
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

CRITICAL: Translate INTO English. The response must be entirely in English. Never output in Hindi, Hinglish, or any foreign script.`;
}

/**
 * Build Draft a Professional Reply prompt (Slice 7)
 * @param {object} params
 * @param {string} params.selectedText
 * @param {string} [params.tone="professional"]
 * @returns {string}
 */
export function buildDraftReplyPrompt({ selectedText, tone = "professional" }) {
  return `Draft a polite, concise, and professional reply in English to the following message, comment, or email.

ORIGINAL MESSAGE:
"${selectedText.trim()}"

REQUIREMENTS:
- Draft polished, context-appropriate replies strictly in English.
- Provide 2 distinct options:
  1. **Option 1 (Concise & Direct)**: A brief, professional reply.
  2. **Option 2 (Detailed & Collaborative)**: A slightly more comprehensive, warm reply.
- Never output in Hindi, Hinglish, or any foreign script.`;
}
