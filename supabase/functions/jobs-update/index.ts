// Worker reports progress / completion / failure on a job.
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

  const { job_id, status, progress, message, error, remote_notebook_id } = await req.json();
  if (!job_id) {
    return new Response(JSON.stringify({ error: "job_id required" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supa = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const patch: Record<string, unknown> = {};
  if (status) patch.status = status;
  if (typeof progress === "number") patch.progress = progress;
  if (message !== undefined) patch.message = message;
  if (error !== undefined) patch.error = error;
  if (status === "done" || status === "failed" || status === "cancelled") {
    patch.finished_at = new Date().toISOString();
  }

  const { data: jobRow, error: upErr } = await supa
    .from("jobs")
    .update(patch)
    .eq("id", job_id)
    .select("notebook_id")
    .maybeSingle();
  if (upErr) {
    return new Response(JSON.stringify({ error: upErr.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Optionally store the remote notebook id for reuse
  if (remote_notebook_id && jobRow?.notebook_id) {
    await supa
      .from("notebooks")
      .update({ remote_notebook_id })
      .eq("id", jobRow.notebook_id);
  }

  return new Response(JSON.stringify({ ok: true }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
