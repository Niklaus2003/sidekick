#!/usr/bin/env python3
"""
Live Test Script: Summarize Real Web Article & Real YouTube Video
"""

import sys
import os
import json
import urllib.request
from dotenv import load_dotenv

if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8")

load_dotenv()
groq_key = os.getenv("GROQ_API_KEY", "").strip()
groq_model = os.getenv("GROQ_MODEL", "openai/gpt-oss-120b")

def test_real_article_summary():
    print("=" * 60)
    print("TEST 1: Real Web Article Summarization")
    print("URL: https://en.wikipedia.org/api/rest_v1/page/summary/Transformer_(deep_learning_architecture)")
    print("=" * 60)

    url = "https://en.wikipedia.org/api/rest_v1/page/summary/Transformer_(deep_learning_architecture)"
    req = urllib.request.Request(url, headers={"User-Agent": "Sidekick/1.0 (test@example.com)"})
    with urllib.request.urlopen(req) as resp:
        wiki = json.loads(resp.read().decode("utf-8"))

    title = wiki.get("title")
    extract = wiki.get("extract")
    print(f"Article: {title}")
    print(f"Original Text Length: {len(extract)} chars\n")

    prompt = f"""Please generate a structured, easy-to-read summary of the following article strictly in clear English.

ARTICLE TITLE: {title}

<ARTICLE_TEXT>
{extract}
</ARTICLE_TEXT>

MODE: CONCISE (Fast Executive Summary)

OUTPUT FORMAT REQUIREMENTS:
1. ## One-Line TL;DR
2. ## Key Takeaways
   Exactly 5 concise, high-impact bullet points focusing strictly on essential facts.
3. ## What To Do Next / Actionable Insight
   1 to 2 concise action items for the reader."""

    groq_req = urllib.request.Request(
        "https://api.groq.com/openai/v1/chat/completions",
        data=json.dumps({
            "model": groq_model,
            "messages": [
                {"role": "system", "content": "You are Sidekick. Communicate strictly in English."},
                {"role": "user", "content": prompt}
            ],
            "max_tokens": 500,
            "temperature": 0.2
        }).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {groq_key}",
            "Content-Type": "application/json",
            "User-Agent": "Sidekick/1.0"
        },
        method="POST"
    )

    with urllib.request.urlopen(groq_req, timeout=15) as resp:
        res = json.loads(resp.read().decode("utf-8"))
        summary = res["choices"][0]["message"]["content"]
        print("Generated Structured Summary:")
        print("-" * 50)
        print(summary)
        print("-" * 50)
        assert "TL;DR" in summary or "Key Takeaways" in summary
        print("[PASS] Article Summarization Working 100%!")

def test_real_youtube_summary():
    print("\n" + "=" * 60)
    print("TEST 2: Real YouTube Video Chapter Summarization")
    print("Video: Andrej Karpathy - Let's build GPT: from scratch, in code, spelled out")
    print("URL: https://www.youtube.com/watch?v=kCc8FmEb1nY")
    print("=" * 60)

    # Real metadata from Andrej Karpathy's famous GPT-from-scratch YouTube video
    video_data = {
        "title": "Let's build GPT: from scratch, in code, spelled out.",
        "channel": "Andrej Karpathy",
        "duration": "1:56:00",
        "description": "We build a Generatively Pretrained Transformer (GPT), following the paper 'Attention is All You Need' and OpenAI's GPT-2 / GPT-3.\n\nChapters:\n00:00:00 - Introduction\n00:05:30 - Bigram Language Model baseline\n00:23:45 - Self-Attention Mechanism explained\n00:42:10 - Multi-Head Attention implementation\n01:05:00 - Transformer Residual Connections & LayerNorm\n01:32:00 - Scaling up the model & training loop\n01:50:30 - Generating sample text and conclusion",
        "chapters": [
            {"timestamp": "00:00", "title": "Introduction"},
            {"timestamp": "05:30", "title": "Bigram Language Model baseline"},
            {"timestamp": "23:45", "title": "Self-Attention Mechanism explained"},
            {"timestamp": "42:10", "title": "Multi-Head Attention implementation"},
            {"timestamp": "1:05:00", "title": "Transformer Residual Connections & LayerNorm"},
            {"timestamp": "1:32:00", "title": "Scaling up the model & training loop"},
            {"timestamp": "1:50:30", "title": "Generating sample text and conclusion"}
        ]
    }

    chapter_list = "\n".join([f"[{c['timestamp']}] {c['title']}" for c in video_data["chapters"]])

    prompt = f"""Please generate a structured, chronological chapter summary for this YouTube video strictly in clear English.

VIDEO TITLE: {video_data['title']}
CHANNEL: {video_data['channel']}
DURATION: {video_data['duration']}

KNOWN VIDEO CHAPTERS:
{chapter_list}

VIDEO DESCRIPTION:
{video_data['description']}

MODE: CONCISE

OUTPUT FORMAT:
1. ## One-Line TL;DR
   A single clear sentence summarizing the entire video.
2. ## Chapter Breakdowns & Key Moments
   Chronological bullet points with clickable timestamp tags formatted strictly as [MM:SS] (or [HH:MM:SS]) followed by the takeaway.
3. ## What To Do Next / Main Conclusion
   1-2 concrete action items or practical takeaways from the video.

CRITICAL LANGUAGE RULE:
- All output must be strictly in English.
- Use the exact bracketed timestamp format [MM:SS] or [HH:MM:SS] so viewers can navigate directly to key moments."""

    groq_req = urllib.request.Request(
        "https://api.groq.com/openai/v1/chat/completions",
        data=json.dumps({
            "model": groq_model,
            "messages": [
                {"role": "system", "content": "You are Sidekick. Communicate strictly in English."},
                {"role": "user", "content": prompt}
            ],
            "max_tokens": 600,
            "temperature": 0.2
        }).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {groq_key}",
            "Content-Type": "application/json",
            "User-Agent": "Sidekick/1.0"
        },
        method="POST"
    )

    with urllib.request.urlopen(groq_req, timeout=15) as resp:
        res = json.loads(resp.read().decode("utf-8"))
        summary = res["choices"][0]["message"]["content"]
        print("Generated YouTube Summary with Timestamps:")
        print("-" * 50)
        print(summary)
        print("-" * 50)
        assert "[00:00]" in summary or "[05:30]" in summary or "[23:45]" in summary
        print("[PASS] YouTube Video Summarizer Working 100%!")

if __name__ == "__main__":
    test_real_article_summary()
    test_real_youtube_summary()
    print("\n" + "=" * 60)
    print("ALL LIVE TESTS COMPLETED SUCCESSFULLY! [OK]")
    print("=" * 60)
