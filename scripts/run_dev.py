#!/usr/bin/env python3
"""
Sidekick Chrome Dev Launcher
Starts a persistent local demo server and launches Chrome with Sidekick pre-loaded as an unpacked extension.
"""

import os
import sys
import subprocess
from http.server import HTTPServer, SimpleHTTPRequestHandler

PORT = 8765
ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))

class CustomHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT_DIR, **kwargs)
    def log_message(self, format, *args):
        # Keep console output clean
        pass

def find_chrome():
    candidates = [
        r"C:\Program Files\Google\Chrome\Application\chrome.exe",
        r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
        os.path.expandvars(r"%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe")
    ]
    for c in candidates:
        if os.path.exists(c):
            return c
    return None

def main():
    chrome_path = find_chrome()
    demo_url = f"http://127.0.0.1:{PORT}/demo/sample_article.html"
    ext_path = ROOT_DIR

    # Launch Chrome with extension if executable is found
    if chrome_path:
        args = [
            chrome_path,
            f"--load-extension={ext_path}",
            demo_url
        ]
        try:
            subprocess.Popen(args)
            print(f"[OK] Chrome launched with extension: {ext_path}")
        except Exception as e:
            print(f"[WARN] Failed to launch Chrome process: {e}")
    else:
        print("[INFO] Chrome not found automatically. Load unpacked via chrome://extensions manually.")

    # Start persistent HTTP server in the main thread
    server = HTTPServer(("127.0.0.1", PORT), CustomHandler)
    print(f"[SUCCESS] Test article server running on: {demo_url}")
    print("[INFO] Server is active. Press Ctrl+C to terminate.")

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n[INFO] Test server shut down cleanly.")
        server.server_close()

if __name__ == "__main__":
    main()
