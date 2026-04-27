# NotebookLM Workbench — Build Plan

A web platform where your content team submits source materials (PDFs, URLs, YouTube links, text) and gets back NotebookLM-generated **slide decks (PPTX + PDF)**, **reports/study guides**, and **quizzes/flashcards** — without ever touching a Google login.

The platform is built in two pieces that talk to each other over a secure API.

---

## How it works (end-user view)

1. **Register** → account is created in `pending` state. User sees a "Waiting for admin approval" screen.
2. **Admin approves** them from the Approvals tab → they get the **Content Developer** role and can log in.
3. Developer creates a **Notebook**, uploads sources (PDFs, pastes URLs/YouTube links, types notes).
4. Developer clicks **Generate** and picks outputs: Slide deck, Report, Quiz, Flashcards.
5. Job appears in their **Jobs** queue with live status: `Queued → Running → Done` (or Failed with retry).
6. When done, downloads (PPTX, PDF, MD, JSON) appear in the notebook and in the **Library**.
7. Developer can publish a finished notebook to the **Team Library** so others can reuse it.

---

## Roles

- **Admin**
  - Approves / rejects / suspends / re-enables users
  - Sees all notebooks and jobs across the team
  - Manages the Google account credentials used by the worker
  - Sees worker health (online/offline, last heartbeat, queue depth)
- **Content Developer**
  - Creates notebooks, uploads sources, runs generations
  - Owns a personal library; can publish to the Team Library
  - Sees their own jobs and download history

No email verification. Approval is fully manual by an admin.

---

## Screens

1. **Auth**
   - Sign up (email + password) → "Pending approval" screen
   - Log in → blocked with same message until approved
2. **Admin → Approvals** — pending users list with Approve / Reject buttons
3. **Admin → Users** — all users, role chips, Suspend / Re-enable / Change role
4. **Admin → Worker** — connection status, last heartbeat, Google account config, recent error log
5. **Dashboard** — recent notebooks, recent jobs, quick "New Notebook" button
6. **Notebook detail** — sources panel (add/remove), generation panel (pick outputs + settings), outputs panel (download links, regenerate)
7. **Jobs queue** — all your jobs with live status, logs, retry/cancel
8. **Library** — personal + team tabs, search, filter by output type, download

---

## Worker hosting — Railway.app

The Python worker (which actually drives NotebookLM via a headless browser) cannot run inside Lovable. It will be deployed to **Railway.app Hobby plan ($5/month)**:

- One-click deploy from a GitHub repo
- Dockerfile-based, includes Playwright + Chromium
- Persistent volume to store the Google login cookies
- Web UI for logs, restarts, env vars — no SSH or Linux admin needed
- Auto-redeploys on git push

You'll need:
- A Railway account (free to create, $5/mo for Hobby)
- A **dedicated Google account** for NotebookLM (don't use a personal one) — used once to log in and capture cookies
- A GitHub account to host the worker repo (Railway pulls from there)

Realistic monthly cost: **$5-8** for typical content-team usage.

---

## Outputs in v1

- **Slide decks** — PPTX (editable) + PDF
- **Reports / study guides** — Markdown + PDF
- **Quizzes** — JSON + printable HTML
- **Flashcards** — JSON + printable HTML

(Audio podcasts and video overviews deferred to v2 — they take much longer to generate and produce large files.)

---

## Library

- **Personal library** — every developer has their own; drafts and unpublished work live here
- **Team library** — a shared space; developers publish finished notebooks here for everyone to reuse and download

---

## Technical section (for reference)

**Web app (Lovable Cloud)**
- React + TypeScript + Tailwind + shadcn/ui frontend
- Supabase Postgres for: `profiles`, `user_roles` (separate table, `app_role` enum), `notebooks`, `sources`, `jobs`, `outputs`, `library_items`, `worker_heartbeats`
- Supabase Storage buckets: `sources` (uploads), `outputs` (generated files)
- Edge functions: `jobs-next` (worker pulls next job), `jobs-update` (worker reports progress), `jobs-upload-output` (signed URL for asset upload), `admin-approve-user`, `admin-set-role`
- Auth: email+password, signup creates profile in `pending` status, login gate checks status
- RLS on every table; admin checks via `has_role(auth.uid(), 'admin')` security-definer function
- Realtime subscription on `jobs` table for live status updates

**Worker (Railway.app)**
- Python 3.11 + `notebooklm-py` + Playwright + Chromium (in Docker)
- Long-poll loop: calls `jobs-next` every 5s with a shared `WORKER_API_TOKEN`
- For each job: downloads sources from signed URLs → runs notebooklm-py flow → uploads outputs via signed URLs → marks job done
- Heartbeat ping every 30s to `worker-heartbeat` endpoint so admin sees it's alive
- Persistent Railway volume at `/data` stores `google_cookies.json` (captured once via a one-time `login` command run from Railway shell)
- Auto-restart on crash; failed jobs retried up to 3 times with exponential backoff

**Data flow per job**
```text
Developer ──upload──▶ Storage (sources bucket)
        ──submit──▶ jobs row (status=queued)
                          │
Worker ◀──poll── jobs-next (returns job + signed source URLs)
   │
   ├─ runs NotebookLM via browser
   │
   └──upload──▶ Storage (outputs bucket) ──▶ outputs rows
                                          ──▶ jobs row (status=done)
                          │
Developer ◀──realtime── notification + download links
```

**Security**
- Worker authenticates with a long-lived `WORKER_API_TOKEN` (rotatable from admin UI)
- Google credentials never leave the Railway worker — web app never sees them
- All storage access via short-lived signed URLs
- Pending/suspended users blocked at the auth gate AND by RLS

---

## What gets built in this implementation

**In Lovable (this project):**
1. Database schema + RLS policies + roles
2. Auth + admin approval flow + pending/suspended gates
3. All screens listed above
4. Edge functions for the worker API
5. Realtime job status updates
6. Library (personal + team)

**Deliverables for you to deploy separately:**
1. A `worker/` folder with Python code, Dockerfile, and a `README` with step-by-step Railway setup (create account → connect GitHub → set env vars → deploy → run one-time Google login)
2. A short admin guide (PDF/MD) on approving users, monitoring the worker, and rotating the Google account

---

## Out of scope for v1
- Audio/video outputs (podcasts, video overviews)
- Multi-Google-account pooling (one worker = one Google account)
- Reviewer role / approval workflow for generated content
- Team workspaces / multi-tenant orgs
- Billing / subscriptions
