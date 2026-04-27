// Worker requests a signed upload URL for an output file, then registers it.
// Two-step: GET a signed URL (mode=sign), then POST metadata (mode=register).
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

  const supa = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const body = await req.json();
  const { mode } = body;

  if (mode === "sign") {
    const { job_id, kind, filename } = body as {
      job_id: string;
      kind: string;
      filename: string;
    };
    const { data: job } = await supa
      .from("jobs")
      .select("owner_id,notebook_id")
      .eq("id", job_id)
      .maybeSingle();
    if (!job) {
      return new Response(JSON.stringify({ error: "job not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const path = `${job.owner_id}/${job.notebook_id}/${job_id}/${Date.now()}-${filename}`;
    const { data: signed, error } = await supa.storage
      .from("outputs")
      .createSignedUploadUrl(path);
    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    return new Response(
      JSON.stringify({ path, token: signed.token, signed_url: signed.signedUrl }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  if (mode === "register") {
    const { job_id, kind, path, bytes, mime_type } = body;
    const { data: job } = await supa
      .from("jobs")
      .select("owner_id,notebook_id")
      .eq("id", job_id)
      .maybeSingle();
    if (!job) {
      return new Response(JSON.stringify({ error: "job not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { error } = await supa.from("outputs").insert({
      job_id,
      notebook_id: job.notebook_id,
      owner_id: job.owner_id,
      kind,
      storage_path: path,
      bytes,
      mime_type,
    });
    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ error: "invalid mode" }), {
    status: 400,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
