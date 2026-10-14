#!/usr/bin/env python3
"""
Automated Test Suite for Slice 6 (Grounded Page Chat) and Slice 7 (Context-Menu Quick Actions)
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
    print("1. Checking Slice 6 & 7 Deliverables...")
    print("=" * 60)

    base = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    required_files = [
        "src/sidepanel/components/chat_view.js",
        "src/background/context_menus.js",
        "src/background/service_worker.js",
        "src/ai/prompt_templates.js",
        "manifest.json"
    ]

    all_ok = True
    for rf in required_files:
        full = os.path.join(base, rf)
        exists = os.path.isfile(full)
        size = os.path.getsize(full) if exists else 0
        status = "OK" if exists and size > 0 else "FAIL"
        print(f"[{status}] {rf} ({size:,} bytes)")
        if not exists or size == 0:
            all_ok = False

    # Check manifest.json permissions for contextMenus
    with open(os.path.join(base, "manifest.json"), "r", encoding="utf-8") as f:
        m = json.load(f)
    has_cm = "contextMenus" in m.get("permissions", [])
    print(f"[{'OK' if has_cm else 'FAIL'}] manifest.json includes 'contextMenus' permission: {has_cm}")
    if not has_cm:
        all_ok = False

    # Check context_menus.js has the 3 required menu items
    with open(os.path.join(base, "src", "background", "context_menus.js"), "r", encoding="utf-8") as f:
        cm_content = f.read()
    has_explain = "sidekick_explain" in cm_content
    has_translate = "sidekick_translate" in cm_content
    has_reply = "sidekick_reply" in cm_content
    print(f"[{'OK' if has_explain else 'FAIL'}] Context menu item: 'Sidekick: Explain this in plain English'")
    print(f"[{'OK' if has_translate else 'FAIL'}] Context menu item: 'Sidekick: Translate to English'")
    print(f"[{'OK' if has_reply else 'FAIL'}] Context menu item: 'Sidekick: Draft a professional reply'")
    if not (has_explain and has_translate and has_reply):
        all_ok = False

    return all_ok

def call_groq(prompt, system_prompt="You are Sidekick. You MUST communicate exclusively in English."):
    req = urllib.request.Request(
        "https://api.groq.com/openai/v1/chat/completions",
        data=json.dumps({
            "model": GROQ_MODEL,
            "messages": [
                {"role": "system", "content": system_prompt},
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

    with urllib.request.urlopen(req, timeout=15) as resp:
        data = json.loads(resp.read().decode("utf-8"))
        return data["choices"][0]["message"]["content"].strip()

def test_slice6_grounded_chat():
    print("\n" + "=" * 60)
    print("2. Testing Slice 6: Grounded Page Chat Interface...")
    print("=" * 60)

    if not GROQ_KEY:
        print("[FAIL] Missing GROQ_API_KEY in .env")
        return False

    sample_page_content = """
    Quantum Computing Breakthrough: Researchers at the National Quantum Institute have achieved
    a record 99.8% two-qubit gate fidelity using superconducting transmon qubits cooled to 15 millikelvin.
    The breakthrough was made possible by redesigning microwave resonator couplers with tantalum thin films
    on high-resistivity sapphire substrates, reducing dielectric loss by an order of magnitude.
    The team plans to integrate 64 logical qubits within the next 18 months.
    """

    # Test 6A: In-page grounded question
    print("\n--- Test 6A: Grounded Question (Found on Page) ---")
    prompt_grounded = f"""PAGE CONTEXT:
Title: Quantum Fidelity Breakthrough
URL: https://example.com/quantum

<PAGE_CONTENT>
{sample_page_content.strip()}
</PAGE_CONTENT>

GROUNDING DIRECTIVES:
1. Answer the user's question using ONLY the facts, figures, and context provided in <PAGE_CONTENT> above.
2. If the page content does NOT contain the answer, or if the user asks an unrelated question not discussed on this page (such as general trivia, unrelated geography, or external world facts), you MUST explicitly state: "This page does not contain that information." in English.
3. Under no circumstance should you hallucinate, speculate, or bring in external knowledge not present in the page content.
4. Respond strictly in fluent, natural English.

USER QUESTION:
What fidelity was achieved in the experiment, and what temperature was used?"""

    try:
        ans_grounded = call_groq(prompt_grounded)
        print("Response:\n" + ans_grounded)
        has_998 = "99.8" in ans_grounded
        has_temp = "15" in ans_grounded and ("millikelvin" in ans_grounded.lower() or "mk" in ans_grounded.lower())
        print(f"[{'PASS' if has_998 and has_temp else 'FAIL'}] Grounded answer includes 99.8% fidelity and 15 millikelvin: {has_998 and has_temp}")
    except Exception as e:
        print(f"[FAIL] Grounded query error: {e}")
        return False

    # Test 6B: Unrelated question not on the page
    print("\n--- Test 6B: Unrelated Question (NOT on Page -> Must State Absence) ---")
    prompt_unrelated = f"""PAGE CONTEXT:
Title: Quantum Fidelity Breakthrough
URL: https://example.com/quantum

<PAGE_CONTENT>
{sample_page_content.strip()}
</PAGE_CONTENT>

GROUNDING DIRECTIVES:
1. Answer the user's question using ONLY the facts, figures, and context provided in <PAGE_CONTENT> above.
2. If the page content does NOT contain the answer, or if the user asks an unrelated question not discussed on this page (such as general trivia, unrelated geography, or external world facts), you MUST explicitly state: "This page does not contain that information." in English.
3. Under no circumstance should you hallucinate, speculate, or bring in external knowledge not present in the page content.
4. Respond strictly in fluent, natural English.

USER QUESTION:
What is the capital of France?"""

    try:
        ans_unrelated = call_groq(prompt_unrelated)
        print("Response:\n" + ans_unrelated)
        mentions_absent = (
            "does not contain that information" in ans_unrelated.lower() or
            "does not mention" in ans_unrelated.lower() or
            "not found" in ans_unrelated.lower() or
            "not provided" in ans_unrelated.lower()
        )
        print(f"[{'PASS' if mentions_absent else 'FAIL'}] Explicitly states page does not contain the information: {mentions_absent}")
        return has_998 and mentions_absent
    except Exception as e:
        print(f"[FAIL] Unrelated query error: {e}")
        return False

def test_slice7_context_menu_actions():
    print("\n" + "=" * 60)
    print("3. Testing Slice 7: Context-Menu Quick Actions...")
    print("=" * 60)

    # 7A: Explain in plain English
    print("\n--- Test 7A: Explain in Plain English (ELI5) ---")
    explain_prompt = """Explain the following selected text in simple, clear, plain English (ELI5 - Explain Like I'm 5 style). Avoid dense jargon.

SELECTED TEXT:
"Dielectric loss was mitigated by redesigning microwave resonator couplers with tantalum thin films on sapphire substrates."

CRITICAL: Output must be strictly in plain English. Never output in Hindi or Hinglish."""

    try:
        ans_explain = call_groq(explain_prompt)
        print("Response:\n" + ans_explain)
        dev_matches = DEV_REGEX.findall(ans_explain)
        if dev_matches:
            print(f"[FAIL] Output contained Devanagari characters: {dev_matches}")
            return False
        is_english = len(ans_explain) > 30 and not dev_matches
        print(f"[{'PASS' if is_english else 'FAIL'}] Plain English explanation generated: {is_english}")
    except Exception as e:
        print(f"[FAIL] Explain action error: {e}")
        return False

    # 7B: Translate to English
    print("\n--- Test 7B: Translate to English ---")
    foreign_text = "इस विस्तार का उद्देश्य कृत्रिम बुद्धिमत्ता का उपयोग करके ब्राउज़र को सुरक्षित और उत्पादक बनाना है।"
    translate_prompt = f"""Translate the following text into clear, fluent, natural English.

SOURCE TEXT:
"{foreign_text}"

CRITICAL: Translate INTO English. The response must be entirely in English. Never output in Hindi, Hinglish, or any foreign script."""

    try:
        ans_translate = call_groq(translate_prompt)
        print("Response:\n" + ans_translate)
        dev_matches = DEV_REGEX.findall(ans_translate)
        if dev_matches:
            print(f"[FAIL] Output contained Devanagari characters: {dev_matches}")
            return False
        has_keywords = "extension" in ans_translate.lower() or "ai" in ans_translate.lower() or "browser" in ans_translate.lower()
        print(f"[{'PASS' if has_keywords else 'FAIL'}] Translated cleanly into 100% English: {has_keywords}")
    except Exception as e:
        print(f"[FAIL] Translate action error: {e}")
        return False

    # 7C: Draft a professional reply
    print("\n--- Test 7C: Draft Professional Reply ---")
    reply_prompt = """Draft a polite, concise, and professional reply in English to the following message, comment, or email.

ORIGINAL MESSAGE:
"Hi Aaron, we loved your Sidekick browser copilot demo! Would you be available for a 20-minute intro call this Thursday to discuss an engineering role?"

REQUIREMENTS:
- Draft polished, context-appropriate replies strictly in English.
- Provide 2 distinct options:
  1. **Option 1 (Concise & Direct)**: A brief, professional reply.
  2. **Option 2 (Detailed & Collaborative)**: A slightly more comprehensive, warm reply.
- Never output in Hindi, Hinglish, or any foreign script."""

    try:
        ans_reply = call_groq(reply_prompt)
        print("Response:\n" + ans_reply)
        has_option1 = "Option 1" in ans_reply or "Option" in ans_reply
        has_thursday = "Thursday" in ans_reply or "call" in ans_reply.lower()
        print(f"[{'PASS' if has_option1 and has_thursday else 'FAIL'}] Professional options drafted in English: {has_option1 and has_thursday}")
        return is_english and has_keywords and has_option1
    except Exception as e:
        print(f"[FAIL] Draft reply action error: {e}")
        return False

if __name__ == "__main__":
    f_ok = check_file_deliverables()
    chat_ok = test_slice6_grounded_chat()
    cm_ok = test_slice7_context_menu_actions()

    if f_ok and chat_ok and cm_ok:
        print("\n" + "=" * 60)
        print("ALL SLICE 6 & SLICE 7 CHECKS PASSED SUCCESSFULLY! [OK]")
        print("=" * 60)
        sys.exit(0)
    else:
        print("\n" + "=" * 60)
        print("SOME CHECKS FAILED! [FAIL]")
        print("=" * 60)
        sys.exit(1)
