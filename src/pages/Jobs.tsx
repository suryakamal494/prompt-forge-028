import { useEffect, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, ListChecks } from "lucide-react";
import { Link } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import { Progress } from "@/components/ui/progress";

interface Job {
  id: string;
  notebook_id: string;
  status: string;
  progress: number;
  message: string | null;
  error: string | null;
  outputs_requested: string[];
  created_at: string;
  finished_at: string | null;
}

const statusVariant: Record<string, "default" | "secondary" | "destructive"> = {
  queued: "secondary",
  running: "default",
  done: "default",
  failed: "destructive",
  cancelled: "secondary",
};

export default function Jobs() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    document.title = "Jobs — Workbench";
    load();

    const ch = supabase
      .channel("jobs-stream")
      .on("postgres_changes", { event: "*", schema: "public", table: "jobs" }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, []);

  const load = async () => {
    const { data } = await supabase
      .from("jobs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);
    setJobs((data as Job[]) ?? []);
    setLoading(false);
  };

  return (
    <AppLayout>
      <header className="mb-8">
        <h1 className="font-serif text-4xl">Jobs</h1>
        <p className="text-muted-foreground mt-1">Live status of your generation jobs.</p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="font-serif text-xl">Recent jobs</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : jobs.length === 0 ? (
            <div className="flex flex-col items-center py-10 text-muted-foreground">
              <ListChecks className="h-8 w-8 mb-2" />
              <p>No jobs yet.</p>
            </div>
          ) : (
            <ul className="divide-y">
              {jobs.map((j) => (
                <li key={j.id} className="py-4">
                  <div className="flex items-start gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <Link to={`/notebooks/${j.notebook_id}`} className="font-mono text-xs text-muted-foreground hover:underline truncate">
                          {j.id.slice(0, 8)}
                        </Link>
                        <Badge variant={statusVariant[j.status] ?? "secondary"} className="capitalize">
                          {j.status}
                        </Badge>
                      </div>
                      <div className="text-sm mt-1 text-muted-foreground">
                        Outputs: {j.outputs_requested.map((o) => o.replace(/_/g, " ")).join(", ")}
                      </div>
                      {(j.status === "running" || j.status === "queued") && (
                        <Progress value={j.progress} className="mt-2 h-1.5" />
                      )}
                      {j.message && <div className="text-xs text-muted-foreground mt-1">{j.message}</div>}
                      {j.error && <div className="text-xs text-destructive mt-1">{j.error}</div>}
                    </div>
                    <div className="text-xs text-muted-foreground whitespace-nowrap">
                      {formatDistanceToNow(new Date(j.created_at))} ago
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </AppLayout>
  );
}
