import { useEffect } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Clock, RefreshCw, LogOut, XCircle, Pause } from "lucide-react";

export default function PendingPage() {
  const { user, profile, loading, refresh, signOut } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    document.title = "Pending approval — NotebookLM Workbench";
  }, []);

  if (loading) return null;
  if (!user) return <Navigate to="/auth" replace />;
  if (profile?.status === "approved") return <Navigate to="/dashboard" replace />;

  const status = profile?.status ?? "pending";

  const meta = {
    pending: { Icon: Clock, title: "Waiting for admin approval", body: "Your account has been created. An administrator will review and approve it shortly. You'll be able to log in as soon as that happens." },
    suspended: { Icon: Pause, title: "Account suspended", body: "Your access has been temporarily suspended by an administrator. Please contact your team admin for more information." },
    rejected: { Icon: XCircle, title: "Registration not approved", body: "An administrator did not approve this registration. If you think this was a mistake, please contact your team admin." },
  } as const;

  const { Icon, title, body } = meta[status as keyof typeof meta] ?? meta.pending;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-subtle p-6">
      <Card className="w-full max-w-md shadow-card">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-accent">
            <Icon className="h-6 w-6 text-accent-foreground" />
          </div>
          <CardTitle className="font-serif text-2xl">{title}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <p className="text-center text-muted-foreground">{body}</p>
          <div className="rounded-md bg-muted p-3 text-sm">
            <div className="text-muted-foreground">Signed in as</div>
            <div className="font-medium">{profile?.email}</div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={refresh}>
              <RefreshCw className="mr-2 h-4 w-4" /> Check again
            </Button>
            <Button
              variant="ghost"
              onClick={async () => {
                await signOut();
                navigate("/auth");
              }}
            >
              <LogOut className="mr-2 h-4 w-4" /> Sign out
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
