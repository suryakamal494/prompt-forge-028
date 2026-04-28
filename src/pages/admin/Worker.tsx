import { useEffect, useRef, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Loader2, Server, Copy, Check, Upload, FileJson, ShieldAlert, ExternalLink,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";

interface Heartbeat {
  worker_id: string;
  last_seen: string;
  version: string | null;
  queue_depth: number | null;
  notes: string | null;
}

const PROJECT_ID = import.meta.env.VITE_SUPABASE_PROJECT_ID as string;
const FUNCTIONS_URL = `https://${PROJECT_ID}.functions.supabase.co`;

export default function WorkerAdmin() {
  const [hbs, setHbs] = useState<Heartbeat[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    document.title = "Worker — Workbench Admin";
    load();
    const i = setInterval(load, 15000);
    return () => clearInterval(i);
  }, []);

  const load = async () => {
    const { data } = await supabase
      .from("worker_heartbeats")
      .select("*")
      .order("last_seen", { ascending: false });
    setHbs((data as Heartbeat[]) ?? []);
    setLoading(false);
  };

  return (
    <AppLayout>
      <header className="mb-8">
        <h1 className="font-serif text-4xl">Worker</h1>
        <p className="text-muted-foreground mt-1">
          Status, deployment setup, and Google cookie for the NotebookLM worker.
        </p>
      </header>

      <Tabs defaultValue="status">
        <TabsList>
          <TabsTrigger value="status">Status</TabsTrigger>
          <TabsTrigger value="setup">Setup</TabsTrigger>
          <TabsTrigger value="cookie">Cookie</TabsTrigger>
        </TabsList>

        <TabsContent value="status" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="font-serif text-xl">Heartbeats</CardTitle>
              <CardDescription>Workers ping in every 30 seconds.</CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex justify-center py-10">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : hbs.length === 0 ? (
                <div className="flex flex-col items-center py-10 text-muted-foreground">
                  <Server className="h-8 w-8 mb-2" />
                  <p>No worker has connected yet.</p>
                  <p className="text-xs mt-2">Use the <strong>Setup</strong> tab to deploy on Railway.</p>
                </div>
              ) : (
                <ul className="divide-y">
                  {hbs.map((h) => {
                    const ageMs = Date.now() - new Date(h.last_seen).getTime();
                    const online = ageMs < 90_000;
                    return (
                      <li key={h.worker_id} className="py-4 flex items-center gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="font-medium font-mono text-sm truncate">{h.worker_id}</div>
                          <div className="text-xs text-muted-foreground">
                            Last seen {formatDistanceToNow(new Date(h.last_seen))} ago
                            {h.version && ` · v${h.version}`}
                            {h.queue_depth !== null && ` · queue: ${h.queue_depth}`}
                          </div>
                        </div>
                        <Badge variant={online ? "default" : "destructive"}>
                          {online ? "Online" : "Offline"}
                        </Badge>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="setup" className="mt-4">
          <SetupTab />
        </TabsContent>

        <TabsContent value="cookie" className="mt-4">
          <CookieTab />
        </TabsContent>
      </Tabs>
    </AppLayout>
  );
}

function CopyRow({ label, value, secret = false }: { label: string; value: string; secret?: boolean }) {
  const [copied, setCopied] = useState(false);
  const [revealed, setRevealed] = useState(!secret);
  return (
    <div className="space-y-1">
      <Label className="text-xs uppercase tracking-wider text-muted-foreground">{label}</Label>
      <div className="flex gap-2">
        <Input
          readOnly
          value={revealed ? value : "•".repeat(Math.min(value.length, 32))}
          className="font-mono text-xs"
        />
        {secret && (
          <Button variant="outline" size="sm" onClick={() => setRevealed((r) => !r)}>
            {revealed ? "Hide" : "Reveal"}
          </Button>
        )}
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
        >
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
}

function SetupTab() {
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchToken = async () => {
    setLoading(true);
    const { data, error } = await supabase.functions.invoke("worker-token-reveal");
    setLoading(false);
    if (error) {
      toast.error("Could not load token: " + error.message);
      return;
    }
    setToken((data as any)?.token ?? null);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="font-serif text-xl">Railway environment variables</CardTitle>
          <CardDescription>
            Paste these into your Railway service → Variables tab. The worker reads them on startup.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <CopyRow label="SUPABASE_FUNCTIONS_URL" value={FUNCTIONS_URL} />
          <div className="space-y-1">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">
              WORKER_API_TOKEN
            </Label>
            {token ? (
              <CopyRow label="" value={token} secret />
            ) : (
              <Button onClick={fetchToken} disabled={loading} variant="outline" size="sm">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Reveal token"}
              </Button>
            )}
          </div>
          <CopyRow label="WORKER_ID" value="railway-1" />
          <CopyRow label="COOKIE_PATH" value="/data/google_cookies.json" />
          <CopyRow label="POLL_INTERVAL" value="5" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="font-serif text-xl">Deploy steps</CardTitle>
          <CardDescription>One-time deployment on Railway.app.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <ol className="list-decimal pl-5 space-y-2">
            <li>
              In Lovable, click <strong>GitHub → Connect</strong> and create a new repo for this project.
            </li>
            <li>
              Sign up at <a className="underline" href="https://railway.app" target="_blank" rel="noreferrer">railway.app <ExternalLink className="inline h-3 w-3" /></a> using the same GitHub account.
            </li>
            <li>
              <strong>New Project → Deploy from GitHub repo</strong>, pick this repository.
            </li>
            <li>
              In the service <strong>Settings</strong>, set <em>Root Directory</em> to <code className="px-1 rounded bg-muted">/worker</code>. Railway will auto-detect the Dockerfile.
            </li>
            <li>
              In <strong>Variables</strong>, paste the 5 values from above.
            </li>
            <li>
              In <strong>Volumes</strong>, add a 1 GB volume mounted at <code className="px-1 rounded bg-muted">/data</code>.
            </li>
            <li>
              Deploy. Then upload the Google cookie via the <strong>Cookie</strong> tab — the worker fetches it on startup and writes it to the volume.
            </li>
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}

function CookieTab() {
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState<{ count: number; uploaded_at: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    if (!file.name.endsWith(".json")) {
      toast.error("Please upload a .json file exported from the Chrome cookie extension.");
      return;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(await file.text());
    } catch {
      toast.error("That file is not valid JSON.");
      return;
    }
    if (!Array.isArray(parsed) || parsed.length === 0) {
      toast.error("Cookie file must be a JSON array.");
      return;
    }
    setBusy(true);
    const { data, error } = await supabase.functions.invoke("worker-cookie-upload", {
      body: { cookies: parsed },
    });
    setBusy(false);
    if (error) {
      toast.error("Upload failed: " + error.message);
      return;
    }
    const res = data as { cookie_count: number; uploaded_at: string };
    setInfo({ count: res.cookie_count, uploaded_at: res.uploaded_at });
    toast.success(`Uploaded ${res.cookie_count} cookies. The worker will pick them up on next restart.`);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="font-serif text-xl">How to capture the cookie</CardTitle>
          <CardDescription>5 minutes, no Python install needed.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <ol className="list-decimal pl-5 space-y-2">
            <li>
              In Chrome, install the extension <a className="underline" target="_blank" rel="noreferrer" href="https://chromewebstore.google.com/detail/get-cookiestxt-locally/cclelndahbckbenkjhflpdbgdldlbecc">
                "Get cookies.txt LOCALLY" <ExternalLink className="inline h-3 w-3" />
              </a>.
            </li>
            <li>
              Open <a className="underline" target="_blank" rel="noreferrer" href="https://notebooklm.google.com">notebooklm.google.com</a> and sign in with the Gmail account you want the worker to use.
            </li>
            <li>
              Click the extension icon → <strong>Format: JSON</strong> → <strong>Export</strong>. Save the file.
            </li>
            <li>
              Drag the file into the box below, or click to browse.
            </li>
          </ol>
          <div className="flex items-start gap-2 rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground">
            <ShieldAlert className="h-4 w-4 mt-0.5 shrink-0" />
            <div>
              The cookie is uploaded to a private bucket only the admin and the worker can read.
              Re-upload whenever Google makes you sign in again (usually every few weeks).
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="font-serif text-xl">Upload google_cookies.json</CardTitle>
          <CardDescription>Drag a file or click to browse.</CardDescription>
        </CardHeader>
        <CardContent>
          <Label
            htmlFor="cookie-upload"
            className="flex flex-col items-center justify-center border-2 border-dashed rounded-md py-10 cursor-pointer hover:bg-accent/40 transition"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const f = e.dataTransfer.files?.[0];
              if (f) handleFile(f);
            }}
          >
            {busy ? (
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            ) : (
              <>
                <Upload className="h-6 w-6 text-muted-foreground mb-2" />
                <span className="text-sm">Drop cookies.json here, or click to browse</span>
                <span className="text-xs text-muted-foreground mt-1">JSON exported from the Chrome extension</span>
              </>
            )}
            <Input
              id="cookie-upload"
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
                if (fileRef.current) fileRef.current.value = "";
              }}
            />
          </Label>

          {info && (
            <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
              <FileJson className="h-4 w-4" />
              <span>
                Last upload: {info.count} cookies, {formatDistanceToNow(new Date(info.uploaded_at))} ago.
              </span>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
