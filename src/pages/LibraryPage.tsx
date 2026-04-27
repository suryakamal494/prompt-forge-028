import { useEffect, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Library, Loader2, BookOpen } from "lucide-react";
import { Link } from "react-router-dom";

interface Notebook {
  id: string;
  title: string;
  description: string | null;
  is_published: boolean;
  owner_id: string;
}

export default function LibraryPage() {
  const { user } = useAuth();
  const [mine, setMine] = useState<Notebook[]>([]);
  const [team, setTeam] = useState<Notebook[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

  useEffect(() => {
    document.title = "Library — Workbench";
    load();
  }, [user]);

  const load = async () => {
    setLoading(true);
    const [{ data: my }, { data: pub }] = await Promise.all([
      supabase.from("notebooks").select("id,title,description,is_published,owner_id").eq("owner_id", user?.id ?? ""),
      supabase.from("notebooks").select("id,title,description,is_published,owner_id").eq("is_published", true),
    ]);
    setMine((my as Notebook[]) ?? []);
    setTeam((pub as Notebook[]) ?? []);
    setLoading(false);
  };

  const filter = (list: Notebook[]) =>
    q.trim()
      ? list.filter(
          (n) =>
            n.title.toLowerCase().includes(q.toLowerCase()) ||
            (n.description ?? "").toLowerCase().includes(q.toLowerCase())
        )
      : list;

  return (
    <AppLayout>
      <header className="mb-8">
        <h1 className="font-serif text-4xl">Library</h1>
        <p className="text-muted-foreground mt-1">Personal drafts and the team's published work.</p>
      </header>

      <Tabs defaultValue="personal">
        <div className="flex items-center justify-between mb-4 gap-3">
          <TabsList>
            <TabsTrigger value="personal">Personal</TabsTrigger>
            <TabsTrigger value="team">Team</TabsTrigger>
          </TabsList>
          <Input placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-xs" />
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            <TabsContent value="personal">
              <NotebookGrid items={filter(mine)} emptyText="Your personal library is empty." />
            </TabsContent>
            <TabsContent value="team">
              <NotebookGrid items={filter(team)} emptyText="No team-published notebooks yet." />
            </TabsContent>
          </>
        )}
      </Tabs>
    </AppLayout>
  );
}

function NotebookGrid({ items, emptyText }: { items: Notebook[]; emptyText: string }) {
  if (items.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center py-16 text-muted-foreground">
          <Library className="h-10 w-10 mb-3" />
          <p>{emptyText}</p>
        </CardContent>
      </Card>
    );
  }
  return (
    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
      {items.map((n) => (
        <Link key={n.id} to={`/notebooks/${n.id}`}>
          <Card className="h-full transition-all hover:shadow-elegant hover:-translate-y-0.5">
            <CardContent className="p-5">
              <div className="flex items-start justify-between mb-2">
                <BookOpen className="h-5 w-5 text-primary" />
                {n.is_published && <Badge variant="secondary">Published</Badge>}
              </div>
              <h3 className="font-serif text-lg leading-snug line-clamp-2 mb-1">{n.title}</h3>
              {n.description && <p className="text-sm text-muted-foreground line-clamp-2">{n.description}</p>}
            </CardContent>
          </Card>
        </Link>
      ))}
    </div>
  );
}
