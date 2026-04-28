## Goal

Fix the worker so it can actually drive `notebooklm-py` (v0.3.4). The previous `worker.py` invented an API that doesn't exist; we will rewrite it against the real one.

## What was wrong

The old code did `from notebooklm import NotebookLM` and called methods like `nlm.create_notebook()`, `nlm.generate_slides_pptx()`. None of those exist.

The real library exposes:
- `NotebookLMClient(auth=AuthTokens, timeout=30.0)` as the entry point
- Sub-APIs hung off the client: `client.notebooks`, `client.sources`, `client.artifacts`, `client.chat`
- Async generation: each `generate_*` returns a `GenerationStatus` with a `task_id`; you then call `artifacts.wait_for_completion(notebook_id, task_id)` and finally `artifacts.download_*(notebook_id, output_path, artifact_id)` to get the file.
- Auth is built from a Playwright `storage_state.json` via `auth.AuthTokens.from_storage(path)` — NOT a raw cookies JSON. This is important: the cookie file the user uploads must be a Playwright storage state, which is what `worker/login.py` already produces.

## Real artifact mapping

| User-requested output | notebooklm-py call | Download method | Output format |
|---|---|---|---|
| `slides_pptx` | `generate_slide_deck(...)` | `download_slide_deck(..., output_format="pptx")` | .pptx |
| `slides_pdf` | `generate_slide_deck(...)` | `download_slide_deck(..., output_format="pdf")` | .pdf |
| `report_md` / `report_pdf` | `generate_report(report_format=BRIEFING_DOC)` | `download_report(...)` | provider-defined; we wrap to .md / .pdf |
| `quiz_json` | `generate_quiz(...)` | `download_quiz(..., output_format="json")` | .json |
| `quiz_html` | same quiz | render JSON → HTML in worker | .html |
| `flashcards_json` | `generate_flashcards(...)` | `download_flashcards(..., output_format="json")` | .json |
| `flashcards_html` | same flashcards | render JSON → HTML in worker | .html |
| (bonus, free) `mind_map` | `generate_mind_map(...)` returns dict directly | n/a | .json |
| (bonus) `audio_overview` | `generate_audio(...)` + `download_audio(...)` | | .mp3 |

We will keep the worker focused on the outputs the UI already requests; bonus items can come later.

## Changes

### 1. Rewrite `worker/worker.py`
- Replace the fake `NotebookLM(...)` driver with a `NotebookLMClient` built from `AuthTokens.from_storage(COOKIE_PATH)`.
- Implement `run_notebooklm(job)` against the real API:
  1. Create or reuse a notebook (`client.notebooks.create(title)` or `client.notebooks.get(remote_id)`).
  2. Add each source via `sources.add_file(...)` (PDFs we download from the signed URL to a temp file first), `sources.add_url(...)`, `sources.add_text(...)` — passing `wait=True` so processing finishes before generation.
  3. For each requested output: kick off the matching `generate_*`, then `artifacts.wait_for_completion(...)`, then `download_*` into a temp file, then read bytes and append to the artifacts list.
  4. Update `progress` between steps (10 → 30 sources, 30 → 80 generation, 80 → 100 upload).
- Keep the same upload-to-Supabase flow (it already works).
- Keep the same heartbeat / polling loop.
- Because `AuthTokens.from_storage` is async, we will run the driver inside a small `asyncio.run(...)` per job (simplest, no event-loop churn).

### 2. Adjust the cookie expectations
- Update `worker/README.md` and the in-app `Admin → Worker → Cookie` description to say "upload your Playwright `storage_state.json` produced by `python login.py`" (instead of "Google cookies JSON"). The file format is the same one we already produce — we just need the wording correct so the user doesn't try to paste a browser-extension cookie export.
- No code change in the cookie upload edge function — it already stores whatever JSON is uploaded.

### 3. Pin `notebooklm-py` to a known-good version
- Change `worker/requirements.txt` from `notebooklm-py>=0.1.0` to `notebooklm-py>=0.3.4,<0.4` so Railway installs the version we built against.

### 4. No database changes, no edge function changes, no UI changes required.

## How the user verifies after we ship

1. Railway will auto-redeploy on push (~2 min).
2. Open **Admin → Worker** — the heartbeat should refresh within 30 s.
3. Re-queue the same PDF job. Expected timeline:
   - `queued` → `running` within ~10 s
   - `progress 10–30%` while the PDF is being uploaded to NotebookLM (~30–60 s)
   - `progress 30–80%` while NotebookLM generates the slide deck (~2–5 min)
   - `progress 80–100%` while the .pptx is uploaded to our storage (~10 s)
   - `done` — the slides appear in the notebook.
4. If it fails, the error message shown in the UI will be a real `notebooklm-py` exception (e.g. `AuthError`, `RateLimitError`, `SourceTimeoutError`) and we can act on it specifically.

## Honest caveats

- This depends on an unofficial library that scrapes Google. It can break when Google changes things.
- Generation is genuinely slow (Google-side), especially for slide decks and audio — minutes, not seconds.
- The cookie expires periodically; when it does, jobs will fail with `AuthError` and the user re-runs `python login.py` and re-uploads the storage state.
