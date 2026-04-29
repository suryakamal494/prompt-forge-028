## Goal

Pivot the app to a **manual content library** for CBSE Classes 5–8. Employees upload finished assets tagged Class → Subject → Chapter → Title → Content Type. The old NotebookLM auto-generation flow is kept in code but **hidden behind an admin feature flag** so we can re-enable it later.

## Permissions matrix

| Action            | Owner (employee) | Other employee | Admin |
|-------------------|:----------------:|:--------------:|:-----:|
| See item in library | ✅            | ✅ (read-only) | ✅    |
| Preview in browser  | ✅            | ✅             | ✅    |
| Edit metadata       | ✅            | ❌             | ✅    |
| Replace file        | ✅            | ❌             | ✅    |
| Download original   | ❌            | ❌             | ✅    |
| Delete              | ✅            | ❌             | ✅    |

## CBSE curriculum (hardcoded, editable in `src/lib/curriculum.ts`)

- **Class 5**: English, Hindi, Mathematics, EVS, General Knowledge, Computer Science
- **Class 6**: English, Hindi, Mathematics, Science, Social Science, Sanskrit, Computer Science
- **Class 7**: English, Hindi, Mathematics, Science, Social Science, Sanskrit, Computer Science
- **Class 8**: English, Hindi, Mathematics, Science, Social Science, Sanskrit, Computer Science

## Database changes

### New table `content_items`

```
id              uuid PK
owner_id        uuid not null
class_level     int  not null (5..8)
subject         text not null
chapter         text not null
title           text not null
content_type    enum('pptx','pdf','flashcards_json','image','other')
storage_path    text not null
mime_type       text
bytes           int
created_at      timestamptz
updated_at      timestamptz
```

Indexes on `(class_level, subject, chapter)` and `owner_id`.

### RLS on `content_items`

- `owner_write`: owner can INSERT/UPDATE/DELETE own rows.
- `team_read`: any approved user can SELECT all rows (read-only collaboration).
- `admin_all`: admins via `has_role` get full access.

### New table `app_settings` (key/value, single row pattern)

```
key   text PK
value jsonb
updated_at timestamptz
updated_by uuid
```

Seed row: `('notebooklm_enabled', 'false')`. Only admins can read/update.

### Storage bucket `content-library` (private)

Storage RLS:
- INSERT: authenticated; path must start with `{auth.uid()}/`.
- SELECT: any approved authenticated user (so previews work for everyone).
- UPDATE/DELETE: owner of the path or admin.

Download protection is enforced at the **UI layer** — non-admins never see a download button and we don't expose signed URLs to them outside of the embedded preview.

## Frontend changes

### Sidebar (`AppLayout.tsx`)

Always visible:
- Dashboard
- **Library** (new content library)
- **Upload** (approved users)
- Account

Conditionally visible:
- **Notebooks**, **Jobs** — only if `notebooklm_enabled = true` OR user is admin (admins always see them so they can re-enable).
- Admin: Approvals, Users, Worker, **Settings** (new).

### `/upload` (new page)

Single-file form. **One file per submission** (no batch).

Fields:
- Class (5–8 select)
- Subject (filtered by class)
- Chapter (combobox — pick from existing chapters for that class+subject, or type new)
- Title (text)
- Content type (PPTX / PDF / Flashcards JSON / Image / Other) — also constrains accepted file extension
- File picker (50 MB cap)

On submit: upload to `content-library/{user.id}/{uuid}-{filename}`, insert `content_items`, redirect to `/library`.

### `/library` (rewritten)

Filter bar (sticky):
- Class · Subject · Chapter · Content type · Owner (admin only) · free-text search on title.
- Tabs: **All** (everyone, read-only for non-owners) and **Mine** (only my uploads).

Grid of cards:
- Title, content-type badge, `Class N · Subject · Chapter`, uploader name, created date.
- Buttons:
  - **Preview** — everyone.
  - **Edit** — owner + admin.
  - **Replace file** — owner + admin.
  - **Download** — admin only.
  - **Delete** — owner + admin.

### `ContentPreview` dialog

- **PPTX** → embed via Office Online viewer using a short-lived signed URL: `https://view.officeapps.live.com/op/embed.aspx?src=<encoded signed url>`.
- **PDF** → `<iframe>` of the signed URL.
- **Image** → `<img>`.
- **Flashcards JSON** → simple in-app flip-card viewer.

### `/admin/settings` (new admin page)

Toggle: **"Enable NotebookLM auto-generation"**. When off:
- Sidebar hides Notebooks/Jobs for non-admins.
- `NotebookDetail` "Queue job" button is disabled with a notice.
- New notebook creation is hidden.

Admins can flip it back on at any time. All existing NotebookLM code, worker, edge functions, tables stay intact.

### Dashboard

Stat cards: **My uploads**, **Library total**, **Subjects covered**.
Quick CTA: "Upload content".

## Files

**New**
- `src/lib/curriculum.ts`
- `src/hooks/useAppSettings.ts` — fetches `notebooklm_enabled`, cached.
- `src/pages/Upload.tsx`
- `src/pages/Library.tsx` (replaces `LibraryPage.tsx`)
- `src/pages/admin/Settings.tsx`
- `src/components/ContentPreview.tsx`
- `src/components/ChapterCombobox.tsx`

**Edited**
- `src/App.tsx` — add `/upload`, `/admin/settings`; point `/library` to new page.
- `src/components/AppLayout.tsx` — new nav, gate Notebooks/Jobs by feature flag.
- `src/pages/Dashboard.tsx` — new stats and CTAs.
- `src/pages/NotebookDetail.tsx` — disable "Queue job" when flag off.

**Migrations**
- Create `content_kind` enum, `content_items` table + RLS + indexes.
- Create `app_settings` table + RLS (admin only) + seed row.
- Create `content-library` storage bucket + storage policies.

## Out of scope

- True download-blocking for PPT/PDF (Office viewer toolbar may still allow save). Real prevention requires server-rendered thumbnails, which we can add later if needed.
- Chapter master table — chapters remain free-text, deduped via existing rows in the combobox.
- Touching/removing any NotebookLM, worker, or jobs code.
