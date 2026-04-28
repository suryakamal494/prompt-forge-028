"""
One-time Google login. Run this LOCALLY (you need a real browser window).

    python login.py

It opens Chromium, you sign into Google + open NotebookLM once, then press
ENTER. A Playwright storage_state.json is written to COOKIE_PATH.

Upload that file via Admin → Worker → Cookie in the app. The worker will
download it from Supabase and pass it to notebooklm-py's
AuthTokens.from_storage(...).
"""
import os
from pathlib import Path
from playwright.sync_api import sync_playwright

COOKIE_PATH = os.environ.get("COOKIE_PATH", "./google_storage_state.json")
Path(COOKIE_PATH).parent.mkdir(parents=True, exist_ok=True)


def main() -> None:
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False)
        ctx = browser.new_context()
        page = ctx.new_page()
        page.goto("https://notebooklm.google.com")
        print("\nSign into Google in the browser window.")
        print("Wait until the NotebookLM home page loads fully.")
        print("Then come back here and press ENTER to save.\n")
        input()
        ctx.storage_state(path=COOKIE_PATH)
        print(f"Saved storage state to {COOKIE_PATH}")
        print("Now upload that file via Admin → Worker → Cookie in the app.")
        browser.close()


if __name__ == "__main__":
    main()
