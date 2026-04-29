import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChapterCombobox } from "@/components/ChapterCombobox";
import { CLASS_LEVELS, CONTENT_TYPES, SUBJECTS_BY_CLASS, type ClassLevel, type ContentType } from "@/lib/curriculum";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Loader2, Upload as UploadIcon } from "lucide-react";
import { toast } from "sonner";

export default function Upload() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [classLevel, setClassLevel] = useState<ClassLevel | null>(null);
  const [subject, setSubject] = useState<string>("");
  const [chapter, setChapter] = useState("");
  const [title, setTitle] = useState("");
  const [contentType, setContentType] = useState<ContentType>("pptx");
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const subjects = useMemo(() => (classLevel ? SUBJECTS_BY_CLASS[classLevel] : []), [classLevel]);
  const accept = useMemo(() => CONTENT_TYPES.find((c) => c.value === contentType)?.accept ?? "*/*", [contentType]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !classLevel || !subject || !chapter.trim() || !title.trim() || !file) {
      toast.error("Please fill all fields and choose a file.");
      return;
    }
    if (file.size > 50 * 1024 * 1024) {
      toast.error("File must be under 50 MB.");
      return;
    }
    setSubmitting(true);
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${user.id}/${crypto.randomUUID()}-${safeName}`;
    const { error: upErr } = await supabase.storage.from("content-library").upload(path, file, {
      contentType: file.type || undefined,
      upsert: false,
    });
    if (upErr) {
      setSubmitting(false);
      toast.error(upErr.message);
      return;
    }
    const { error: insErr } = await supabase.from("content_items").insert({
      owner_id: user.id,
      class_level: classLevel,
      subject,
      chapter: chapter.trim(),
      title: title.trim(),
      content_type: contentType,
      storage_path: path,
      mime_type: file.type || null,
      bytes: file.size,
    });
    setSubmitting(false);
    if (insErr) {
      toast.error(insErr.message);
      await supabase.storage.from("content-library").remove([path]);
      return;
    }
    toast.success("Uploaded to library.");
    navigate("/library");
  };

  return (
    <AppLayout>
      <header className="mb-8">
        <h1 className="font-serif text-4xl">Upload content</h1>
        <p className="text-muted-foreground mt-1">Add one file to the shared library.</p>
      </header>

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle className="font-serif">Details</CardTitle>
          <CardDescription>Choose the class, subject, chapter and title for this asset.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Class</Label>
                <Select
                  value={classLevel ? String(classLevel) : ""}
                  onValueChange={(v) => {
                    setClassLevel(Number(v) as ClassLevel);
                    setSubject("");
                  }}
                >
                  <SelectTrigger><SelectValue placeholder="Select class" /></SelectTrigger>
                  <SelectContent>
                    {CLASS_LEVELS.map((c) => (
                      <SelectItem key={c} value={String(c)}>Class {c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Subject</Label>
                <Select value={subject} onValueChange={setSubject} disabled={!classLevel}>
                  <SelectTrigger><SelectValue placeholder={classLevel ? "Select subject" : "Pick class first"} /></SelectTrigger>
                  <SelectContent>
                    {subjects.map((s) => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Chapter</Label>
              <ChapterCombobox classLevel={classLevel} subject={subject || null} value={chapter} onChange={setChapter} />
            </div>

            <div className="space-y-2">
              <Label>Title</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Light – Reflection deck" />
            </div>

            <div className="space-y-2">
              <Label>Content type</Label>
              <Select value={contentType} onValueChange={(v) => setContentType(v as ContentType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CONTENT_TYPES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>File (max 50 MB)</Label>
              <Input type="file" accept={accept} onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            </div>

            <Button type="submit" disabled={submitting} className="bg-gradient-brand shadow-elegant">
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <><UploadIcon className="mr-2 h-4 w-4" />Upload</>}
            </Button>
          </form>
        </CardContent>
      </Card>
    </AppLayout>
  );
}
