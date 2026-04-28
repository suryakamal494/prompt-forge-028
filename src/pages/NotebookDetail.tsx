import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { AppLayout } from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, FileText, Link as LinkIcon, Youtube, Type, Trash2, Upload, Loader2, Sparkles, Globe, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

const OUTPUT_OPTIONS: { value: string; label: string; group: string }[] = [
  { value: "slides_pptx", label: "Slide deck (PPTX)", group: "Slides" },
  { value: "slides_pdf", label: "Slide deck (PDF)", group: "Slides" },
  { value: "report_md", label: "Study guide (Markdown)", group: "Reports" },
  { value: "report_pdf", label: "Study guide (PDF)", group: "Reports" },
  { value: "quiz_json", label: "Quiz (JSON)", group: "Quizzes" },
  { value: "quiz_html", label: "Quiz (printable HTML)", group: "Quizzes" },
  { value: "flashcards_json", label: "Flashcards (JSON)", group: "Flashcards" },
  { value: "flashcards_html", label: "Flashcards (printable HTML)", group: "Flashcards" },
];

export default function NotebookDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [nb, setNb] = useState<any | null>(null);
  const [sources, setSources] = useState<any[]>([]);
  const [outputs, setOutputs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [picked, setPicked] = useState<string[]>(["slides_pptx", "slides_pdf"]);
  const [submitting, setSubmitting] = useState(false);
  const [workerOnline, setWorkerOnline] = useState<boolean | null>(null);

  useEffect(() => {
    if (id) load();
  }, [id]);

  useEffect(() => {
    const check = async () => {
      const { data } = await supabase.functions.invoke("worker-status");
      setWorkerOnline((data as any)?.online ?? false);
    };
    check();
    const i = setInterval(check, 20000);
    return () => clearInterval(i);
  }, []);

  const load = async () => {
    if (!id) return;
    setLoading(true);
    const [{ data: n }, { data: s }, { data: o }] = await Promise.all([
      supabase.from("notebooks").select("*").eq("id", id).maybeSingle(),
      supabase.from("sources").select("*").eq("notebook_id", id).order("created_at"),
      supabase.from("outputs").select("*").eq("notebook_id", id).order("created_at", { ascending: false }),
    ]);
    setNb(n);
    setSources(s ?? []);
    setOutputs(o ?? []);
    setLoading(false);
    if (n) document.title = `${n.title} — Workbench`;
  };

  const addUrl = async (e: React.FormEvent<HTMLFormElement>, kind: "url" | "youtube") => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const url = String(fd.get("url"));
    if (!url || !user || !id) return;
    const { error } = await supabase.from("sources").insert({
      notebook_id: id,
      owner_id: user.id,
      kind,
      url,
      title: url,
    });
    if (error) toast.error(error.message);
    else {
      (e.target as HTMLFormElement).reset();
      load();
    }
  };

  const addText = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    if (!user || !id) return;
    const { error } = await supabase.from("sources").insert({
      notebook_id: id,
      owner_id: user.id,
      kind: "text",
      title: String(fd.get("title") || "Pasted text"),
      text_content: String(fd.get("text")),
    });
    if (error) toast.error(error.message);
    else {
      (e.target as HTMLFormElement).reset();
      load();
    }
  };

  const uploadPdf = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user || !id) return;
    if (file.size > 50 * 1024 * 1024) {
      toast.error("File must be under 50 MB");
      return;
    }
    const path = `${user.id}/${id}/${Date.now()}-${file.name}`;
    const { error: upErr } = await supabase.storage.from("sources").upload(path, file);
    if (upErr) {
      toast.error(upErr.message);
      return;
    }
    const { error } = await supabase.from("sources").insert({
      notebook_id: id,
      owner_id: user.id,
      kind: "pdf",
      title: file.name,
      storage_path: path,
      bytes: file.size,
    });
    if (error) toast.error(error.message);
    else load();
    e.target.value = "";
  };

  const removeSource = async (s: any) => {
    if (s.storage_path) await supabase.storage.from("sources").remove([s.storage_path]);
    await supabase.from("sources").delete().eq("id", s.id);
    load();
  };

  const togglePublish = async () => {
    if (!nb) return;
    const next = !nb.is_published;
    const { error } = await supabase
      .from("notebooks")
      .update({ is_published: next, published_at: next ? new Date().toISOString() : null })
      .eq("id", nb.id);
    if (error) toast.error(error.message);
    else {
      toast.success(next ? "Published to team library" : "Unpublished");
      load();
    }
  };

  const submitJob = async () => {
    if (!user || !id || picked.length === 0) return;
    if (sources.length === 0) {
      toast.error("Add at least one source first.");
      return;
    }
    setSubmitting(true);
    const { error } = await supabase.from("jobs").insert({
      notebook_id: id,
      owner_id: user.id,
      outputs_requested: picked as any,
    });
    setSubmitting(false);
    if (error) toast.error(error.message);
    else {
      toast.success("Job queued. Worker will pick it up shortly.");
      load();
    }
  };

  if (loading) {
    return (
      <AppLayout>
        <div className="flex justify-center py-20">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      </AppLayout>
    );
  }

  if (!nb) {
    return (
      <AppLayout>
        <p className="text-muted-foreground">Notebook not found.</p>
        <Button asChild variant="link"><Link to="/notebooks"><ArrowLeft className="mr-1 h-4 w-4" /> Back</Link></Button>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <Button asChild variant="ghost" size="sm" className="mb-4 -ml-3">
        <Link to="/notebooks"><ArrowLeft className="mr-1 h-4 w-4" /> All notebooks</Link>
      </Button>

      <header className="mb-8 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="font-serif text-4xl truncate">{nb.title}</h1>
          {nb.description && <p className="text-muted-foreground mt-1">{nb.description}</p>}
        </div>
        <Button variant={nb.is_published ? "secondary" : "outline"} onClick={togglePublish}>
          <Globe className="mr-2 h-4 w-4" />
          {nb.is_published ? "Published" : "Publish to team"}
        </Button>
      </header>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Sources */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="font-serif">Sources</CardTitle>
            <CardDescription>Add the materials NotebookLM should use.</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="pdf">
              <TabsList>
                <TabsTrigger value="pdf"><FileText className="h-4 w-4 mr-1" />PDF</TabsTrigger>
                <TabsTrigger value="url"><LinkIcon className="h-4 w-4 mr-1" />URL</TabsTrigger>
                <TabsTrigger value="youtube"><Youtube className="h-4 w-4 mr-1" />YouTube</TabsTrigger>
                <TabsTrigger value="text"><Type className="h-4 w-4 mr-1" />Text</TabsTrigger>
              </TabsList>
              <TabsContent value="pdf">
                <Label htmlFor="pdf-upload" className="mt-4 flex flex-col items-center justify-center border-2 border-dashed rounded-md py-8 cursor-pointer hover:bg-accent/40 transition">
                  <Upload className="h-6 w-6 text-muted-foreground mb-2" />
                  <span className="text-sm">Click to upload a PDF (max 50 MB)</span>
                  <Input id="pdf-upload" type="file" accept="application/pdf" className="hidden" onChange={uploadPdf} />
                </Label>
              </TabsContent>
              <TabsContent value="url">
                <form onSubmit={(e) => addUrl(e, "url")} className="flex gap-2 mt-4">
                  <Input name="url" type="url" placeholder="https://example.com/article" required />
                  <Button type="submit">Add</Button>
                </form>
              </TabsContent>
              <TabsContent value="youtube">
                <form onSubmit={(e) => addUrl(e, "youtube")} className="flex gap-2 mt-4">
                  <Input name="url" type="url" placeholder="https://youtube.com/watch?v=..." required />
                  <Button type="submit">Add</Button>
                </form>
              </TabsContent>
              <TabsContent value="text">
                <form onSubmit={addText} className="space-y-3 mt-4">
                  <Input name="title" placeholder="Title (optional)" />
                  <Textarea name="text" rows={5} placeholder="Paste text here…" required />
                  <Button type="submit">Add text</Button>
                </form>
              </TabsContent>
            </Tabs>

            <ul className="mt-6 divide-y">
              {sources.length === 0 && <li className="text-sm text-muted-foreground py-3">No sources yet.</li>}
              {sources.map((s) => (
                <li key={s.id} className="flex items-center gap-3 py-3">
                  <SourceIcon kind={s.kind} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{s.title || s.url || "Untitled"}</div>
                    <div className="text-xs text-muted-foreground capitalize">{s.kind}</div>
                  </div>
                  <Button size="icon" variant="ghost" onClick={() => removeSource(s)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        {/* Generation */}
        <Card>
          <CardHeader>
            <CardTitle className="font-serif">Generate</CardTitle>
            <CardDescription>Pick the outputs you need.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {OUTPUT_OPTIONS.map((opt) => (
              <label key={opt.value} className="flex items-start gap-2 cursor-pointer">
                <Checkbox
                  checked={picked.includes(opt.value)}
                  onCheckedChange={(c) =>
                    setPicked((p) => (c ? [...p, opt.value] : p.filter((x) => x !== opt.value)))
                  }
                />
                <div>
                  <div className="text-sm">{opt.label}</div>
                  <div className="text-xs text-muted-foreground">{opt.group}</div>
                </div>
              </label>
            ))}
            {workerOnline === false && (
              <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>
                  No worker is online. Your job will queue but won't run until an admin starts the
                  Railway worker.
                </span>
              </div>
            )}
            <Button
              className="w-full bg-gradient-brand shadow-elegant"
              onClick={submitJob}
              disabled={submitting || picked.length === 0}
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Sparkles className="mr-2 h-4 w-4" />Queue job</>}
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Outputs */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="font-serif">Outputs</CardTitle>
          <CardDescription>Generated artifacts will appear here.</CardDescription>
        </CardHeader>
        <CardContent>
          {outputs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No outputs yet. Queue a job to get started.</p>
          ) : (
            <ul className="divide-y">
              {outputs.map((o) => (
                <li key={o.id} className="flex items-center gap-3 py-3">
                  <Badge variant="secondary" className="capitalize">{o.kind.replace(/_/g, " ")}</Badge>
                  <span className="text-sm font-mono text-muted-foreground truncate flex-1">{o.storage_path}</span>
                  <DownloadButton path={o.storage_path} />
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </AppLayout>
  );
}

function SourceIcon({ kind }: { kind: string }) {
  const Icon = kind === "pdf" ? FileText : kind === "youtube" ? Youtube : kind === "url" ? LinkIcon : Type;
  return (
    <div className="flex h-8 w-8 items-center justify-center rounded-md bg-accent text-accent-foreground">
      <Icon className="h-4 w-4" />
    </div>
  );
}

function DownloadButton({ path }: { path: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        const { data, error } = await supabase.storage.from("outputs").createSignedUrl(path, 60);
        setBusy(false);
        if (error) toast.error(error.message);
        else window.open(data.signedUrl, "_blank");
      }}
    >
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Download"}
    </Button>
  );
}
