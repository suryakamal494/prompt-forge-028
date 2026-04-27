import { useEffect, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Server } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface Heartbeat {
  worker_id: string;
  last_seen: string;
  version: string | null;
  queue_depth: number | null;
  notes: string | null;
}

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
        <p className="text-muted-foreground mt-1">Status of the Python NotebookLM worker(s).</p>
      </header>

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
              <p className="text-xs mt-2">Deploy the Python worker to Railway.app — see the worker README.</p>
            </div>
          ) : (
            <ul className="divide-y">
              {hbs.map((h) => {
                const ageMs = Date.now() - new Date(h.last_seen).getTime();
                const online = ageMs < 90_000; // <1.5min
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
    </AppLayout>
  );
}
