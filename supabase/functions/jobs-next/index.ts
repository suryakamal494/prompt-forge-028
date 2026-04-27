// Worker pulls the next queued job, claims it (status=running), and returns
// signed URLs for all source files it needs to download.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const expected = Deno.env.get("WORKER_API_TOKEN");
  const got = req.headers.get("x-worker-token");
  if (!expected || got !== expected) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const body = await req.json().catch(() => ({}));
  const workerId: string = body.worker_id ?? "unknown";

  const supa = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // Find oldest queued job; claim it atomically by setting status=running.
  const { data: candidates } = await supa
    .from("jobs")
    .select("id")
    .eq("status", "queued")
    .order("created_at", { ascending: true })
    .limit(1);

  if (!candidates || candidates.length === 0) {
    return new Response(JSON.stringify({ job: null }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const jobId = candidates[0].id;
  const { data: claimed, error: claimErr } = await supa
    .from("jobs")
    .update({
      status: "running",
      started_at: new Date().toISOString(),
      worker_id: workerId,
      attempts: 1,
    })
    .eq("id", jobId)
    .eq("status", "queued") // race-safe
    .select("*")
    .maybeSingle();

  if (claimErr || !claimed) {
    return new Response(JSON.stringify({ job: null }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Load the notebook + sources
  const [{ data: notebook }, { data: sources }] = await Promise.all([
    supa.from("notebooks").select("*").eq("id", claimed.notebook_id).maybeSingle(),
    supa.from("sources").select("*").eq("notebook_id", claimed.notebook_id),
  ]);

  // Sign URLs for any pdf sources (1 hour)
  const signedSources = await Promise.all(
    (sources ?? []).map(async (s) => {
      if (s.kind === "pdf" && s.storage_path) {
        const { data: signed } = await supa.storage
          .from("sources")
          .createSignedUrl(s.storage_path, 3600);
        return { ...s, signed_url: signed?.signedUrl ?? null };
      }
      return s;
    })
  );

  return new Response(
    JSON.stringify({
      job: claimed,
      notebook,
      sources: signedSources,
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
});
