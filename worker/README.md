# NotebookLM Workbench — Worker

Runs the headless browser that drives Google NotebookLM and produces your slide
decks, reports, quizzes, and flashcards. Designed to deploy to **Railway.app**
on the **Hobby plan ($5/month)**.

---

## What this is

A long-running Python process that:
1. Polls your Workbench's Supabase edge functions every 5 seconds for queued jobs.
2. For each job: opens NotebookLM in a headless Chromium, adds the sources, generates the requested outputs (PPTX, PDF, MD, JSON, HTML).
3. Uploads the artifacts back to Workbench storage and marks the job done.
4. Sends a heartbeat every 30 seconds so the admin dashboard knows it's alive.

It uses the [`notebooklm-py`](https://github.com/teng-lin/notebooklm-py) library
under the hood.

---

## One-time setup checklist

You need three things:
- A **dedicated Google account** for NotebookLM (do NOT use a personal account).
- A **GitHub account** (free) to host this `worker/` folder.
- A **Railway.app account** (sign up at https://railway.app, $5/mo Hobby plan).

You also need two values from Workbench:
- `SUPABASE_FUNCTIONS_URL` — looks like `https://<project>.functions.supabase.co`
- `WORKER_API_TOKEN` — the shared secret your admin set in Workbench

---

## Step 1 — Push the worker to GitHub

1. Create an empty private repo on GitHub, e.g. `notebooklm-worker`.
2. Copy the contents of this `worker/` folder into the repo and push.

```
worker/
├── Dockerfile
├── requirements.txt
├── worker.py
├── login.py
└── README.md
```

---

## Step 2 — Deploy on Railway

1. Go to https://railway.app/new → **Deploy from GitHub repo** → pick `notebooklm-worker`.
2. Railway detects the `Dockerfile` and starts building. Wait until the build succeeds.
3. Open the new service → **Variables** → add:

   | Variable | Value |
   |---|---|
   | `SUPABASE_FUNCTIONS_URL` | `https://<your-project>.functions.supabase.co` |
   | `WORKER_API_TOKEN` | (the same secret saved in Workbench) |
   | `WORKER_ID` | `railway-1` (any short label) |
   | `COOKIE_PATH` | `/data/google_cookies.json` |
   | `POLL_INTERVAL` | `5` |

4. Open **Settings → Volumes** → click **+ New Volume**, mount path **`/data`**, size **1 GB**.
   (This is where the Google login cookies are persisted between restarts.)

5. The service will keep restarting because `google_cookies.json` doesn't exist yet — that's expected. Move to step 3.

---

## Step 3 — Capture the Google login cookie (one-time)

Railway lets you open a shell into a running container. Because Chromium
needs a screen to log in, we use a small trick: run `login.py` from your
**local machine** instead, then upload the cookie file to the Railway volume.

### Option A (easiest): run locally, then upload

On your laptop:

```bash
git clone <your-fork-url> notebooklm-worker
cd notebooklm-worker
pip install -r requirements.txt
python -m playwright install chromium
COOKIE_PATH=./google_cookies.json python login.py
```

A real Chrome window opens. Sign in to your dedicated Google account, wait
until NotebookLM home loads, then go back to the terminal and press **Enter**.
A `google_cookies.json` file appears.

Now upload that file to Railway:
- Open Railway → service → **Volumes** tab → **Browse files** → upload
  `google_cookies.json` to `/data/google_cookies.json`.

Restart the service. The logs should now show:

```
Worker railway-1 v0.1.0 starting. Polling every 5s.
```

### Option B: use a remote desktop

If you can't run Chromium locally, spin up a small VM with a desktop
(e.g. a free-tier GCE VM with VNC), run `login.py` there, then SCP the
cookies into Railway's volume.

---

## Step 4 — Verify

In Workbench → **Admin → Worker**, you should see your worker listed as
**Online** within a minute. Create a notebook, add a source, queue a job,
and watch the status flip from **Queued → Running → Done** in the Jobs tab.

---

## Costs (realistic)

- **Railway Hobby**: $5/mo includes $5 of usage credit. A single small worker
  typically uses **$3–$8/mo** of compute depending on how many jobs run.
- **Storage volume**: 1 GB × $0.25 = $0.25/mo.
- **Egress**: tiny (text uploads + occasional PPTX/PDF downloads).

If your usage explodes (hundreds of jobs/day), the simplest scale path is to
bump the Railway service to **2 GB RAM** in Settings → Resources.

---

## Refreshing cookies

Google cookies expire every few weeks. If the worker logs start showing
`auth required` or similar, repeat **Step 3** to capture fresh cookies and
re-upload to the volume.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| `cookie file not found` on startup | You skipped Step 3. Upload `google_cookies.json` to `/data` on the Railway volume. |
| Worker shows **Offline** in admin | Check Railway logs. Most common cause: wrong `SUPABASE_FUNCTIONS_URL` or `WORKER_API_TOKEN`. |
| Job stuck in **Running** | Open Railway logs to see the Playwright trace. Often a NotebookLM UI change — update `notebooklm-py`: `pip install -U notebooklm-py` and redeploy. |
| Out of memory crashes | Settings → Resources → bump to 2 GB. |
| Need to migrate hosts | The `Dockerfile` is portable. Same image runs on Hetzner, Fly.io, DO, Render, etc. |

---

## Updating the worker

Push to GitHub. Railway auto-redeploys. That's it.
