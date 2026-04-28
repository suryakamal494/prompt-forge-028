"""
NotebookLM Workbench — worker (slides.pptx + flashcards only).

Polls the Workbench backend for queued jobs, drives Google NotebookLM via the
unofficial `notebooklm-py` library, downloads the resulting slide deck (.pptx)
and flashcards (.json), and uploads them back.

ENV VARS (Railway):
  SUPABASE_FUNCTIONS_URL   https://<project>.functions.supabase.co
  WORKER_API_TOKEN         shared secret matching the backend
  WORKER_ID                stable label (default: railway-1)
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

from notebooklm import NotebookLMClient, SlideDeckFormat
from notebooklm.auth import AuthTokens

FUNCTIONS_URL = os.environ["SUPABASE_FUNCTIONS_URL"].rstrip("/")
TOKEN = os.environ["WORKER_API_TOKEN"]
WORKER_ID = os.environ.get("WORKER_ID", f"worker-{uuid.uuid4().hex[:6]}")
COOKIE_PATH = os.environ.get("COOKIE_PATH", "/data/google_storage_state.json")
POLL_INTERVAL = int(os.environ.get("POLL_INTERVAL", "5"))
VERSION = "0.3.0"

HEADERS = {"x-worker-token": TOKEN, "Content-Type": "application/json"}

SUPPORTED_OUTPUTS = {"slides_pptx", "flashcards_json"}


def log(msg: str) -> None:
    print(f"[{time.strftime('%H:%M:%S')}] {msg}", flush=True)


# ---------------------------------------------------------------------------
# Backend HTTP helpers
# ---------------------------------------------------------------------------

def heartbeat(notes: str = "") -> None:
    try:
        requests.post(
            f"{FUNCTIONS_URL}/worker-heartbeat",
            headers=HEADERS,
            json={"worker_id": WORKER_ID, "version": VERSION,
                  "queue_depth": 0, "notes": notes},
            timeout=10,
        )
    except Exception as e:
        log(f"heartbeat failed: {e}")


def get_next_job() -> dict | None:
    r = requests.post(f"{FUNCTIONS_URL}/jobs-next", headers=HEADERS,
                      json={"worker_id": WORKER_ID}, timeout=30)
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
# Cookie bootstrap
# ---------------------------------------------------------------------------

def _normalize_storage_state(raw: bytes) -> bytes:
    """Coerce the cookie file into Playwright storage_state shape.

    notebooklm-py's `extract_cookies_from_storage` calls `.get("cookies", [])`
    on the parsed JSON, so it MUST be a dict like `{"cookies": [...], "origins": [...]}`.
    Older uploads (or hand-edited files) may be a bare cookies list — wrap them.
    """
    try:
        data = json.loads(raw)
    except Exception as e:
        raise RuntimeError(f"Cookie file is not valid JSON: {e}")
    if isinstance(data, list):
        data = {"cookies": data, "origins": []}
    elif isinstance(data, dict):
        if "cookies" not in data or not isinstance(data.get("cookies"), list):
            raise RuntimeError(
                "Cookie file is a JSON object but has no 'cookies' array. "
                "Expected a Playwright storage_state.json."
            )
        data.setdefault("origins", [])
    else:
        raise RuntimeError("Cookie file must be a JSON object or array.")
    return json.dumps(data).encode("utf-8")


def ensure_cookies() -> None:
    """Always fetch the latest cookie file from the backend and normalize it.

    We re-download every startup so the worker stays in sync with whatever
    the admin uploaded most recently, and so we can fix any legacy/malformed
    files left on the persistent volume.
    """
    log("Fetching cookies from worker-cookie-download…")
    try:
        r = requests.get(f"{FUNCTIONS_URL}/worker-cookie-download",
                         headers=HEADERS, timeout=30)
        if r.status_code == 200:
            Path(COOKIE_PATH).parent.mkdir(parents=True, exist_ok=True)
            normalized = _normalize_storage_state(r.content)
            Path(COOKIE_PATH).write_bytes(normalized)
            log(f"Wrote normalized storage_state to {COOKIE_PATH}")
            return
        if r.status_code == 404 and Path(COOKIE_PATH).exists():
            # No upload yet, but we have a local copy — try to normalize it.
            log("No cookies on backend; using and normalizing local file.")
            local = Path(COOKIE_PATH).read_bytes()
            Path(COOKIE_PATH).write_bytes(_normalize_storage_state(local))
            return
        log(f"No cookies yet (HTTP {r.status_code}). "
            f"Upload your storage_state.json via Admin → Worker → Cookie.")
    except Exception as e:
        log(f"Cookie bootstrap failed: {e}")
    sys.exit(1)


# ---------------------------------------------------------------------------
# NotebookLM driver (fully async)
# ---------------------------------------------------------------------------

def _download_pdf(url: str, dest: Path) -> None:
    with requests.get(url, stream=True, timeout=300) as r:
        r.raise_for_status()
        with open(dest, "wb") as fh:
            for chunk in r.iter_content(64 * 1024):
                fh.write(chunk)


def _artifact_id(status: Any) -> str | None:
    for attr in ("artifact_id", "id"):
        v = getattr(status, attr, None)
        if v:
            return v
    return None


async def run_notebooklm_async(payload: dict, on_progress) -> tuple[list[dict], str]:
    notebook = payload["notebook"]
    sources = payload.get("sources") or []
    job = payload["job"]
    requested = set(job.get("outputs_requested") or []) & SUPPORTED_OUTPUTS

    if not requested:
        raise RuntimeError(
            "No supported outputs requested. This worker only produces "
            "slides_pptx and flashcards_json."
        )

    tokens = await AuthTokens.from_storage(Path(COOKIE_PATH))

    async with NotebookLMClient(auth=tokens, timeout=60.0) as client:
        # ---- 1. Notebook ----
        remote_id = notebook.get("remote_notebook_id")
        if remote_id:
            try:
                await client.notebooks.get(remote_id)
            except Exception:
                remote_id = None
        if not remote_id:
            nb = await client.notebooks.create(title=notebook.get("title") or "Untitled")
            remote_id = getattr(nb, "id", None) or nb["id"]
        log(f"Using remote notebook {remote_id}")

        # ---- 2. Sources ----
        on_progress(15, "Adding sources to NotebookLM")
        source_ids: list[str] = []
        with tempfile.TemporaryDirectory() as td:
            for s in sources:
                kind = s.get("kind")
                try:
                    if kind == "pdf" and s.get("signed_url"):
                        p = Path(td) / (s.get("title") or "source.pdf")
                        _download_pdf(s["signed_url"], p)
                        src = await client.sources.add_file(
                            remote_id, str(p), mime_type="application/pdf",
                            wait=True, wait_timeout=240)
                    elif kind in ("url", "youtube") and s.get("url"):
                        src = await client.sources.add_url(
                            remote_id, s["url"], wait=True, wait_timeout=240)
                    elif kind == "text" and (s.get("text_content") or "").strip():
                        src = await client.sources.add_text(
                            remote_id, title=s.get("title") or "Text",
                            content=s["text_content"], wait=True, wait_timeout=120)
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

        on_progress(30, "Sources ready, generating outputs")

        # ---- 3. Generate outputs ----
        artifacts: list[dict] = []
        with tempfile.TemporaryDirectory() as td:
            # Slides .pptx
            if "slides_pptx" in requested:
                log("Generating slide deck…")
                on_progress(35, "NotebookLM is generating the slide deck")
                status = await client.artifacts.generate_slide_deck(
                    remote_id, source_ids=source_ids,
                    slide_format=SlideDeckFormat.DETAILED_DECK)
                task_id = getattr(status, "task_id", None) or getattr(status, "id", None)
                if task_id:
                    status = await client.artifacts.wait_for_completion(
                        remote_id, task_id, timeout=900)
                aid = _artifact_id(status)
                p = Path(td) / "slides.pptx"
                await client.artifacts.download_slide_deck(
                    remote_id, str(p), artifact_id=aid, output_format="pptx")
                artifacts.append({
                    "kind": "slides_pptx", "filename": "slides.pptx",
                    "bytes": p.read_bytes(),
                    "mime": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
                })
                log("Slide deck downloaded")
                on_progress(65, "Slide deck ready")

            # Flashcards .json
            if "flashcards_json" in requested:
                log("Generating flashcards…")
                on_progress(70, "NotebookLM is generating flashcards")
                status = await client.artifacts.generate_flashcards(
                    remote_id, source_ids=source_ids)
                task_id = getattr(status, "task_id", None) or getattr(status, "id", None)
                if task_id:
                    status = await client.artifacts.wait_for_completion(
                        remote_id, task_id, timeout=600)
                aid = _artifact_id(status)
                p = Path(td) / "flashcards.json"
                await client.artifacts.download_flashcards(
                    remote_id, str(p), artifact_id=aid, output_format="json")
                artifacts.append({
                    "kind": "flashcards_json", "filename": "flashcards.json",
                    "bytes": p.read_bytes(),
                    "mime": "application/json",
                })
                log("Flashcards downloaded")
                on_progress(85, "Flashcards ready")

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
        on_progress(90, f"Uploading {len(artifacts)} artifacts")
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
    log("Producing: slides.pptx + flashcards.json (other outputs disabled)")
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
