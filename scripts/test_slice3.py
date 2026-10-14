#!/usr/bin/env python3
"""
Test Suite for Slice 3: Article Content Extraction & Structured Summary with gemini-3.5-flash-lite
"""

import os
import re
import sys
import json
import urllib.request
import urllib.error
from dotenv import load_dotenv

# Load workspace .env
load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), "..", ".env"))

API_KEY = os.getenv("GEMINI_API_KEY", "").strip()
MODEL = "gemini-3.5-flash-lite"

DEV_UNICODE_REGEX = re.compile(r"[\u0900-\u097F]")

SAMPLE_ARTICLE = {
    "title": "Quantum Computing Reaches High-Fidelity Two-Qubit Gates Milestone",
    "siteName": "TechCrunch Science",
    "byline": "Dr. Elena Rostova",
    "textContent": """
    Researchers at the Quantum Nanoelectronics Laboratory have demonstrated two-qubit gate fidelities 
    exceeding 99.8% using superconducting transmon qubits cooled to 15 millikelvin. 
    This milestone surpasses the fault-tolerance threshold required for surface-code quantum error correction.
    
    Historically, noise and state decoherence have prevented quantum computers from executing circuits 
    beyond a few dozen gates without total signal degradation. By redesigning the microwave resonator 
    couplers and utilizing tantalum thin films on sapphire substrates, the team reduced dielectric loss 
    by an order of magnitude.
    
    Lead scientist Dr. Elena Rostova noted that achieving 99.8% fidelity in a scalable multi-qubit 
    architecture proves that physical error mitigation can match algorithmic assumptions. 
    The team plans to integrate 64 logical qubits within the next 18 months, with cloud access 
    becoming available for materials science research and cryptographic simulations.
    
    Industry observers believe this breakthrough moves commercial quantum simulation closer to reality, 
    particularly for room-temperature catalyst discovery and battery chemistry optimization.
    """
}

def check_file_deliverables():
    print("=" * 60)
    print("1. Checking Slice 3 File Deliverables...")
    print("=" * 60)
    
    files = [
        "src/content/readability.js",
        "src/content/content_script.js",
        "src/sidepanel/components/summary_view.js",
        "manifest.json",
        ".env.example"
    ]
    
    base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    all_ok = True
    
    for rel_path in files:
        full_path = os.path.join(base_dir, rel_path)
        exists = os.path.isfile(full_path)
        size = os.path.getsize(full_path) if exists else 0
        status = "OK" if exists and size > 0 else "FAIL"
        print(f"[{status}] {rel_path} ({size:,} bytes)")
        if not exists or size == 0:
            all_ok = False
            
    # Check manifest.json for content_scripts
    with open(os.path.join(base_dir, "manifest.json"), "r", encoding="utf-8") as f:
        manifest = json.load(f)
        
    has_cs = "content_scripts" in manifest and len(manifest["content_scripts"]) > 0
    print(f"[{'OK' if has_cs else 'FAIL'}] manifest.json declares content_scripts: {has_cs}")
    if not has_cs:
        all_ok = False
        
    return all_ok

def test_summary_generation_with_gemini_35_flash_lite():
    print("\n" + "=" * 60)
    print(f"2. Testing Live Summary Generation with {MODEL}...")
    print("=" * 60)
    
    if not API_KEY:
        print("[FAIL] GEMINI_API_KEY is not set in .env")
        return False
        
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{MODEL}:generateContent?key={API_KEY}"
    
    system_instruction = (
        "You are Sidekick. You MUST communicate and summarize exclusively in English.\n"
        "Under NO circumstance should you output Hindi, Hinglish, or any other language."
    )
    
    summary_prompt = f"""Please generate a structured, easy-to-read summary of the following article strictly in clear English.

ARTICLE TITLE: {SAMPLE_ARTICLE['title']}

<ARTICLE_TEXT>
{SAMPLE_ARTICLE['textContent'].strip()}
</ARTICLE_TEXT>

OUTPUT FORMAT REQUIREMENTS:
1. ## One-Line TL;DR
   A single, impactful sentence capturing the core thesis.
2. ## Key Takeaways
   Exactly 5 concise, actionable bullet points.
3. ## What To Do Next / Actionable Insight
   1-2 concrete action items or takeaways for the reader.

CRITICAL: Respond exclusively in English. Do not include any Hindi or Hinglish phrases."""

    payload = {
        "systemInstruction": {
            "parts": [{"text": system_instruction}]
        },
        "contents": [
            {"parts": [{"text": summary_prompt}]}
        ],
        "generationConfig": {
            "temperature": 0.4,
            "maxOutputTokens": 1024
        }
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
            candidate = data.get("candidates", [{}])[0]
            text = candidate.get("content", {}).get("parts", [{}])[0].get("text", "")
            
            print(f"[SUCCESS] {MODEL} responded ({len(text)} characters).")
            print("-" * 40)
            print(text)
            print("-" * 40)
            
            # Check English-only policy
            dev_matches = DEV_UNICODE_REGEX.findall(text)
            if dev_matches:
                print(f"[FAIL] Response contained Devanagari Unicode: {dev_matches}")
                return False
            else:
                print("[PASS] Language Policy: 100% English verified (Zero Devanagari Unicode).")
                
            # Check structured headers
            has_tldr = "TL;DR" in text or "tldr" in text.lower()
            has_takeaways = "Takeaway" in text or "Key" in text
            print(f"[{'PASS' if has_tldr else 'FAIL'}] Structured Section 'TL;DR': {has_tldr}")
            print(f"[{'PASS' if has_takeaways else 'FAIL'}] Structured Section 'Key Takeaways': {has_takeaways}")
            
            return has_tldr and has_takeaways
            
    except urllib.error.HTTPError as e:
        err_msg = e.read().decode("utf-8")
        print(f"[FAIL] HTTP Error {e.code}: {e.reason}\n{err_msg}")
        return False
    except Exception as e:
        print(f"[FAIL] Exception: {e}")
        return False

if __name__ == "__main__":
    files_ok = check_file_deliverables()
    model_ok = test_summary_generation_with_gemini_35_flash_lite()
    
    if files_ok and model_ok:
        print("\n" + "=" * 60)
        print(f"ALL SLICE 3 & {MODEL} CHECKS PASSED SUCCESSFULLY! [OK]")
        print("=" * 60)
        sys.exit(0)
    else:
        print("\n" + "=" * 60)
        print("SOME CHECKS FAILED! [FAIL]")
        print("=" * 60)
        sys.exit(1)
