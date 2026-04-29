import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Library, Upload, Sparkles, BookOpen } from "lucide-react";

export default function Dashboard() {
  const { profile, isAdmin, user } = useAuth();
  const [stats, setStats] = useState({ mine: 0, total: 0, subjects: 0 });

  useEffect(() => {
    document.title = "Dashboard — Workbench";
    if (!user?.id) return;
    (async () => {
      const { data, error } = await supabase.rpc("get_library_stats", { _user_id: user.id });
      if (!error && data && data.length > 0) {
        const row = data[0] as { total: number; mine: number; subjects: number };
        setStats({
          total: Number(row.total) || 0,
          mine: Number(row.mine) || 0,
          subjects: Number(row.subjects) || 0,
        });
      }
    })();
  }, [user]);

  return (
    <AppLayout>
      <div className="flex items-end justify-between mb-8 flex-wrap gap-3">
        <div>
          <p className="text-sm text-muted-foreground mb-1">Welcome back</p>
          <h1 className="font-serif text-3xl md:text-4xl">{profile?.display_name ?? "Hi"}</h1>
        </div>
        <Button asChild className="bg-gradient-brand shadow-elegant">
          <Link to="/upload"><Upload className="mr-2 h-4 w-4" /> Upload content</Link>
        </Button>
      </div>

      {isAdmin && (
        <div className="rounded-xl border bg-accent/40 p-4 mb-8 flex items-center gap-3">
          <Sparkles className="h-5 w-5 text-accent-foreground" />
          <div className="flex-1 text-sm">
            You're signed in as the workspace administrator. Manage users, the worker, and feature flags from the sidebar.
          </div>
          <Badge variant="secondary">Admin</Badge>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-10">
        <StatCard icon={Upload} label="My uploads" value={stats.mine} to="/library" />
        <StatCard icon={Library} label="Library total" value={stats.total} to="/library" />
        <StatCard icon={BookOpen} label="Subjects covered" value={stats.subjects} to="/library" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="font-serif">How it works</CardTitle>
          <CardDescription>Three quick steps.</CardDescription>
        </CardHeader>
        <CardContent>
          <ol className="space-y-3 text-sm">
            <li className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs">1</span>
              <span>Open <strong>Upload</strong>, pick the class, subject, chapter and title, then add the file.</span>
            </li>
            <li className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs">2</span>
              <span>Browse the <strong>Library</strong> to see everyone's content. Preview is open to the team — only owners can edit and only admins can download.</span>
            </li>
            <li className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs">3</span>
              <span>Need to update something? Edit the metadata or replace the file from the library card.</span>
            </li>
          </ol>
        </CardContent>
      </Card>
    </AppLayout>
  );
}

function StatCard({ icon: Icon, label, value, to }: { icon: typeof Library; label: string; value: number; to: string }) {
  return (
    <Link to={to} className="group block">
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
