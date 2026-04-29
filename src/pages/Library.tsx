import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { ChapterCombobox } from "@/components/ChapterCombobox";
import { ContentPreview } from "@/components/ContentPreview";
import { CLASS_LEVELS, CONTENT_TYPES, CONTENT_TYPE_LABEL, SUBJECTS_BY_CLASS, type ClassLevel, type ContentType } from "@/lib/curriculum";
import { Eye, Pencil, Download, Trash2, Loader2, Library as LibraryIcon, Plus, RefreshCw } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

interface Item {
  id: string;
  owner_id: string;
  class_level: number;
  subject: string;
  chapter: string;
  title: string;
  content_type: ContentType;
  storage_path: string;
  mime_type: string | null;
  bytes: number | null;
  created_at: string;
}

const PAGE_SIZE = 24;

export default function Library() {
  const { user, isAdmin } = useAuth();
  const [items, setItems] = useState<Item[]>([]);
  const [profiles, setProfiles] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [total, setTotal] = useState<number | null>(null);
  const [tab, setTab] = useState<"all" | "mine">("all");

  const [fClass, setFClass] = useState<string>("all");
  const [fSubject, setFSubject] = useState<string>("all");
  const [fChapter, setFChapter] = useState<string>("");
  const [fType, setFType] = useState<string>("all");
  const [fSearch, setFSearch] = useState("");

  // Debounced text filters so we don't re-query on every keystroke.
  const [dChapter, setDChapter] = useState("");
  const [dSearch, setDSearch] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDChapter(fChapter.trim()), 300);
    return () => clearTimeout(t);
  }, [fChapter]);
  useEffect(() => {
    const t = setTimeout(() => setDSearch(fSearch.trim()), 300);
    return () => clearTimeout(t);
  }, [fSearch]);

  const [previewItem, setPreviewItem] = useState<Item | null>(null);
  const [editItem, setEditItem] = useState<Item | null>(null);

  useEffect(() => {
    document.title = "Library — Workbench";
  }, []);

  // Build a query with current filters; caller adds range + count.
  const buildQuery = useCallback(() => {
    let q = supabase
      .from("content_items")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false });
    if (tab === "mine" && user?.id) q = q.eq("owner_id", user.id);
    if (fClass !== "all") q = q.eq("class_level", Number(fClass));
    if (fSubject !== "all") q = q.eq("subject", fSubject);
    if (dChapter) {
      // Exact match when the dropdown is in use; substring search otherwise.
      if (fClass !== "all" && fSubject !== "all") q = q.eq("chapter", dChapter);
      else q = q.ilike("chapter", `%${dChapter}%`);
    }
    if (fType !== "all") q = q.eq("content_type", fType as ContentType);
    if (dSearch) q = q.ilike("title", `%${dSearch}%`);
    return q;
  }, [tab, user, fClass, fSubject, dChapter, fType, dSearch]);

  const fetchPage = useCallback(
    async (from: number, replace: boolean) => {
      if (replace) setLoading(true);
      else setLoadingMore(true);
      const { data, count, error } = await buildQuery().range(from, from + PAGE_SIZE - 1);
      if (error) {
        toast.error(error.message);
        setLoading(false);
        setLoadingMore(false);
        return;
      }
      const list = (data as Item[]) ?? [];
      setTotal(count ?? null);
      setHasMore(list.length === PAGE_SIZE && (count == null || from + list.length < count));
      setItems((prev) => (replace ? list : [...prev, ...list]));

      // Load any missing profile names.
      const newOwnerIds = Array.from(new Set(list.map((i) => i.owner_id))).filter((id) => !profiles[id]);
      if (newOwnerIds.length) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("id,display_name,email")
          .in("id", newOwnerIds);
        if (profs) {
          setProfiles((prev) => {
            const next = { ...prev };
            (profs as any[]).forEach((p) => (next[p.id] = p.display_name || p.email));
            return next;
          });
        }
      }
      setLoading(false);
      setLoadingMore(false);
    },
    [buildQuery, profiles]
  );

  // Reload from page 0 whenever filters change.
  useEffect(() => {
    fetchPage(0, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, fClass, fSubject, fType, dChapter, dSearch]);

  // Infinite scroll sentinel.
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasMore && !loading && !loadingMore) {
          fetchPage(items.length, false);
        }
      },
      { rootMargin: "400px" }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [items.length, hasMore, loading, loadingMore, fetchPage]);

  const subjects = useMemo(
    () => (fClass !== "all" ? SUBJECTS_BY_CLASS[Number(fClass) as ClassLevel] : []),
    [fClass]
  );

  // Load chapter options for the chosen class + subject (used by the chapter dropdown filter)
  const [chapterOptions, setChapterOptions] = useState<string[]>([]);
  useEffect(() => {
    if (fClass === "all" || fSubject === "all") {
      setChapterOptions([]);
      return;
    }
    (async () => {
      const { data } = await supabase
        .from("chapters")
        .select("name")
        .eq("class_level", Number(fClass))
        .eq("subject", fSubject)
        .order("name", { ascending: true });
      setChapterOptions(((data as { name: string }[]) ?? []).map((d) => d.name));
    })();
  }, [fClass, fSubject]);

  // When the chapter dropdown is active, treat fChapter as an exact match instead of substring.
  const useChapterDropdown = fClass !== "all" && fSubject !== "all";

  const reload = () => fetchPage(0, true);

  const remove = async (item: Item) => {
    if (!confirm(`Delete "${item.title}"?`)) return;
    await supabase.storage.from("content-library").remove([item.storage_path]);
    const { error } = await supabase.from("content_items").delete().eq("id", item.id);
    if (error) toast.error(error.message);
    else {
      toast.success("Deleted");
      reload();
    }
  };

  const download = async (item: Item) => {
    const { data, error } = await supabase.storage.from("content-library").createSignedUrl(item.storage_path, 60, {
      download: item.storage_path.split("/").pop(),
    });
    if (error) toast.error(error.message);
    else window.open(data.signedUrl, "_blank");
  };

  return (
    <AppLayout>
      <header className="mb-6 flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-serif text-4xl">Library</h1>
          <p className="text-muted-foreground mt-1">Shared teaching content. Read-only for everyone, edit your own.</p>
        </div>
        <Button asChild className="bg-gradient-brand shadow-elegant">
          <Link to="/upload"><Plus className="mr-2 h-4 w-4" />Upload</Link>
        </Button>
      </header>

      <div className="flex items-center justify-between gap-3 mb-4">
        <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="mine">Mine</TabsTrigger>
          </TabsList>
        </Tabs>
        <Button variant="ghost" size="sm" onClick={reload}><RefreshCw className="h-4 w-4 mr-1" />Refresh</Button>
      </div>

      <Card className="mb-6">
        <CardContent className="p-4 grid md:grid-cols-5 gap-3">
          <Select value={fClass} onValueChange={(v) => { setFClass(v); setFSubject("all"); }}>
            <SelectTrigger><SelectValue placeholder="Class" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All classes</SelectItem>
              {CLASS_LEVELS.map((c) => <SelectItem key={c} value={String(c)}>Class {c}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={fSubject} onValueChange={setFSubject} disabled={fClass === "all"}>
            <SelectTrigger><SelectValue placeholder="Subject" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All subjects</SelectItem>
              {subjects.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
          {useChapterDropdown ? (
            <Select value={fChapter || "all"} onValueChange={(v) => setFChapter(v === "all" ? "" : v)}>
              <SelectTrigger><SelectValue placeholder="Chapter" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All chapters</SelectItem>
                {chapterOptions.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          ) : (
            <Input placeholder="Chapter contains…" value={fChapter} onChange={(e) => setFChapter(e.target.value)} />
          )}
          <Select value={fType} onValueChange={setFType}>
            <SelectTrigger><SelectValue placeholder="Type" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              {CONTENT_TYPES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Input placeholder="Search title…" value={fSearch} onChange={(e) => setFSearch(e.target.value)} />
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center py-16 text-muted-foreground text-center">
            <LibraryIcon className="h-10 w-10 mb-3" />
            <p className="mb-4">
              {total === 0
                ? "Your library is empty. Upload the first piece of content to get started."
                : "No content matches these filters."}
            </p>
            <Button asChild className="bg-gradient-brand shadow-elegant">
              <Link to="/upload"><Plus className="mr-2 h-4 w-4" />Upload content</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {items.map((item) => {
              const mine = item.owner_id === user?.id;
              const canEdit = mine || isAdmin;
              return (
                <Card key={item.id} className="flex flex-col">
                  <CardContent className="p-5 flex-1 flex flex-col">
                    <div className="flex items-start justify-between mb-2 gap-2">
                      <Badge variant="secondary" className="capitalize">{CONTENT_TYPE_LABEL[item.content_type]}</Badge>
                      {mine && <Badge variant="outline">Mine</Badge>}
                    </div>
                    <h3 className="font-serif text-lg leading-snug line-clamp-2 mb-1">{item.title}</h3>
                    <p className="text-xs text-muted-foreground mb-2">
                      Class {item.class_level} · {item.subject} · {item.chapter}
                    </p>
                    <p className="text-xs text-muted-foreground mt-auto">
                      By {profiles[item.owner_id] ?? "—"} · {formatDistanceToNow(new Date(item.created_at))} ago
                    </p>
                    <div className="flex gap-2 mt-3 flex-wrap">
                      <Button size="sm" variant="outline" onClick={() => setPreviewItem(item)}>
                        <Eye className="h-4 w-4 mr-1" />Preview
                      </Button>
                      {canEdit && (
                        <Button size="sm" variant="ghost" onClick={() => setEditItem(item)}>
                          <Pencil className="h-4 w-4 mr-1" />Edit
                        </Button>
                      )}
                      {isAdmin && (
                        <Button size="sm" variant="ghost" onClick={() => download(item)}>
                          <Download className="h-4 w-4 mr-1" />Download
                        </Button>
                      )}
                      {canEdit && (
                        <Button size="sm" variant="ghost" className="text-destructive" onClick={() => remove(item)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <div ref={sentinelRef} className="h-10" />

          <div className="flex flex-col items-center justify-center py-6 text-xs text-muted-foreground gap-2">
            {loadingMore && <Loader2 className="h-4 w-4 animate-spin" />}
            {!hasMore && (
              <span>
                Showing all {items.length}
                {total != null ? ` of ${total}` : ""} item{items.length === 1 ? "" : "s"}.
              </span>
            )}
            {hasMore && !loadingMore && (
              <Button variant="ghost" size="sm" onClick={() => fetchPage(items.length, false)}>
                Load more
              </Button>
            )}
          </div>
        </>
      )}

      {previewItem && (
        <ContentPreview
          open={!!previewItem}
          onOpenChange={(o) => !o && setPreviewItem(null)}
          storagePath={previewItem.storage_path}
          contentType={previewItem.content_type}
          title={previewItem.title}
        />
      )}

      {editItem && (
        <EditDialog item={editItem} onClose={() => setEditItem(null)} onSaved={() => { setEditItem(null); reload(); }} />
      )}
    </AppLayout>
  );
}

function EditDialog({ item, onClose, onSaved }: { item: Item; onClose: () => void; onSaved: () => void }) {
  const [classLevel, setClassLevel] = useState<ClassLevel>(item.class_level as ClassLevel);
  const [subject, setSubject] = useState(item.subject);
  const [chapter, setChapter] = useState(item.chapter);
  const [title, setTitle] = useState(item.title);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const subjects = SUBJECTS_BY_CLASS[classLevel];

  const save = async () => {
    setBusy(true);
    let storage_path = item.storage_path;
    let mime_type = item.mime_type;
    let bytes = item.bytes;
    if (file) {
      if (file.size > 50 * 1024 * 1024) {
        toast.error("File must be under 50 MB.");
        setBusy(false);
        return;
      }
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const newPath = `${item.owner_id}/${crypto.randomUUID()}-${safeName}`;
      const { error: upErr } = await supabase.storage.from("content-library").upload(newPath, file, {
        contentType: file.type || undefined,
      });
      if (upErr) {
        toast.error(upErr.message);
        setBusy(false);
        return;
      }
      await supabase.storage.from("content-library").remove([item.storage_path]);
      storage_path = newPath;
      mime_type = file.type || null;
      bytes = file.size;
    }
    const { error } = await supabase
      .from("content_items")
      .update({ class_level: classLevel, subject, chapter: chapter.trim(), title: title.trim(), storage_path, mime_type, bytes })
      .eq("id", item.id);
    setBusy(false);
    if (error) toast.error(error.message);
    else {
      toast.success("Saved");
      onSaved();
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle className="font-serif">Edit content</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Class</Label>
              <Select value={String(classLevel)} onValueChange={(v) => { setClassLevel(Number(v) as ClassLevel); setSubject(""); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CLASS_LEVELS.map((c) => <SelectItem key={c} value={String(c)}>Class {c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Subject</Label>
              <Select value={subject} onValueChange={setSubject}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {subjects.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Chapter</Label>
            <ChapterCombobox classLevel={classLevel} subject={subject} value={chapter} onChange={setChapter} />
          </div>
          <div className="space-y-2">
            <Label>Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Replace file (optional)</Label>
            <Input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
