// Admin-only: store the uploaded google_cookies.json into the private
// "worker-cookies" bucket as `current.json`. Authenticates via the user's JWT
// and verifies the caller has the 'admin' role.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const auth = req.headers.get("Authorization") ?? "";
  const jwt = auth.replace(/^Bearer\s+/i, "");
  if (!jwt) {
    return new Response(JSON.stringify({ error: "missing token" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } }
  );

  const { data: userRes, error: userErr } = await admin.auth.getUser(jwt);
  if (userErr || !userRes.user) {
    return new Response(JSON.stringify({ error: "invalid token" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { data: roleRow } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", userRes.user.id)
    .eq("role", "admin")
    .maybeSingle();
  if (!roleRow) {
    return new Response(JSON.stringify({ error: "forbidden" }), {
      status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let body: unknown;
  try { body = await req.json(); } catch {
    return new Response(JSON.stringify({ error: "invalid json" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  // Accept either a Playwright storage_state object ({cookies:[...], origins:[...]})
  // or a bare cookie array (legacy). Normalize to a storage_state object so
  // notebooklm-py's AuthTokens.from_storage(...) can read it directly.
  const { storage_state, cookies } = body as { storage_state?: unknown; cookies?: unknown };
  let payload: { cookies: unknown[]; origins: unknown[] };
  if (storage_state && typeof storage_state === "object" && Array.isArray((storage_state as any).cookies)) {
    const ss = storage_state as { cookies: unknown[]; origins?: unknown[] };
    payload = { cookies: ss.cookies, origins: Array.isArray(ss.origins) ? ss.origins : [] };
  } else if (Array.isArray(cookies) && cookies.length > 0) {
    payload = { cookies, origins: [] };
  } else {
    return new Response(JSON.stringify({ error: "expected storage_state object with a cookies array" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const json = JSON.stringify(payload, null, 2);
  const { error: upErr } = await admin.storage
    .from("worker-cookies")
    .upload("current.json", new Blob([json], { type: "application/json" }), {
      upsert: true,
      contentType: "application/json",
    });
  if (upErr) {
    return new Response(JSON.stringify({ error: upErr.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response(
    JSON.stringify({ ok: true, cookie_count: payload.cookies.length, uploaded_at: new Date().toISOString() }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
});
