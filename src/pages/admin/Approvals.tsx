import { useEffect, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Check, X, Loader2, Inbox } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface PendingUser {
  id: string;
  email: string;
  display_name: string | null;
  created_at: string;
  status: string;
}

export default function Approvals() {
  const [users, setUsers] = useState<PendingUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [actingId, setActingId] = useState<string | null>(null);

  useEffect(() => {
    document.title = "Approvals — Workbench Admin";
    load();
  }, []);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("profiles")
      .select("id,email,display_name,created_at,status")
      .eq("status", "pending")
      .order("created_at", { ascending: true });
    if (error) toast.error(error.message);
    setUsers((data as PendingUser[]) ?? []);
    setLoading(false);
  };

  const decide = async (id: string, decision: "approved" | "rejected") => {
    setActingId(id);
    const { data: userRes } = await supabase.auth.getUser();
    const { error } = await supabase
      .from("profiles")
      .update({
        status: decision,
        approved_at: decision === "approved" ? new Date().toISOString() : null,
        approved_by: userRes.user?.id,
      })
      .eq("id", id);
    setActingId(null);
    if (error) toast.error(error.message);
    else {
      toast.success(decision === "approved" ? "User approved" : "User rejected");
      setUsers((u) => u.filter((x) => x.id !== id));
    }
  };

  return (
    <AppLayout>
      <header className="mb-8">
        <h1 className="font-serif text-4xl">Approvals</h1>
        <p className="text-muted-foreground mt-1">Review users awaiting admin approval.</p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="font-serif text-xl">Pending users</CardTitle>
          <CardDescription>Approved users gain the Content Developer role.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : users.length === 0 ? (
            <div className="flex flex-col items-center py-10 text-muted-foreground">
              <Inbox className="h-8 w-8 mb-2" />
              <p>No pending registrations.</p>
            </div>
          ) : (
            <ul className="divide-y">
              {users.map((u) => (
                <li key={u.id} className="py-4 flex items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{u.display_name ?? u.email}</div>
                    <div className="text-sm text-muted-foreground truncate">{u.email}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      Registered {formatDistanceToNow(new Date(u.created_at))} ago
                    </div>
                  </div>
                  <Badge variant="secondary">Pending</Badge>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={actingId === u.id}
                      onClick={() => decide(u.id, "rejected")}
                    >
                      <X className="mr-1 h-4 w-4" /> Reject
                    </Button>
                    <Button
                      size="sm"
                      disabled={actingId === u.id}
                      onClick={() => decide(u.id, "approved")}
                    >
                      <Check className="mr-1 h-4 w-4" /> Approve
                    </Button>
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
