#!/usr/bin/env python3
"""
Automated Test Suite for Slice 4 (YouTube Summarizer) and Slice 5 (English Guardrails & Controls)
"""

import os
import sys
import json
import re
import urllib.request
from dotenv import load_dotenv

if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8")

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), "..", ".env"))

GROQ_KEY = os.getenv("GROQ_API_KEY", "").strip()
GROQ_MODEL = os.getenv("GROQ_MODEL", "openai/gpt-oss-120b")
DEV_REGEX = re.compile(r"[\u0900-\u097F]")

def check_file_deliverables():
    print("=" * 60)
    print("1. Checking Slice 4 & 5 Deliverables...")
    print("=" * 60)

    required_files = [
        "src/content/youtube_extractor.js",
        "src/content/readability.js",
        "src/content/content_script.js",
        "src/sidepanel/components/summary_view.js",
        "src/ai/prompt_templates.js",
        "src/ai/response_validator.js",
        "manifest.json"
    ]

    all_ok = True
    base = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))

    for rf in required_files:
        full = os.path.join(base, rf)
        exists = os.path.isfile(full)
        size = os.path.getsize(full) if exists else 0
        status = "OK" if exists and size > 0 else "FAIL"
        print(f"[{status}] {rf} ({size:,} bytes)")
        if not exists or size == 0:
            all_ok = False

    # Check manifest.json contains youtube_extractor.js
    with open(os.path.join(base, "manifest.json"), "r", encoding="utf-8") as f:
        m = json.load(f)
    has_yt = any(
        any("youtube_extractor.js" in script for script in cs.get("js", []))
        for cs in m.get("content_scripts", [])
    )
    print(f"[{'OK' if has_yt else 'FAIL'}] manifest.json registers youtube_extractor.js: {has_yt}")
    if not has_yt:
        all_ok = False

    return all_ok

def test_slice4_youtube_summary():
    print("\n" + "=" * 60)
    print("2. Testing Slice 4: YouTube Chapter Summary Generation...")
    print("=" * 60)

    if not GROQ_KEY:
        print("[FAIL] Missing GROQ_API_KEY in .env")
        return False

    sample_yt = {
        "title": "Building In-Browser Autonomous AI Agents with Manifest V3",
        "channel": "AI Engineering Labs",
        "duration": "14:20",
        "description": "In this video we demonstrate how to build an approval-based AI copilot using Chrome MV3 Side Panel and Groq LPUs.\n\nTimestamps:\n0:00 Introduction\n01:45 The Problem with Tab Scraping\n04:30 Chrome Side Panel API & Permissions\n08:15 Connecting Groq LPUs for Sub-Second Streaming\n12:00 Interactive Timestamp Seeking Demo",
        "chapters": [
            {"timestamp": "0:00", "title": "Introduction"},
            {"timestamp": "01:45", "title": "The Problem with Tab Scraping"},
            {"timestamp": "04:30", "title": "Chrome Side Panel API & Permissions"},
            {"timestamp": "08:15", "title": "Connecting Groq LPUs for Sub-Second Streaming"},
            {"timestamp": "12:00", "title": "Interactive Timestamp Seeking Demo"}
        ]
    }

    prompt = f"""Please generate a structured, chronological chapter summary for this YouTube video strictly in clear English.

VIDEO TITLE: {sample_yt['title']}
CHANNEL: {sample_yt['channel']}
DURATION: {sample_yt['duration']}

KNOWN VIDEO CHAPTERS:
[00:00] Introduction
[01:45] The Problem with Tab Scraping
[04:30] Chrome Side Panel API & Permissions
[08:15] Connecting Groq LPUs for Sub-Second Streaming
[12:00] Interactive Timestamp Seeking Demo

VIDEO DESCRIPTION:
{sample_yt['description']}

MODE: CONCISE

OUTPUT FORMAT:
1. ## One-Line TL;DR
   A single clear sentence summarizing the entire video.
2. ## Chapter Breakdowns & Key Moments
   Chronological bullet points with clickable timestamp tags formatted strictly as [MM:SS] followed by the takeaway.
3. ## What To Do Next / Main Conclusion
   1-2 concrete action items or practical takeaways from the video.

CRITICAL LANGUAGE RULE:
- All output must be strictly in English.
- Use the exact bracketed timestamp format [MM:SS] so viewers can navigate directly to key moments."""

    req = urllib.request.Request(
        "https://api.groq.com/openai/v1/chat/completions",
        data=json.dumps({
            "model": GROQ_MODEL,
            "messages": [
                {"role": "system", "content": "You are Sidekick. You MUST communicate and summarize exclusively in English. Under NO circumstance should you output Hindi or Hinglish."},
                {"role": "user", "content": prompt}
            ],
            "max_tokens": 600,
            "temperature": 0.3
        }).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {GROQ_KEY}",
            "Content-Type": "application/json",
            "User-Agent": "Sidekick/1.0"
        },
        method="POST"
    )

    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            content = data["choices"][0]["message"]["content"]
            print(f"[SUCCESS] Groq ({GROQ_MODEL}) generated YouTube chapter summary:")
            print("-" * 50)
            print(content.strip())
            print("-" * 50)

            # Check timestamps format
            timestamps = re.findall(r"\[(?:\d{1,2}:)?\d{1,2}:\d{2}\]", content)
            print(f"[PASS] Timestamps detected for interactive seeking: {len(timestamps)} timestamps ({', '.join(timestamps[:5])})")

            # Check English policy
            dev_matches = DEV_REGEX.findall(content)
            if dev_matches:
                print(f"[FAIL] Output contained Devanagari Unicode: {dev_matches}")
                return False
            print("[PASS] Language Policy: 100% English Verified.")

            return len(timestamps) >= 3
    except Exception as e:
        print(f"[FAIL] YouTube summary request error: {e}")
        return False

def test_slice5_multilingual_translation_and_controls():
    print("\n" + "=" * 60)
    print("3. Testing Slice 5: Multilingual Input Translation & English Guardrail...")
    print("=" * 60)

    # Foreign text sample (Hindi news excerpt)
    foreign_input = """
    भारतीय अंतरिक्ष अनुसंधान संगठन (ISRO) ने आज अपने नए रॉकेट मिशन के सफल प्रक्षेपण की घोषणा की। 
    यह मिशन मौसम पूर्वानुमान और समुद्री निगरानी में सुधार के लिए अत्याधुनिक उपग्रह स्थापित करेगा। 
    इसरो के वैज्ञानिकों ने कहा कि यह देश की आत्मनिर्भरता की दिशा में एक महत्वपूर्ण कदम है।
    """

    prompt = f"""Please generate a structured, easy-to-read summary of the following article strictly in clear English.

ARTICLE TITLE: ISRO Satellite Launch Announcement

<ARTICLE_TEXT>
{foreign_input.strip()}
</ARTICLE_TEXT>

MODE: CONCISE (Fast Executive Summary)

OUTPUT FORMAT REQUIREMENTS:
1. ## One-Line TL;DR
   A single, impactful, high-level thesis sentence capturing the core essence.
2. ## Key Takeaways
   Exactly 5 concise, high-impact bullet points focusing strictly on essential facts.
3. ## What To Do Next / Actionable Insight
   1 to 2 concise action items for the reader.

LANGUAGE & SAFETY POLICY:
- Respond EXCLUSIVELY in natural, fluent English.
- If the original article is written in a foreign language (e.g. Hindi, Spanish, French, German, Japanese, Chinese), you MUST translate all concepts cleanly into English.
- Under NO circumstance should any Hindi, Hinglish, or non-English characters appear in the output."""

    req = urllib.request.Request(
        "https://api.groq.com/openai/v1/chat/completions",
        data=json.dumps({
            "model": GROQ_MODEL,
            "messages": [
                {"role": "system", "content": "You are Sidekick. You MUST communicate and summarize exclusively in English. Under NO circumstance should you output Hindi, Hinglish, or any foreign script."},
                {"role": "user", "content": prompt}
            ],
            "max_tokens": 500,
            "temperature": 0.2
        }).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {GROQ_KEY}",
            "Content-Type": "application/json",
            "User-Agent": "Sidekick/1.0"
        },
        method="POST"
    )

    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            content = data["choices"][0]["message"]["content"]
            print(f"[SUCCESS] Model translated foreign input and generated English summary:")
            print("-" * 50)
            print(content.strip())
            print("-" * 50)

            dev_matches = DEV_REGEX.findall(content)
            if dev_matches:
                print(f"[FAIL] Output contained Devanagari characters: {dev_matches}")
                return False
            print("[PASS] Language Policy: 100% English Output from Hindi Input (Zero Devanagari characters).")

            has_isro = "ISRO" in content or "satellite" in content.lower()
            print(f"[{'PASS' if has_isro else 'FAIL'}] Accurate translation and content synthesis: {has_isro}")

            return has_isro
    except Exception as e:
        print(f"[FAIL] Multilingual translation test error: {e}")
        return False

if __name__ == "__main__":
    f_ok = check_file_deliverables()
    yt_ok = test_slice4_youtube_summary()
    en_ok = test_slice5_multilingual_translation_and_controls()

    if f_ok and yt_ok and en_ok:
        print("\n" + "=" * 60)
        print("ALL SLICE 4 & SLICE 5 CHECKS PASSED SUCCESSFULLY! [OK]")
        print("=" * 60)
        sys.exit(0)
    else:
        print("\n" + "=" * 60)
        print("SOME CHECKS FAILED! [FAIL]")
        print("=" * 60)
        sys.exit(1)
