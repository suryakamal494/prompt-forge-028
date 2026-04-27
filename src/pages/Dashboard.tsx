import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { BookOpen, ListChecks, Library, Plus, Sparkles } from "lucide-react";

export default function Dashboard() {
  const { profile, isAdmin } = useAuth();
  const [stats, setStats] = useState({ notebooks: 0, jobs: 0, outputs: 0 });

  useEffect(() => {
    document.title = "Dashboard — NotebookLM Workbench";
    (async () => {
      const [{ count: nb }, { count: jb }, { count: out }] = await Promise.all([
        supabase.from("notebooks").select("*", { count: "exact", head: true }),
        supabase.from("jobs").select("*", { count: "exact", head: true }),
        supabase.from("outputs").select("*", { count: "exact", head: true }),
      ]);
      setStats({ notebooks: nb ?? 0, jobs: jb ?? 0, outputs: out ?? 0 });
    })();
  }, []);

  return (
    <AppLayout>
      <div className="flex items-end justify-between mb-8">
        <div>
          <p className="text-sm text-muted-foreground mb-1">Welcome back</p>
          <h1 className="font-serif text-4xl">{profile?.display_name ?? "Hi"}</h1>
        </div>
        <Button asChild className="bg-gradient-brand shadow-elegant">
          <Link to="/notebooks">
            <Plus className="mr-2 h-4 w-4" /> New notebook
          </Link>
        </Button>
      </div>

      {isAdmin && (
        <div className="rounded-xl border bg-accent/40 p-4 mb-8 flex items-center gap-3">
          <Sparkles className="h-5 w-5 text-accent-foreground" />
          <div className="flex-1 text-sm">
            You're signed in as the workspace administrator. Manage users and the worker from the sidebar.
          </div>
          <Badge variant="secondary">Admin</Badge>
        </div>
      )}

      <div className="grid md:grid-cols-3 gap-4 mb-10">
        <StatCard icon={BookOpen} label="Notebooks" value={stats.notebooks} to="/notebooks" />
        <StatCard icon={ListChecks} label="Jobs" value={stats.jobs} to="/jobs" />
        <StatCard icon={Library} label="Outputs" value={stats.outputs} to="/library" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="font-serif">Get started</CardTitle>
          <CardDescription>Three steps to your first generated deck.</CardDescription>
        </CardHeader>
        <CardContent>
          <ol className="space-y-3 text-sm">
            <li className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs">1</span>
              <span><strong>Create a notebook</strong> and add your sources — PDFs, URLs, YouTube links, or pasted text.</span>
            </li>
            <li className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs">2</span>
              <span><strong>Pick outputs</strong> (slide deck, study guide, quiz, flashcards) and submit a generation job.</span>
            </li>
            <li className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs">3</span>
              <span><strong>Download</strong> the artifacts — or publish the notebook to the team library.</span>
            </li>
          </ol>
        </CardContent>
      </Card>
    </AppLayout>
  );
}

function StatCard({ icon: Icon, label, value, to }: { icon: typeof BookOpen; label: string; value: number; to: string }) {
  return (
    <Link to={to} className="group">
      <Card className="transition-all hover:shadow-elegant hover:-translate-y-0.5">
        <CardContent className="p-6 flex items-center justify-between">
          <div>
            <div className="text-sm text-muted-foreground">{label}</div>
            <div className="font-serif text-3xl mt-1">{value}</div>
          </div>
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-accent text-accent-foreground group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
            <Icon className="h-5 w-5" />
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
