## Goal

Make `thedonut.ai@gmail.com` the real admin of the Workbench, replacing the temporary `admin@test.local` account. Keep the suspended `dev@test.local` user untouched.

## What will happen

1. **Delete the old test admin** (`admin@test.local`) from auth + profile + roles. Cascade rules already remove the linked `profiles` and `user_roles` rows when the auth user is deleted.
2. **Pre-create your admin account** via an edge function call (using the service role key) so the user `thedonut.ai@gmail.com` exists with:
   - `email_confirmed = true` (no verification email needed — auto-confirm is already on)
   - A **temporary one-time password** that you'll use for your very first sign-in
3. **Promote** that user to:
   - `profiles.status = 'approved'`
   - `user_roles.role = 'admin'`
4. **Show you the temporary password** in chat, exactly once. You sign in at `/auth`, then immediately change it from a new "Account settings" link in the sidebar.
5. **Add a small "Change password" page** at `/account` so you can rotate the temp password the moment you log in. Accessible to any signed-in approved user.

## After this runs

- Sign in at `/auth` with:
  - Email: `thedonut.ai@gmail.com`
  - Password: *(the temp string I'll print in chat)*
- You'll land on `/dashboard` as Admin.
- Click your name in the sidebar → **Account** → set a real password.
- `dev@test.local` stays in the Users list as a suspended developer (you can delete or re-enable later from `/admin/users`).

## Technical details

**Migration / data steps (run via tools, not committed as a schema migration):**
- Use the database insert tool to:
  ```sql
  -- This will be executed via Supabase admin API, not raw SQL,
  -- because we need to delete from auth.users (reserved schema)
  ```
- Actual deletion of `admin@test.local` and creation of `thedonut.ai@gmail.com` happens through a **one-shot admin script** invoked with the service role key (Lovable Cloud has access). Steps:
  1. `supabase.auth.admin.deleteUser(<admin@test.local id>)` → cascades to `profiles` + `user_roles`.
  2. `supabase.auth.admin.createUser({ email: 'thedonut.ai@gmail.com', password: <random 24-char>, email_confirm: true, user_metadata: { display_name: 'Admin' } })`.
  3. The existing `handle_new_user()` trigger inserts a `profiles` row as `pending` + a `developer` role (since other users already exist).
  4. Update that profile to `status='approved', approved_at=now()` and replace the role row with `'admin'`.
- Print the generated temp password in chat for you to copy.

**New file:**
- `src/pages/Account.tsx` — simple form calling `supabase.auth.updateUser({ password })`. Validates min 8 chars + confirmation field.
- Route `/account` added to `App.tsx` behind `<ProtectedRoute>`.
- Sidebar (`AppLayout.tsx`) — make the user-name area in the footer clickable, linking to `/account`.

**No schema changes.** No edits to `client.ts`, `types.ts`, or `.env`.

## Risks / notes

- The temp password is shown in plain text in chat once. Change it immediately after first sign-in.
- If you'd rather type your own password directly, say so and I'll instead just sign you up normally through the form and then promote your account — but that requires you to register in the UI first.
