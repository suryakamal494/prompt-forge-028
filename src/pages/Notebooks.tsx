import { useEffect, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, BookOpen, Loader2, Lock } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { useNotebookLMEnabled } from "@/hooks/useAppSettings";

interface Notebook {
  id: string;
  title: string;
  description: string | null;
  is_published: boolean;
  created_at: string;
}

export default function Notebooks() {
  const { user } = useAuth();
  const { value: nblmEnabled } = useNotebookLMEnabled();
  const [notebooks, setNotebooks] = useState<Notebook[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    document.title = "Notebooks — Workbench";
    load();
  }, []);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("notebooks")
      .select("id,title,description,is_published,created_at")
      .order("created_at", { ascending: false });
    setNotebooks((data as Notebook[]) ?? []);
    setLoading(false);
  };

  const create = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!user) return;
    const fd = new FormData(e.currentTarget);
    setSubmitting(true);
    const { error } = await supabase.from("notebooks").insert({
      owner_id: user.id,
      title: String(fd.get("title")),
      description: String(fd.get("description") || ""),
    });
    setSubmitting(false);
    if (error) toast.error(error.message);
    else {
      toast.success("Notebook created");
      setOpen(false);
      load();
    }
  };

  return (
    <AppLayout>
      <header className="mb-8 flex items-end justify-between">
        <div>
          <h1 className="font-serif text-4xl">Notebooks</h1>
          <p className="text-muted-foreground mt-1">Your generation projects.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="bg-gradient-brand shadow-elegant" disabled={!nblmEnabled}>
              {nblmEnabled ? <Plus className="mr-2 h-4 w-4" /> : <Lock className="mr-2 h-4 w-4" />}
              New notebook
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="font-serif">Create notebook</DialogTitle>
              <DialogDescription>Give your notebook a clear title — you can add sources next.</DialogDescription>
            </DialogHeader>
            <form onSubmit={create} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="nb-title">Title</Label>
                <Input id="nb-title" name="title" required placeholder="e.g. Class 10 Physics — Optics" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="nb-desc">Description (optional)</Label>
                <Textarea id="nb-desc" name="description" rows={3} />
              </div>
              <DialogFooter>
                <Button type="submit" disabled={submitting}>
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </header>

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : notebooks.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center py-16 text-muted-foreground">
            <BookOpen className="h-10 w-10 mb-3" />
            <p className="mb-4">No notebooks yet.</p>
            <Button onClick={() => setOpen(true)} className="bg-gradient-brand">
              <Plus className="mr-2 h-4 w-4" /> Create your first notebook
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {notebooks.map((n) => (
            <Link key={n.id} to={`/notebooks/${n.id}`} className="group">
              <Card className="h-full transition-all hover:shadow-elegant hover:-translate-y-0.5">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between mb-2">
                    <BookOpen className="h-5 w-5 text-primary" />
                    {n.is_published && <Badge variant="secondary">Published</Badge>}
                  </div>
                  <h3 className="font-serif text-lg leading-snug line-clamp-2 mb-1">{n.title}</h3>
                  {n.description && (
                    <p className="text-sm text-muted-foreground line-clamp-2 mb-3">{n.description}</p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Created {formatDistanceToNow(new Date(n.created_at))} ago
                  </p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </AppLayout>
  );
}
