import { useEffect, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, Pause, Play } from "lucide-react";

interface Row {
  id: string;
  email: string;
  display_name: string | null;
  status: string;
  created_at: string;
  roles: string[];
}

export default function UsersAdmin() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [actingId, setActingId] = useState<string | null>(null);

  useEffect(() => {
    document.title = "Users — Workbench Admin";
    load();
  }, []);

  const load = async () => {
    setLoading(true);
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id,email,display_name,status,created_at")
      .order("created_at", { ascending: false });
    const { data: roleRows } = await supabase.from("user_roles").select("user_id,role");
    const rolesByUser = new Map<string, string[]>();
    (roleRows ?? []).forEach((r) => {
      const arr = rolesByUser.get(r.user_id) ?? [];
      arr.push(r.role);
      rolesByUser.set(r.user_id, arr);
    });
    setRows(((profiles ?? []) as Row[]).map((p) => ({ ...p, roles: rolesByUser.get(p.id) ?? [] })));
    setLoading(false);
  };

  const setStatus = async (id: string, status: "approved" | "suspended") => {
    setActingId(id);
    const { error } = await supabase.from("profiles").update({ status }).eq("id", id);
    setActingId(null);
    if (error) toast.error(error.message);
    else {
      toast.success(`User ${status}`);
      load();
    }
  };

  return (
    <AppLayout>
      <header className="mb-8">
        <h1 className="font-serif text-4xl">Users</h1>
        <p className="text-muted-foreground mt-1">All registered accounts.</p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="font-serif text-xl">Members</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <ul className="divide-y">
              {rows.map((u) => (
                <li key={u.id} className="py-4 flex items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{u.display_name ?? u.email}</div>
                    <div className="text-sm text-muted-foreground truncate">{u.email}</div>
                  </div>
                  <div className="flex gap-1.5">
                    {u.roles.map((r) => (
                      <Badge key={r} variant={r === "admin" ? "default" : "secondary"} className="capitalize">
                        {r}
                      </Badge>
                    ))}
                  </div>
                  <Badge
                    variant={
                      u.status === "approved"
                        ? "default"
                        : u.status === "pending"
                        ? "secondary"
                        : "destructive"
                    }
                    className="capitalize"
                  >
                    {u.status}
                  </Badge>
                  {u.status === "approved" ? (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={actingId === u.id || u.roles.includes("admin")}
                      onClick={() => setStatus(u.id, "suspended")}
                    >
                      <Pause className="mr-1 h-4 w-4" /> Suspend
                    </Button>
                  ) : u.status === "suspended" || u.status === "rejected" ? (
                    <Button size="sm" disabled={actingId === u.id} onClick={() => setStatus(u.id, "approved")}>
                      <Play className="mr-1 h-4 w-4" /> Re-enable
                    </Button>
                  ) : (
                    <Button size="sm" disabled={actingId === u.id} onClick={() => setStatus(u.id, "approved")}>
                      Approve
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </AppLayout>
  );
}
