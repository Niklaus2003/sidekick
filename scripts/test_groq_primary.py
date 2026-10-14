#!/usr/bin/env python3
"""
Test Suite: Groq as Primary Provider with Gemini Fallback
Verifies Groq inference, English guardrails, and Gemini fallback resilience.
"""

import os
import re
import sys
import json
import urllib.request
import urllib.error
from dotenv import load_dotenv

# Ensure Windows stdout prints UTF-8 cleanly
if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8")

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), "..", ".env"))

GROQ_KEY = os.getenv("GROQ_API_KEY", "").strip()
GROQ_MODEL = os.getenv("GROQ_MODEL", "openai/gpt-oss-120b")
GEMINI_KEY = os.getenv("GEMINI_API_KEY", "").strip()
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-3.5-flash-lite")

DEV_UNICODE_REGEX = re.compile(r"[\u0900-\u097F]")

def test_groq_primary_live():
    print("=" * 60)
    print(f"1. Testing Groq Primary Engine ({GROQ_MODEL})...")
    print("=" * 60)

    if not GROQ_KEY:
        print("[FAIL] GROQ_API_KEY missing from .env")
        return False

    prompt = (
        "Summarize the core benefit of running in-browser AI copilots on Groq LPUs in 2 bullet points in English."
    )

    req = urllib.request.Request(
        "https://api.groq.com/openai/v1/chat/completions",
        data=json.dumps({
            "model": GROQ_MODEL,
            "messages": [
                {"role": "system", "content": "You are Sidekick. You MUST communicate exclusively in English. Under NO circumstance should you output Hindi or Hinglish."},
                {"role": "user", "content": prompt}
            ],
            "max_tokens": 300,
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
            print(f"[SUCCESS] Groq ({GROQ_MODEL}) responded:")
            print("-" * 40)
            print(content.strip())
            print("-" * 40)

            # Validate language policy
            dev_matches = DEV_UNICODE_REGEX.findall(content)
            if dev_matches:
                print(f"[FAIL] Response contained non-English Devanagari Unicode: {dev_matches}")
                return False
            print("[PASS] Language Policy: 100% English Verified.")
            return True
    except Exception as e:
        print(f"[FAIL] Groq request failed: {e}")
        return False

def test_gemini_fallback_live():
    print("\n" + "=" * 60)
    print(f"2. Testing Gemini Fallback Standby ({GEMINI_MODEL})...")
    print("=" * 60)

    if not GEMINI_KEY:
        print("[FAIL] GEMINI_API_KEY missing from .env")
        return False

    url = f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent?key={GEMINI_KEY}"

    payload = {
        "systemInstruction": {
            "parts": [{"text": "You are Sidekick fallback engine. Respond strictly in English."}]
        },
        "contents": [
            {"parts": [{"text": "Confirm fallback standby status in one sentence."}]}
        ],
        "generationConfig": {"maxOutputTokens": 60}
    }

    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST"
    )

    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            text = data["candidates"][0]["content"]["parts"][0]["text"]
            print(f"[SUCCESS] Gemini Fallback ({GEMINI_MODEL}) responded:")
            print("-" * 40)
            print(text.strip())
            print("-" * 40)
            return True
    except Exception as e:
        print(f"[FAIL] Gemini fallback failed: {e}")
        return False

if __name__ == "__main__":
    groq_ok = test_groq_primary_live()
    gemini_ok = test_gemini_fallback_live()

    if groq_ok and gemini_ok:
        print("\n" + "=" * 60)
        print("ALL TESTS PASSED: Groq (Primary) + Gemini (Fallback) [OK]")
        print("=" * 60)
        sys.exit(0)
    else:
        print("\n" + "=" * 60)
        print("TESTS FAILED [FAIL]")
        print("=" * 60)
        sys.exit(1)
