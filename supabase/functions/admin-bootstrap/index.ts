// One-shot bootstrap: replace admin@test.local with thedonut.ai@gmail.com as the real admin.
// Protected by WORKER_API_TOKEN. Safe to run multiple times.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const TARGET_EMAIL = "thedonut.ai@gmail.com";
const OLD_ADMIN_EMAIL = "admin@test.local";

function genPassword(len = 20): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
  const buf = new Uint8Array(len);
  crypto.getRandomValues(buf);
  let out = "";
  for (let i = 0; i < len; i++) out += alphabet[buf[i] % alphabet.length];
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const token = req.headers.get("x-worker-token");
  if (!token || token !== Deno.env.get("WORKER_API_TOKEN")) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } }
  );

  // 1. Find + delete the old test admin (if it still exists).
  const { data: oldProfile } = await admin
    .from("profiles")
    .select("id")
    .eq("email", OLD_ADMIN_EMAIL)
    .maybeSingle();

  let deletedOld = false;
  if (oldProfile?.id) {
    const { error: delErr } = await admin.auth.admin.deleteUser(oldProfile.id);
    if (delErr) {
      return new Response(JSON.stringify({ error: `delete old admin failed: ${delErr.message}` }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    deletedOld = true;
  }

  // 2. Check whether the target user already exists.
  const { data: existingProfile } = await admin
    .from("profiles")
    .select("id")
    .eq("email", TARGET_EMAIL)
    .maybeSingle();

  let userId: string;
  let tempPassword: string | null = null;
  let created = false;

  if (existingProfile?.id) {
    userId = existingProfile.id;
  } else {
    tempPassword = genPassword();
    const { data: createRes, error: createErr } = await admin.auth.admin.createUser({
      email: TARGET_EMAIL,
      password: tempPassword,
      email_confirm: true,
      user_metadata: { display_name: "Admin" },
    });
    if (createErr || !createRes.user) {
      return new Response(JSON.stringify({ error: `create user failed: ${createErr?.message}` }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    userId = createRes.user.id;
    created = true;
  }

  // 3. Promote to approved + admin.
  const { error: profErr } = await admin
    .from("profiles")
    .update({ status: "approved", approved_at: new Date().toISOString(), display_name: "Admin" })
    .eq("id", userId);
  if (profErr) {
    return new Response(JSON.stringify({ error: `profile update: ${profErr.message}` }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Replace any roles with single admin role.
  await admin.from("user_roles").delete().eq("user_id", userId);
  const { error: roleErr } = await admin
    .from("user_roles")
    .insert({ user_id: userId, role: "admin" });
  if (roleErr) {
    return new Response(JSON.stringify({ error: `role insert: ${roleErr.message}` }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response(
    JSON.stringify({
      ok: true,
      deleted_old_admin: deletedOld,
      user_id: userId,
      created,
      email: TARGET_EMAIL,
      temp_password: tempPassword, // null if user already existed
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
  );
});
