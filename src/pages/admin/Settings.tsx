import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useNotebookLMEnabled } from "@/hooks/useAppSettings";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useEffect } from "react";

export default function Settings() {
  const { value, loading, update } = useNotebookLMEnabled();

  useEffect(() => {
    document.title = "Settings — Workbench";
  }, []);

  const toggle = async (next: boolean) => {
    const err = await update(next);
    if (err) toast.error(err.message);
    else toast.success(`NotebookLM ${next ? "enabled" : "disabled"}`);
  };

  return (
    <AppLayout>
      <header className="mb-8">
        <h1 className="font-serif text-4xl">Settings</h1>
        <p className="text-muted-foreground mt-1">Workspace-wide feature flags.</p>
      </header>

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle className="font-serif">NotebookLM auto-generation</CardTitle>
          <CardDescription>
            When enabled, employees can create notebooks and queue jobs that produce slides and flashcards
            automatically through the worker. Currently experimental — keep this off until the worker is stable.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between gap-4">
            <Label htmlFor="nblm-toggle" className="text-sm">Enable NotebookLM auto-generation</Label>
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            ) : (
              <Switch id="nblm-toggle" checked={value} onCheckedChange={toggle} />
            )}
          </div>
        </CardContent>
      </Card>
    </AppLayout>
  );
}
