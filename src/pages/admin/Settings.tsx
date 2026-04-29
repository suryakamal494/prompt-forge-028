import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useNotebookLMEnabled } from "@/hooks/useAppSettings";
import { Loader2, Pencil, Trash2, Check, X } from "lucide-react";
import { toast } from "sonner";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { CLASS_LEVELS, SUBJECTS_BY_CLASS, type ClassLevel } from "@/lib/curriculum";

interface Chapter {
  id: string;
  class_level: number;
  subject: string;
  name: string;
}

export default function Settings() {
  const { value, loading, update } = useNotebookLMEnabled();

  useEffect(() => {
    document.title = "Settings — Workbench";
  }, []);

  const toggle = async (next: boolean) => {
    const err = await update(next);
    if (err) toast.error(err.message);
    else toast.success(`NotebookLM ${next ? "enabled" : "disabled"}`);
  };

  return (
    <AppLayout>
      <header className="mb-8">
        <h1 className="font-serif text-4xl">Settings</h1>
        <p className="text-muted-foreground mt-1">Workspace-wide feature flags and library management.</p>
      </header>

      <Card className="max-w-2xl mb-8">
        <CardHeader>
          <CardTitle className="font-serif">NotebookLM auto-generation</CardTitle>
          <CardDescription>
            When enabled, employees can create notebooks and queue jobs that produce slides and flashcards
            automatically through the worker. Currently experimental — keep this off until the worker is stable.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between gap-4">
            <Label htmlFor="nblm-toggle" className="text-sm">Enable NotebookLM auto-generation</Label>
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            ) : (
              <Switch id="nblm-toggle" checked={value} onCheckedChange={toggle} />
            )}
          </div>
        </CardContent>
      </Card>

      <ChaptersAdmin />
    </AppLayout>
  );
}

function ChaptersAdmin() {
  const [classLevel, setClassLevel] = useState<ClassLevel>(6);
  const [subject, setSubject] = useState<string>("");
  const [items, setItems] = useState<Chapter[]>([]);
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  const subjects = useMemo(() => SUBJECTS_BY_CLASS[classLevel], [classLevel]);

  useEffect(() => {
    if (!subjects.includes(subject)) setSubject(subjects[0] ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classLevel]);

  const load = async () => {
    if (!subject) {
      setItems([]);
      return;
    }
    setBusy(true);
    const { data, error } = await supabase
      .from("chapters")
      .select("id,class_level,subject,name")
      .eq("class_level", classLevel)
      .eq("subject", subject)
      .order("name", { ascending: true });
    setBusy(false);
    if (error) toast.error(error.message);
    else setItems((data as Chapter[]) ?? []);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classLevel, subject]);

  const startEdit = (c: Chapter) => {
    setEditingId(c.id);
    setEditName(c.name);
  };

  const saveEdit = async (c: Chapter) => {
    const next = editName.trim();
    if (!next) {
      toast.error("Name cannot be empty.");
      return;
    }
    if (next === c.name) {
      setEditingId(null);
      return;
    }
    setBusy(true);
    // 1) Rename the chapter row.
    const { error: renameErr } = await supabase
      .from("chapters")
      .update({ name: next })
      .eq("id", c.id);
    if (renameErr) {
      setBusy(false);
      toast.error(renameErr.message);
      return;
    }
    // 2) Update matching content_items rows so the Library stays consistent.
    const { error: bulkErr } = await supabase
      .from("content_items")
      .update({ chapter: next })
      .eq("class_level", c.class_level)
      .eq("subject", c.subject)
      .eq("chapter", c.name);
    setBusy(false);
    if (bulkErr) {
      toast.error(`Renamed chapter, but failed to update items: ${bulkErr.message}`);
    } else {
      toast.success("Chapter renamed.");
    }
    setEditingId(null);
    load();
  };

  const remove = async (c: Chapter) => {
    if (!confirm(`Delete chapter "${c.name}"? Existing items will keep this chapter name on them.`)) return;
    setBusy(true);
    const { error } = await supabase.from("chapters").delete().eq("id", c.id);
    setBusy(false);
    if (error) toast.error(error.message);
    else {
      toast.success("Chapter deleted.");
      load();
    }
  };

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle className="font-serif">Chapters</CardTitle>
        <CardDescription>
          Rename or remove chapters. Renaming also updates any library items that use this chapter.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Select value={String(classLevel)} onValueChange={(v) => setClassLevel(Number(v) as ClassLevel)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {CLASS_LEVELS.map((c) => <SelectItem key={c} value={String(c)}>Class {c}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={subject} onValueChange={setSubject}>
            <SelectTrigger><SelectValue placeholder="Subject" /></SelectTrigger>
            <SelectContent>
              {subjects.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {busy ? (
          <div className="flex justify-center py-6"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">No chapters yet for this selection.</p>
        ) : (
          <ul className="divide-y rounded-md border">
            {items.map((c) => (
              <li key={c.id} className="flex items-center gap-2 p-3">
                {editingId === c.id ? (
                  <>
                    <Input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") saveEdit(c); }}
                      className="flex-1"
                      autoFocus
                    />
                    <Button size="sm" variant="ghost" onClick={() => saveEdit(c)}><Check className="h-4 w-4" /></Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}><X className="h-4 w-4" /></Button>
                  </>
                ) : (
                  <>
                    <span className="flex-1 text-sm">{c.name}</span>
                    <Button size="sm" variant="ghost" onClick={() => startEdit(c)}><Pencil className="h-4 w-4" /></Button>
                    <Button size="sm" variant="ghost" className="text-destructive" onClick={() => remove(c)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
