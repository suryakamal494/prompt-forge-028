"""
NotebookLM Workbench — worker.

Polls Supabase edge functions for queued jobs, drives Google NotebookLM via
the unofficial `notebooklm-py` library, and uploads the resulting artifacts
back to Supabase Storage.

ENV VARS (set in Railway):
  SUPABASE_FUNCTIONS_URL   e.g. https://<project>.functions.supabase.co
  WORKER_API_TOKEN         shared secret matching the Supabase secret
  WORKER_ID                stable id, e.g. "railway-1"
  COOKIE_PATH              path to playwright storage_state.json
                           (default /data/google_storage_state.json)
  POLL_INTERVAL            seconds between job polls (default 5)
"""

import asyncio
import json
import os
import sys
import time
import tempfile
import traceback
import uuid
from pathlib import Path
from typing import Any

import requests

from notebooklm import (
    NotebookLMClient,
    ReportFormat,
    SlideDeckFormat,
)
from notebooklm.auth import AuthTokens

FUNCTIONS_URL = os.environ["SUPABASE_FUNCTIONS_URL"].rstrip("/")
TOKEN = os.environ["WORKER_API_TOKEN"]
WORKER_ID = os.environ.get("WORKER_ID", f"worker-{uuid.uuid4().hex[:6]}")
COOKIE_PATH = os.environ.get("COOKIE_PATH", "/data/google_storage_state.json")
POLL_INTERVAL = int(os.environ.get("POLL_INTERVAL", "5"))
VERSION = "0.2.0"

HEADERS = {"x-worker-token": TOKEN, "Content-Type": "application/json"}


def log(msg: str) -> None:
    print(f"[{time.strftime('%H:%M:%S')}] {msg}", flush=True)


# ---------------------------------------------------------------------------
# Backend API helpers
# ---------------------------------------------------------------------------

def heartbeat(queue_depth: int = 0, notes: str = "") -> None:
    try:
        requests.post(
            f"{FUNCTIONS_URL}/worker-heartbeat",
            headers=HEADERS,
            json={"worker_id": WORKER_ID, "version": VERSION,
                  "queue_depth": queue_depth, "notes": notes},
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
    return data if data.get("job") else None


def update_job(job_id: str, **fields) -> None:
    fields["job_id"] = job_id
    try:
        requests.post(f"{FUNCTIONS_URL}/jobs-update",
                      headers=HEADERS, json=fields, timeout=30)
    except Exception as e:
        log(f"update_job failed: {e}")


def upload_output(job_id: str, kind: str, filename: str,
                  content: bytes, mime_type: str) -> None:
    r = requests.post(
        f"{FUNCTIONS_URL}/jobs-upload-output",
        headers=HEADERS,
        json={"mode": "sign", "job_id": job_id, "kind": kind, "filename": filename},
        timeout=30,
    )
    r.raise_for_status()
    sig = r.json()
    put = requests.put(sig["signed_url"], data=content,
                       headers={"Content-Type": mime_type}, timeout=300)
    put.raise_for_status()
    requests.post(
        f"{FUNCTIONS_URL}/jobs-upload-output",
        headers=HEADERS,
        json={"mode": "register", "job_id": job_id, "kind": kind,
              "path": sig["path"], "bytes": len(content), "mime_type": mime_type},
        timeout=30,
    ).raise_for_status()


# ---------------------------------------------------------------------------
# Cookie / auth bootstrap
# ---------------------------------------------------------------------------

def ensure_cookies() -> None:
    """Make sure a Playwright storage_state.json exists locally."""
    if Path(COOKIE_PATH).exists():
        return
    log("Cookie file missing — fetching from worker-cookie-download…")
    try:
        r = requests.get(f"{FUNCTIONS_URL}/worker-cookie-download",
                         headers=HEADERS, timeout=30)
        if r.status_code == 200:
            Path(COOKIE_PATH).parent.mkdir(parents=True, exist_ok=True)
            Path(COOKIE_PATH).write_bytes(r.content)
            log(f"Downloaded cookies to {COOKIE_PATH}")
            return
        log(f"No cookies available yet (HTTP {r.status_code}). "
            f"Upload your storage_state.json via Admin → Worker → Cookie.")
    except Exception as e:
        log(f"Cookie download failed: {e}")
    sys.exit(1)


# ---------------------------------------------------------------------------
# NotebookLM driver — async, one client per job
# ---------------------------------------------------------------------------

async def build_client() -> NotebookLMClient:
    tokens = await AuthTokens.from_storage(Path(COOKIE_PATH))
    return NotebookLMClient(auth=tokens, timeout=60.0)


def _download_pdf(url: str, dest: Path) -> None:
    with requests.get(url, stream=True, timeout=300) as r:
        r.raise_for_status()
        with open(dest, "wb") as fh:
            for chunk in r.iter_content(64 * 1024):
                fh.write(chunk)


def _quiz_html(quiz: Any) -> str:
    return ("<!doctype html><meta charset='utf-8'><title>Quiz</title>"
            "<pre style='font-family:ui-monospace,monospace;white-space:pre-wrap'>"
            + json.dumps(quiz, indent=2) + "</pre>")


def _flashcards_html(cards: Any) -> str:
    return ("<!doctype html><meta charset='utf-8'><title>Flashcards</title>"
            "<pre style='font-family:ui-monospace,monospace;white-space:pre-wrap'>"
            + json.dumps(cards, indent=2) + "</pre>")


async def run_notebooklm_async(payload: dict, on_progress) -> tuple[list[dict], str]:
    notebook = payload["notebook"]
    sources = payload.get("sources") or []
    job = payload["job"]
    requested = set(job.get("outputs_requested") or [])

    client = await build_client()

    # 1) Notebook
    remote_id = notebook.get("remote_notebook_id")
    if remote_id:
        try:
            client.notebooks.get(remote_id)
        except Exception:
            remote_id = None
    if not remote_id:
        nb = client.notebooks.create(title=notebook.get("title") or "Untitled")
        remote_id = nb.id if hasattr(nb, "id") else nb["id"]
    log(f"Using remote notebook {remote_id}")

    # 2) Sources
    on_progress(15, "Adding sources to NotebookLM")
    source_ids: list[str] = []
    with tempfile.TemporaryDirectory() as td:
        for s in sources:
            kind = s.get("kind")
            try:
                if kind == "pdf" and s.get("signed_url"):
                    p = Path(td) / (s.get("title") or "source.pdf")
                    _download_pdf(s["signed_url"], p)
                    src = client.sources.add_file(remote_id, str(p),
                                                  mime_type="application/pdf",
                                                  wait=True, wait_timeout=180)
                elif kind == "url" and s.get("url"):
                    src = client.sources.add_url(remote_id, s["url"],
                                                 wait=True, wait_timeout=180)
                elif kind == "youtube" and s.get("url"):
                    src = client.sources.add_url(remote_id, s["url"],
                                                 wait=True, wait_timeout=180)
                elif kind == "text" and (s.get("text_content") or "").strip():
                    src = client.sources.add_text(remote_id,
                                                  title=s.get("title") or "Text",
                                                  content=s["text_content"],
                                                  wait=True, wait_timeout=120)
                else:
                    log(f"Skipping unsupported source: {s.get('id')} kind={kind}")
                    continue
                sid = getattr(src, "id", None) or src.get("id")
                if sid:
                    source_ids.append(sid)
            except Exception as e:
                log(f"Source add failed ({s.get('id')}): {e}")

    log(f"Added {len(source_ids)} sources")
    if not source_ids:
        raise RuntimeError("No sources could be added to NotebookLM")

    # 3) Generate requested artifacts
    artifacts: list[dict] = []
    total_outputs = max(len(requested), 1)
    done_count = 0

    def bump(msg: str) -> None:
        nonlocal done_count
        done_count += 1
        pct = 30 + int((done_count / total_outputs) * 50)
        on_progress(min(pct, 80), msg)

    def _wait(status):
        task_id = getattr(status, "task_id", None) or getattr(status, "id", None)
        if task_id:
            return client.artifacts.wait_for_completion(remote_id, task_id, timeout=900)
        return status

    def _artifact_id(status):
        # After wait_for_completion the status carries the produced artifact id
        for attr in ("artifact_id", "id"):
            v = getattr(status, attr, None)
            if v:
                return v
        return None

    with tempfile.TemporaryDirectory() as td:
        # Slides
        if "slides_pptx" in requested or "slides_pdf" in requested:
            log("Generating slide deck…")
            status = client.artifacts.generate_slide_deck(
                remote_id, source_ids=source_ids,
                slide_format=SlideDeckFormat.DETAILED_DECK)
            status = _wait(status)
            aid = _artifact_id(status)
            if "slides_pptx" in requested:
                p = Path(td) / "slides.pptx"
                client.artifacts.download_slide_deck(remote_id, str(p),
                                                    artifact_id=aid,
                                                    output_format="pptx")
                artifacts.append({"kind": "slides_pptx", "filename": "slides.pptx",
                                  "bytes": p.read_bytes(),
                                  "mime": "application/vnd.openxmlformats-officedocument.presentationml.presentation"})
            if "slides_pdf" in requested:
                p = Path(td) / "slides.pdf"
                client.artifacts.download_slide_deck(remote_id, str(p),
                                                    artifact_id=aid,
                                                    output_format="pdf")
                artifacts.append({"kind": "slides_pdf", "filename": "slides.pdf",
                                  "bytes": p.read_bytes(), "mime": "application/pdf"})
            bump("Slides ready")

        # Report (briefing doc)
        if "report_md" in requested or "report_pdf" in requested:
            log("Generating report…")
            status = client.artifacts.generate_report(
                remote_id, report_format=ReportFormat.BRIEFING_DOC,
                source_ids=source_ids)
            status = _wait(status)
            aid = _artifact_id(status)
            p = Path(td) / "report.bin"
            client.artifacts.download_report(remote_id, str(p), artifact_id=aid)
            data = p.read_bytes()
            if "report_md" in requested:
                artifacts.append({"kind": "report_md", "filename": "report.md",
                                  "bytes": data, "mime": "text/markdown"})
            if "report_pdf" in requested:
                artifacts.append({"kind": "report_pdf", "filename": "report.pdf",
                                  "bytes": data, "mime": "application/pdf"})
            bump("Report ready")

        # Quiz
        if "quiz_json" in requested or "quiz_html" in requested:
            log("Generating quiz…")
            status = client.artifacts.generate_quiz(remote_id, source_ids=source_ids)
            status = _wait(status)
            aid = _artifact_id(status)
            p = Path(td) / "quiz.json"
            client.artifacts.download_quiz(remote_id, str(p),
                                           artifact_id=aid, output_format="json")
            data = p.read_bytes()
            if "quiz_json" in requested:
                artifacts.append({"kind": "quiz_json", "filename": "quiz.json",
                                  "bytes": data, "mime": "application/json"})
            if "quiz_html" in requested:
                try:
                    quiz = json.loads(data.decode("utf-8"))
                except Exception:
                    quiz = {"raw": data.decode("utf-8", "ignore")}
                artifacts.append({"kind": "quiz_html", "filename": "quiz.html",
                                  "bytes": _quiz_html(quiz).encode("utf-8"),
                                  "mime": "text/html"})
            bump("Quiz ready")

        # Flashcards
        if "flashcards_json" in requested or "flashcards_html" in requested:
            log("Generating flashcards…")
            status = client.artifacts.generate_flashcards(remote_id, source_ids=source_ids)
            status = _wait(status)
            aid = _artifact_id(status)
            p = Path(td) / "flashcards.json"
            client.artifacts.download_flashcards(remote_id, str(p),
                                                 artifact_id=aid, output_format="json")
            data = p.read_bytes()
            if "flashcards_json" in requested:
                artifacts.append({"kind": "flashcards_json", "filename": "flashcards.json",
                                  "bytes": data, "mime": "application/json"})
            if "flashcards_html" in requested:
                try:
                    cards = json.loads(data.decode("utf-8"))
                except Exception:
                    cards = {"raw": data.decode("utf-8", "ignore")}
                artifacts.append({"kind": "flashcards_html", "filename": "flashcards.html",
                                  "bytes": _flashcards_html(cards).encode("utf-8"),
                                  "mime": "text/html"})
            bump("Flashcards ready")

    return artifacts, remote_id


# ---------------------------------------------------------------------------
# Job processing
# ---------------------------------------------------------------------------

def process(payload: dict) -> None:
    job = payload["job"]
    job_id = job["id"]
    log(f"Picked up job {job_id}")
    update_job(job_id, status="running", progress=5, message="Loading sources")

    def on_progress(pct: int, msg: str) -> None:
        update_job(job_id, progress=pct, message=msg)

    try:
        artifacts, remote_id = asyncio.run(run_notebooklm_async(payload, on_progress))
        on_progress(85, f"Uploading {len(artifacts)} artifacts")
        for art in artifacts:
            upload_output(job_id, art["kind"], art["filename"],
                          art["bytes"], art["mime"])
        update_job(
            job_id, status="done", progress=100,
            message=f"Generated {len(artifacts)} outputs",
            remote_notebook_id=remote_id,
        )
        log(f"Job {job_id} done ({len(artifacts)} artifacts)")
    except Exception as e:
        log(f"Job {job_id} failed: {e}\n{traceback.format_exc()}")
        update_job(job_id, status="failed", error=str(e)[:1000])


# ---------------------------------------------------------------------------
# Main loop
# ---------------------------------------------------------------------------

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
