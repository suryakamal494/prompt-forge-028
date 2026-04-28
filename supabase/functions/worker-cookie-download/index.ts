// Worker-only: returns the latest google_cookies.json contents.
// Authenticates via the WORKER_API_TOKEN shared secret.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-worker-token",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const expected = Deno.env.get("WORKER_API_TOKEN");
  if (!expected || req.headers.get("x-worker-token") !== expected) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } }
  );

  const { data, error } = await admin.storage.from("worker-cookies").download("current.json");
  if (error || !data) {
    return new Response(JSON.stringify({ error: "no cookies uploaded yet" }), {
      status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const text = await data.text();
  return new Response(text, {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
