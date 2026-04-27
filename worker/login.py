"""
One-time Google login. Run this in the Railway shell (or locally) to capture
cookies for NotebookLM. Cookies are written to COOKIE_PATH.

Usage:
    python login.py
"""
import os
import json
from pathlib import Path
from playwright.sync_api import sync_playwright

COOKIE_PATH = os.environ.get("COOKIE_PATH", "/data/google_cookies.json")
Path(COOKIE_PATH).parent.mkdir(parents=True, exist_ok=True)


def main() -> None:
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False)
        ctx = browser.new_context()
        page = ctx.new_page()
        page.goto("https://notebooklm.google.com")
        print("Sign in to Google in the browser window.")
        print("After NotebookLM home loads, press ENTER here to save cookies.")
        input()
        cookies = ctx.cookies()
        Path(COOKIE_PATH).write_text(json.dumps(cookies, indent=2))
        print(f"Saved {len(cookies)} cookies to {COOKIE_PATH}")
        browser.close()


if __name__ == "__main__":
    main()
