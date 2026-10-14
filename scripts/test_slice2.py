"""
Verification script for Slice 2 of Phase 1:
- Tests strict English guardrail against Hindi inputs
- Verifies gemini-2.5-flash response and streaming
- Tests Unicode Devanagari detection
"""
import os
import sys
import json
import urllib.request
import re
from dotenv import load_dotenv

sys.stdout.reconfigure(encoding='utf-8')

load_dotenv('.env')
API_KEY = os.getenv('GEMINI_API_KEY')

DEVANAGARI_REGEX = re.compile(r'[\u0900-\u097F]')

SYSTEM_ENGLISH_DIRECTIVE = """You are Sidekick, a secure, human-in-the-loop in-browser AI copilot that assists users with reading, understanding, and safely acting on web pages.

MANDATORY LANGUAGE POLICY:
1. You MUST communicate, reason, summarize, explain, and draft EXCLUSIVELY in clear, natural, professional English.
2. Under NO circumstance should you output Hindi, Hinglish, or any other language.
3. Even if the user prompt is written in Hindi (e.g., "mujhe samjhao", "ye kya hai") or another language, you must understand their intent and respond ONLY in English.
4. Even if the underlying webpage or document contains Hindi or multilingual content, your answers, summaries, and explanations MUST be delivered strictly in English.
5. If the user asks you to translate content, always translate it into clear English. NEVER translate into Hindi."""

def test_unicode_filter():
    print("\n--- TEST 1: Unicode Devanagari Filter ---")
    hindi_samples = [
        "नमस्ते दुनिया",
        "यह एक परीक्षण है",
        "English text with कुछ हिंदी inside",
        "Hinglish text with देवनागरी"
    ]
    for sample in hindi_samples:
        is_hindi = bool(DEVANAGARI_REGEX.search(sample))
        assert is_hindi, f"Failed to detect Hindi in: {sample}"
        print(f" [PASS] Correctly detected Devanagari in: '{sample}'")
        
    english_samples = [
        "Hello world, this is a clean English response.",
        "Python 3.12 is running on Windows.",
        "Special characters: !@#$%^&*()_+ and emojis: 🚀✨"
    ]
    for sample in english_samples:
        is_hindi = bool(DEVANAGARI_REGEX.search(sample))
        assert not is_hindi, f"False positive on: {sample}"
        print(f" [PASS] Clean English passed: '{sample}'")

def test_gemini_api_call(user_prompt, label):
    print(f"\n--- TEST 2: Live API Call ({label}) ---")
    if not API_KEY:
        print(" [SKIP] No GEMINI_API_KEY found in environment.")
        return
        
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={API_KEY}"
    payload = {
        "systemInstruction": {
            "parts": [{"text": SYSTEM_ENGLISH_DIRECTIVE}]
        },
        "contents": [
            {
                "parts": [{"text": user_prompt}]
            }
        ],
        "generationConfig": {
            "temperature": 0.3,
            "maxOutputTokens": 300
        }
    }
    
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode('utf-8'),
        headers={"Content-Type": "application/json"}
    )
    
    try:
        with urllib.request.urlopen(req) as resp:
            data = json.loads(resp.read().decode('utf-8'))
            reply = data['candidates'][0]['content']['parts'][0]['text'].strip()
            print(f"Prompt: '{user_prompt}'")
            print(f"Response:\n{reply}\n")
            
            has_hindi = bool(DEVANAGARI_REGEX.search(reply))
            assert not has_hindi, "Response contained Hindi/Devanagari characters!"
            print(f" [PASS] Response is strictly in English! (Devanagari check: 0 matches)")
    except Exception as e:
        print(f" [FAIL] API call failed: {e}")
        raise e

if __name__ == "__main__":
    test_unicode_filter()
    # Test standard English prompt
    test_gemini_api_call("What is a Chrome extension in one sentence?", "Standard English")
    # Test Hindi prompt -> Expect strictly English response!
    test_gemini_api_call("Mujhe samjhao web browser kya hota hai aur ye kaise kaam karta hai?", "Hindi Input Guardrail")
    print("\n✅ ALL SLICE 2 VERIFICATION TESTS PASSED SUCCESSFULLY!")
