// Worker pings every 30s so admin dashboard can show liveness.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const expected = Deno.env.get("WORKER_API_TOKEN");
  if (!expected || req.headers.get("x-worker-token") !== expected) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { worker_id, version, queue_depth, notes } = await req.json();
  if (!worker_id) {
    return new Response(JSON.stringify({ error: "worker_id required" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supa = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  await supa.from("worker_heartbeats").upsert({
    worker_id,
    last_seen: new Date().toISOString(),
    version: version ?? null,
    queue_depth: queue_depth ?? null,
    notes: notes ?? null,
  });

  return new Response(JSON.stringify({ ok: true }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
