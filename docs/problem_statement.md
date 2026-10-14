# Problem Statement: Sidekick — The Human-in-the-Loop Browser AI Agent

## 1. Project Overview

Build **Sidekick**, a Chrome side-panel AI agent that can understand the page currently open in the browser and help the user act on it safely.

Sidekick should be able to:

- Summarise articles and public YouTube videos strictly in clear, well-structured English.

- Chat with the current web page and answer only from the page context, strictly in English.

- Explain, translate foreign content into English, or draft replies from selected page content.

- Read visible screen content through screenshot-based questions.

- Detect interactive elements such as buttons, links, inputs, dropdowns, and checkboxes.

- Turn those elements into a numbered action map that an AI model can reason about.

- Execute browser actions only after the user approves each step.

- Remember a local user profile and reuse it for forms, drafts, and saved one-click skills.

- Enforce a strict English-only communication policy: Sidekick must always respond in English and never in Hindi or Hinglish, regardless of page language or user input language.

- Apply safety rules that prevent risky actions on sensitive pages or fields.

- Run locally as a Chrome extension using free-tier tools wherever possible.

The project must be completed in 4 weeks and should result in a safe, installable Chrome extension that can be shared through a public GitHub release.

## 2. Problem Statement

Most AI assistants can explain information, but they are separated from the browser context where users actually work. Users still need to copy text into a chatbot, explain what page they are viewing, identify which field or button matters, and manually carry out every browser step.

More capable browser agents can automate these tasks, but they may be paid, unavailable to some users, or too autonomous for actions that involve personal information or consequential clicks.

The goal of Sidekick is to create a user-controlled browser agent that combines understanding and action while keeping the user firmly in charge.

Sidekick must understand the current page, reason about visible and interactive content, propose one action at a time, and wait for explicit approval before acting. It communicates exclusively in English and never outputs responses in Hindi or Hinglish. It must also include privacy and safety restrictions so it does not operate on sensitive pages or enter protected information.

## 3. Primary Goal

At the end of four weeks, a user should be able to open Sidekick in the Chrome side panel on a supported page and do the following:

- 1. Ask Sidekick to summarise the current article or a public YouTube link in English.

- 2. Rely on strict English-only responses across all agent interactions (never Hindi or Hinglish).

- 3. Ask follow-up questions about the page and receive grounded English answers.

- 4. Use quick actions such as Explain, Translate to English, and Draft a reply.

- 5. Ask questions about visible non-text content using a screenshot.

- 6. Give Sidekick a browser task such as filling a practice form or finding information.

- 7. Review the next proposed action and choose Approve, Skip, or Stop.

- 8. Let Sidekick perform only the approved browser action.

- 9. See a log of the actions that were proposed and performed.

- 10. Reuse locally stored profile information and saved skills.

Sidekick is not intended to be a fully autonomous browser bot. It is an assistive agent the user controls.

## 4. Target Platform and Core Stack

### Browser

- Google Chrome on desktop.

- Chrome Extension Manifest V3.

- Chrome Side Panel API.

- Chrome content scripts and `chrome.scripting` for page interaction.

- `chrome.tabs.captureVisibleTab` for screen capture.

- `chrome.contextMenus` for right-click actions.

- `chrome.storage.local` for local memory and preferences.

### Development Environment

- Cursor as the primary code editor and AI-assisted development environment.

### AI and Content Processing

- Gemini Flash-Lite as the default everyday model.

- Gemini Flash for harder image or reasoning tasks when needed.

- Groq free tier as a text-only fallback when appropriate.

- Gemini public YouTube link input for supported public YouTube content.

- Mozilla `Readability.js` for extracting readable article content.

- System prompt guardrails enforcing strict English-only outputs across all models.

### Distribution

- GitHub repository.

- GitHub Releases for an installable extension ZIP.

- GitHub Pages for a simple project landing page.

## 5. Four-Week Build Plan

### Week 1 - The Eyes: Read the Web

#### Objective

Create the Chrome extension foundation and give Sidekick the ability to read and summarise web content strictly in English.

#### Required Features

##### 1. Chrome Extension Foundation

Create a Manifest V3 Chrome extension containing:

- Extension manifest.

- Side-panel interface.

- Background service worker.

- Settings area for the user's Gemini API key.

- Ability to load the project through Chrome's "Load unpacked" flow.

##### 2. First AI Interaction

The user should be able to select text on a page and ask Sidekick to explain it in plain English.

The result should be displayed inside the side panel.

##### 3. Article Summarisation

Use `Readability.js` to extract the useful article content while excluding navigation, advertisements, footers, and other page noise.

Generate a structured summary in English containing:

- One-line TL;DR.

- Five key points.

- What to do next.

##### 4. Public YouTube Summarisation

For a supported public YouTube link, Sidekick should provide a useful structured English summary.

Where supported, the result should include chapter-style notes with clickable timestamps that jump to the relevant moment.

Private or unsupported YouTube content is outside the required scope.

##### 5. Strict English-Only Response Enforcement

Sidekick must communicate and respond exclusively in English:

- Enforce system-prompt level rules ensuring all responses, summaries, and explanations are generated strictly in English.

- The agent must never output responses in Hindi or Hinglish, even if the source webpage or user prompt contains Hindi or other languages.

- Provide tone/detail controls (e.g., Concise vs. Detailed summary) while keeping all outputs strictly in English.

#### Week 1 Acceptance Criteria

Week 1 is complete when:

- The extension loads successfully in Chrome.

- The side panel opens next to a normal webpage.

- The API key can be entered through extension settings rather than hard-coded.

- Selected text can be explained by the AI in English.

- A normal article can be summarised into the required structured English format.

- A supported public YouTube link can be summarised in English.

- Strict English-only response rule is verified (no Hindi or Hinglish output under any circumstance).

#### Optional Stretch Goal

If the device supports Chrome's built-in AI requirements, add on-device/offline article summarisation as an optional enhancement. This is not required for the core build.

---

### Week 2 - The Brain: Understand the Page and the Screen

#### Objective

Turn the side panel into a context-aware assistant that can reason about the current page and visible screen content, responding strictly in English.

#### Required Features

##### 1. Page Chat

Add a chat interface that uses the current page as context.

The assistant must:

- Answer questions using the page content, responding strictly in English.

- Avoid inventing information that is not present on the page.

- Clearly say in English when the answer is not available from the current page.

- Keep conversation history for the active interaction.

- Stream responses into the side panel when supported.

##### 2. Right-Click AI Actions

Add Chrome context-menu actions for selected text:

- **Explain this** - simplify jargon or dense text in plain English.

- **Translate to English** - translate foreign or non-English page content into clear, readable English (strictly never output Hindi).

- **Draft a reply** - create a professional reply in English for content such as an email, LinkedIn post, or forum message.

All results should open in or be sent to the Sidekick side panel.

##### 3. Screenshot-and-Ask

Allow the user to capture the visible browser tab and ask a question about visual content such as:

- Charts.

- Diagrams.

- Error messages.

- Forms.

- Other visible content that cannot be understood from extracted text alone.

The user should be able to focus the request on the relevant part of the screen before it is sent to the model, and the AI must respond in English.

##### 4. Free-Tier Resilience

Sidekick must fail gracefully when model limits are reached.

Required behaviour:

- Detect rate-limit responses such as HTTP 429.

- Wait and retry where appropriate.

- Use the lighter model by default.

- Switch to a stronger Gemini model only when needed.

- Use a text-only fallback provider for eligible text tasks.

- Show a helpful error state in English instead of crashing.

#### Week 2 Acceptance Criteria

Week 2 is complete when:

- The user can chat with the current page in English.

- Answers remain grounded in page content.

- Explain, Translate to English, and Draft a reply work from the right-click menu.

- The user can ask a question about a visible screenshot and receive an English response.

- Model errors and rate limits do not crash the extension.

---

### Week 3 - The Hands: Act With User Approval

#### Objective

Give Sidekick controlled computer-use capabilities without allowing it to act autonomously.

#### Required Features

##### 1. Interactive Element Scanner

Create a content script that scans the current page for interactive elements including:

- Buttons.

- Links.

- Text inputs.

- Text areas.

- Dropdowns.

- Checkboxes.

- Other supported user-action elements.

Assign each detected element a stable number for the current page state.

##### 2. Numbered Action Map

Display numbered badges over detected interactive elements.

Create a compact structured representation of those elements for the AI so the model reasons over a concise action map instead of raw page HTML.

##### 3. Find It for Me

Allow the user to ask a navigation question in English, such as:

> "Where do I upload my resume?"

Sidekick should identify the most relevant numbered element and highlight it without taking the action automatically.

The model response for element selection should use strict structured JSON.

##### 4. Agent Loop

Implement a one-step-at-a-time agent loop:

- 1. Read the current page state.

- 2. Build or refresh the action map.

- 3. Ask the AI for the single next action.

- 4. Receive that action as strict JSON.

- 5. Show the proposed action and reason in English to the user.

- 6. Wait for the user to choose Approve, Skip, or Stop.

- 7. Execute only an approved action.

- 8. Read the updated page state.

- 9. Repeat until the task is complete or stopped.

Supported action types should include:

- `click`

- `type`

- `select`

- `scroll`

- `done`

Each proposed action should include at least:

- Action type.

- Target element number when applicable.

- Required value when applicable.

- One-line reason (in English).

##### 5. Agent Controls

The agent must include:

- Maximum step limit.

- Stop button (immediate kill switch).

- Skip action.

- Dry-run mode that highlights the intended element without acting.

- Progress persistence so a paused approval flow is not lost when the extension background worker sleeps.

- Action log containing the proposed step, reason (in English), and user decision.

##### 6. Practice Tasks

The agent should be capable of completing controlled practice tasks such as:

- Filling a multi-step internship application from a short instruction.

- Searching a practice shop and applying filters.

- Collecting information from multiple pages into a table.

#### Week 3 Acceptance Criteria

Week 3 is complete when:

- Interactive elements are detected and numbered reliably on supported pages.

- Sidekick can identify the correct element from a natural-language English request.

- The next action is returned in strict JSON.

- No browser action happens before explicit user approval.

- Approve, Skip, Stop, step limit, and dry-run controls work.

- The agent survives normal service-worker sleep by saving progress.

- An action log is preserved for the task.

- Sidekick can complete at least two supported practice errands with approval at every step.

---

### Week 4 - Memory, Safety, and Shipping

#### Objective

Make Sidekick personal, reusable, safe, and installable by other users.

#### Required Features

##### 1. Local Profile Memory

Create a user profile stored only on the user's machine using `chrome.storage.local`.

The profile may contain fields such as:

- Name.

- College / Institution.

- Skills.

- Links.

- Preferred tone (e.g. Concise, Detailed, Professional — strictly in English).

Use this profile when relevant for:

- Filling supported forms.

- Drafting replies in English.

- Personalising common workflows.

##### 2. One-Click Skills

Allow the user to save reusable prompt recipes that can run on the current page.

Example skills include:

- Exam notes (structured English study notes).

- Explain in plain English (ELI5 summary).

- Reply to this email politely (English draft).

- Fill this form from my profile.

Skills should be exportable and importable as a small local JSON file.

##### 3. Safety Rails

Sidekick must include explicit safety restrictions.

Required rules:

- Block agent actions on banking, payment, checkout, and financial pages.

- Never type into password fields.

- Never type into OTP / 2FA fields.

- Never type card or payment information.

- Require an additional confirmation before consequential buttons such as Submit, Pay, or Send.

- Provide an immediate kill switch / Stop control.

- Enforce strict English-only outputs; reject any generation or translation in Hindi or Hinglish.

- Keep API keys out of the public GitHub repository.

- Do not send private or sensitive pages to the free-tier model.

- Restrict agent errands to the provided practice environment or pages the user owns/controls.

- Do not automate logins, payments, or OTP workflows.

##### 4. Public Packaging

Prepare Sidekick so another user can install and understand it.

Required outputs:

- Public GitHub repository.

- Clean README with setup and feature overviews.

- Setup instructions.

- Screenshots showing the extension and its key features.

- GitHub Release ZIP that can be installed with "Load unpacked".

- One-page GitHub Pages landing site.

#### Week 4 Acceptance Criteria

Week 4 is complete when:

- User profile memory works locally.

- Saved skills can be created and reused in English.

- Skills can be exported and imported.

- Restricted pages and protected fields are blocked.

- Consequential actions require extra confirmation.

- The API key is not committed to the repository.

- Strict English response policy is verified across all features.

- The project can be installed by another user from the release package.

- The repository contains clear setup and usage documentation.

- A simple public landing page exists.

---

## 6. Functional Requirements

### FR-1: Side Panel Interface
Sidekick must run primarily inside the Chrome side panel and remain accessible while the user navigates and works on the current page.

### FR-2: Settings & Configuration
The extension must provide a dedicated settings interface for managing API credentials (Gemini API key), model preferences, and user options securely without hardcoding secrets.

### FR-3: Content Extraction
Sidekick must distinguish readable article content from page chrome and irrelevant layout content (using `Readability.js`).

### FR-4: Summarisation (Strict English Only)
Sidekick must produce structured summaries (TL;DR, key points, action items) for articles and public YouTube links strictly in English. Summaries must never be produced in Hindi or Hinglish.

### FR-5: Grounded Page Chat
Page chat must use the current page as its source of truth, answer strictly in English, and clearly acknowledge when the page does not contain the requested answer.

### FR-6: Visual Understanding
The user must be able to capture visible screen regions and ask questions about visual content (charts, diagrams, visual forms), receiving answers strictly in English.

### FR-7: Structured Agent Decisions
Agent decisions and proposed actions must be returned in strict machine-readable JSON so deterministic extension code controls execution.

### FR-8: Human Approval & Controls
Every browser action must require explicit user approval (Approve, Skip, Stop) before execution. The user must retain absolute control at all times.

### FR-9: Local Memory & Saved Skills
Personal profile information and saved prompt recipes must be stored locally on the client using Chrome storage, never transmitted externally.

### FR-10: Safety & Language Enforcement in Code
Safety rules (blocking sensitive fields, financial pages, passwords, OTPs) and language constraints (strictly English responses, never Hindi or Hinglish) must be enforced programmatically by extension logic and system guardrails, not left solely to model discretion.

---

## 7. Non-Functional Requirements

### Reliability
- Handle API failures and rate limits gracefully without crashing.
- Preserve agent progress across service-worker suspension where needed.
- Validate model-generated JSON schema before execution.

### Privacy
- Keep API keys out of source control.
- Keep profile memory on the local device (`chrome.storage.local`).
- Avoid sending private or sensitive pages to external models.

### Safety & Guardrails
- User approval is mandatory for every action.
- Sensitive pages and fields must be blocked by deterministic code.
- Strict language policy: All output must be in English; never output in Hindi or Hinglish.
- The user must always have a visible way to stop an active task immediately.

### Cost
- The core project must work with the free stack (Gemini Flash-Lite, free-tier fallback).
- Stronger or paid model tiers are optional upgrades, not requirements for the core project.

### Usability
- Main features must be directly reachable from the Chrome side panel.
- Errors must be clear and understandable to non-technical users in English.
- The extension must clearly explain the proposed browser action and rationale before asking for approval.

---

## 8. Out of Scope

The following are not required for the four-week core build:

- Chrome on Android or iOS.
- Autonomous execution without explicit user approval.
- Output in Hindi, Hinglish, or any languages other than English.
- Banking or payment automation.
- Login automation.
- OTP / 2FA automation.
- Entering passwords or card information.
- Sending private email, banking, or personal-document pages to an external free-tier AI service.
- Acting on arbitrary third-party sites for risky or consequential workflows.
- Chrome Web Store publication; a GitHub release installed through "Load unpacked" is sufficient for the core build.

---

## 9. Definition of Done

Sidekick is considered complete when a new user can install the extension from the project release, enter their own API key, open the side panel on a supported webpage, and successfully use the complete workflow below:

- 1. Summarise an article or supported public YouTube link in English.
- 2. Receive all outputs strictly in English (verifying that Hindi and Hinglish are never generated).
- 3. Chat with the current page in English with grounded answers.
- 4. Use Explain, Translate to English, or Draft a reply from selected text.
- 5. Ask a question about visible screen content and receive an English answer.
- 6. Ask Sidekick to find a relevant interactive element.
- 7. Give the agent a supported browser task.
- 8. Review and approve each proposed step before execution.
- 9. Stop or skip a step at any time using visible controls.
- 10. Review the action log with English descriptions and reasons.
- 11. Reuse local profile data and a saved skill.
- 12. Confirm that protected pages, fields, and actions are blocked by deterministic safety rules.

The final result should feel like a reliable in-browser sidekick that can read, explain, see, remember, and act — while the user remains in complete control of every consequential step.

---

## 10. Recommended Cursor Execution Order

Use this document as the top-level project specification in Cursor. Build the project in vertical slices rather than generating the entire extension at once.

Recommended order:

- 1. Extension shell + side panel + settings.
- 2. Gemini text call with strict English prompt guardrails.
- 3. Article extraction and English summary.
- 4. Public YouTube English summary.
- 5. English-only response enforcement and summary format controls.
- 6. Grounded page chat in English.
- 7. Context-menu actions (Explain, Translate to English, Draft Reply).
- 8. Screenshot-and-ask.
- 9. API error handling and fallback logic.
- 10. Interactive element scanner and badges.
- 11. Structured element selection.
- 12. Approval-based agent loop.
- 13. Persistence, dry run, step limits, and action logs.
- 14. Local profile memory.
- 15. Saved skills import/export.
- 16. Safety rails and code-level guardrails.
- 17. README, release packaging, and landing page.

For each slice, implement the smallest working version first, test it on real supported pages, and only then move to the next feature.

---

## AI Tools & References

- [1. Cursor IDE](https://cursor.com/download)
- [2. Antigravity IDE](https://antigravity.google/product/antigravity-ide)
- [3. Google AI Studio (Gemini API Key)](https://aistudio.google.com/)

---

## Next Steps

### Context Setup
- `problem_statement.md` → Detailed specification of the Sidekick project being built.
- `architecture.md` → High-level architectural decisions and system design.
- `implementation-plan.md` → Phase-wise implementation breakdown.
- `edge-case.md` → Edge cases, failure modes, and boundary scenarios.

### Follow-up Prompts
- 1. Generate a detailed `architecture.md` for building Sidekick using `@problem_statement.md`.
- 2. Generate a phase-wise `implementation-plan.md` for building this project using `@architecture.md` and `@problem_statement.md`.
- 3. Generate an `edge-case.md` documenting edge cases and recovery strategies for `@implementation-plan.md`.
- 4. Implement Slice 1 of Phase 1 using `@implementation-plan.md`.
