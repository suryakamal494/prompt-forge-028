"""
NotebookLM Workbench — worker.

Runs on Railway.app. Polls the Supabase edge functions for queued jobs,
drives NotebookLM via the `notebooklm-py` library (which uses Playwright
under the hood with a captured Google cookie), generates the requested
artifacts (slides, reports, quizzes, flashcards), and uploads them back.

ENV VARS (set in Railway):
  SUPABASE_FUNCTIONS_URL   e.g. https://<project>.functions.supabase.co
  WORKER_API_TOKEN         shared secret matching the Supabase secret
  WORKER_ID                arbitrary stable id, e.g. "railway-1"
  COOKIE_PATH              path to google_cookies.json (default /data/google_cookies.json)
  POLL_INTERVAL            seconds between job polls (default 5)

ONE-TIME LOGIN:
  python login.py    # opens a browser, you sign in, cookies are saved.

Then start the worker normally.
"""

import os
import sys
import time
import json
import uuid
import traceback
from pathlib import Path

import requests

FUNCTIONS_URL = os.environ["SUPABASE_FUNCTIONS_URL"].rstrip("/")
TOKEN = os.environ["WORKER_API_TOKEN"]
WORKER_ID = os.environ.get("WORKER_ID", f"worker-{uuid.uuid4().hex[:6]}")
COOKIE_PATH = os.environ.get("COOKIE_PATH", "/data/google_cookies.json")
POLL_INTERVAL = int(os.environ.get("POLL_INTERVAL", "5"))
VERSION = "0.1.0"

HEADERS = {"x-worker-token": TOKEN, "Content-Type": "application/json"}


def log(msg: str) -> None:
    print(f"[{time.strftime('%H:%M:%S')}] {msg}", flush=True)


def heartbeat(queue_depth: int = 0, notes: str = "") -> None:
    try:
        requests.post(
            f"{FUNCTIONS_URL}/worker-heartbeat",
            headers=HEADERS,
            json={
                "worker_id": WORKER_ID,
                "version": VERSION,
                "queue_depth": queue_depth,
                "notes": notes,
            },
            timeout=10,
        )
    except Exception as e:
        log(f"heartbeat failed: {e}")


def get_next_job() -> dict | None:
    r = requests.post(
        f"{FUNCTIONS_URL}/jobs-next",
        headers=HEADERS,
        json={"worker_id": WORKER_ID},
        timeout=30,
    )
    r.raise_for_status()
    data = r.json()
    return data.get("job") and data


def update_job(job_id: str, **fields) -> None:
    fields["job_id"] = job_id
    requests.post(f"{FUNCTIONS_URL}/jobs-update", headers=HEADERS, json=fields, timeout=30)


def upload_output(job_id: str, kind: str, filename: str, content: bytes, mime_type: str) -> None:
    # 1) get signed URL
    r = requests.post(
        f"{FUNCTIONS_URL}/jobs-upload-output",
        headers=HEADERS,
        json={"mode": "sign", "job_id": job_id, "kind": kind, "filename": filename},
        timeout=30,
    )
    r.raise_for_status()
    sig = r.json()
    # 2) PUT the bytes
    put = requests.put(sig["signed_url"], data=content, headers={"Content-Type": mime_type}, timeout=120)
    put.raise_for_status()
    # 3) register
    requests.post(
        f"{FUNCTIONS_URL}/jobs-upload-output",
        headers=HEADERS,
        json={
            "mode": "register",
            "job_id": job_id,
            "kind": kind,
            "path": sig["path"],
            "bytes": len(content),
            "mime_type": mime_type,
        },
        timeout=30,
    ).raise_for_status()


# ---------------------------------------------------------------------------
# NotebookLM driver
# ---------------------------------------------------------------------------

def ensure_cookies() -> None:
    if not Path(COOKIE_PATH).exists():
        log(f"FATAL: cookie file not found at {COOKIE_PATH}.")
        log("Run `python login.py` once on this machine to capture Google cookies.")
        sys.exit(1)


def run_notebooklm(job: dict) -> list[dict]:
    """Drive notebooklm-py for the job. Returns list of outputs to upload."""
    from notebooklm import NotebookLM  # type: ignore

    nb = job["notebook"]
    sources = job["sources"]
    requested = set(job["job"]["outputs_requested"])

    nlm = NotebookLM(cookies_path=COOKIE_PATH)
    notebook_id = nb.get("remote_notebook_id") or nlm.create_notebook(title=nb["title"])

    # Add sources
    for s in sources:
        if s["kind"] == "pdf" and s.get("signed_url"):
            nlm.add_source_url(notebook_id, s["signed_url"], filename=s.get("title") or "source.pdf")
        elif s["kind"] == "url":
            nlm.add_source_url(notebook_id, s["url"])
        elif s["kind"] == "youtube":
            nlm.add_source_youtube(notebook_id, s["url"])
        elif s["kind"] == "text":
            nlm.add_source_text(notebook_id, s.get("text_content") or "", title=s.get("title"))

    artifacts: list[dict] = []

    if "slides_pptx" in requested or "slides_pdf" in requested:
        pptx_bytes = nlm.generate_slides_pptx(notebook_id)
        if "slides_pptx" in requested:
            artifacts.append({"kind": "slides_pptx", "filename": "slides.pptx",
                              "bytes": pptx_bytes,
                              "mime": "application/vnd.openxmlformats-officedocument.presentationml.presentation"})
        if "slides_pdf" in requested:
            pdf_bytes = nlm.pptx_to_pdf(pptx_bytes)
            artifacts.append({"kind": "slides_pdf", "filename": "slides.pdf",
                              "bytes": pdf_bytes, "mime": "application/pdf"})

    if "report_md" in requested or "report_pdf" in requested:
        md = nlm.generate_report_markdown(notebook_id)
        if "report_md" in requested:
            artifacts.append({"kind": "report_md", "filename": "report.md",
                              "bytes": md.encode("utf-8"), "mime": "text/markdown"})
        if "report_pdf" in requested:
            pdf = nlm.markdown_to_pdf(md)
            artifacts.append({"kind": "report_pdf", "filename": "report.pdf",
                              "bytes": pdf, "mime": "application/pdf"})

    if "quiz_json" in requested or "quiz_html" in requested:
        quiz = nlm.generate_quiz(notebook_id)  # dict
        if "quiz_json" in requested:
            artifacts.append({"kind": "quiz_json", "filename": "quiz.json",
                              "bytes": json.dumps(quiz, indent=2).encode("utf-8"),
                              "mime": "application/json"})
        if "quiz_html" in requested:
            artifacts.append({"kind": "quiz_html", "filename": "quiz.html",
                              "bytes": nlm.render_quiz_html(quiz).encode("utf-8"),
                              "mime": "text/html"})

    if "flashcards_json" in requested or "flashcards_html" in requested:
        cards = nlm.generate_flashcards(notebook_id)
        if "flashcards_json" in requested:
            artifacts.append({"kind": "flashcards_json", "filename": "flashcards.json",
                              "bytes": json.dumps(cards, indent=2).encode("utf-8"),
                              "mime": "application/json"})
        if "flashcards_html" in requested:
            artifacts.append({"kind": "flashcards_html", "filename": "flashcards.html",
                              "bytes": nlm.render_flashcards_html(cards).encode("utf-8"),
                              "mime": "text/html"})

    return artifacts, notebook_id


# ---------------------------------------------------------------------------
# Main loop
# ---------------------------------------------------------------------------

def process(job_payload: dict) -> None:
    job_id = job_payload["job"]["id"]
    log(f"Picked up job {job_id}")
    update_job(job_id, status="running", progress=5, message="Loading sources")

    try:
        artifacts, remote_id = run_notebooklm(job_payload)
        update_job(job_id, progress=80, message=f"Uploading {len(artifacts)} artifacts")

        for art in artifacts:
            upload_output(job_id, art["kind"], art["filename"], art["bytes"], art["mime"])

        update_job(
            job_id,
            status="done",
            progress=100,
            message=f"Generated {len(artifacts)} outputs",
            remote_notebook_id=remote_id,
        )
        log(f"Job {job_id} done")
    except Exception as e:
        log(f"Job {job_id} failed: {e}\n{traceback.format_exc()}")
        update_job(job_id, status="failed", error=str(e)[:1000])


def main() -> None:
    ensure_cookies()
    log(f"Worker {WORKER_ID} v{VERSION} starting. Polling every {POLL_INTERVAL}s.")
    last_hb = 0.0
    while True:
        try:
            if time.time() - last_hb > 30:
                heartbeat()
                last_hb = time.time()

            payload = get_next_job()
            if payload and payload.get("job"):
                process(payload)
            else:
                time.sleep(POLL_INTERVAL)
        except KeyboardInterrupt:
            log("Shutting down.")
            return
        except Exception as e:
            log(f"loop error: {e}")
            time.sleep(POLL_INTERVAL)


if __name__ == "__main__":
    main()
