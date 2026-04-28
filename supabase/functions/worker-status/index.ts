// Public read-only endpoint: returns whether any worker has pinged in the last 90s.
// Used by the Notebook detail page to warn users before queueing a job.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } }
  );

  const { data } = await admin
    .from("worker_heartbeats")
    .select("last_seen")
    .order("last_seen", { ascending: false })
    .limit(1)
    .maybeSingle();

  const lastSeen = data?.last_seen ? new Date(data.last_seen).getTime() : 0;
  const online = lastSeen > 0 && Date.now() - lastSeen < 90_000;

  return new Response(JSON.stringify({ online, last_seen: data?.last_seen ?? null }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
