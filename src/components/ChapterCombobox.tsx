import { useCallback, useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";

interface Props {
  classLevel: number | null;
  subject: string | null;
  value: string;
  onChange: (v: string) => void;
}

interface Chapter {
  id: string;
  name: string;
}

export function ChapterCombobox({ classLevel, subject, value, onChange }: Props) {
  const { user } = useAuth();
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<"existing" | "new">("existing");
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);

  const disabled = !classLevel || !subject;

  const load = useCallback(async () => {
    if (!classLevel || !subject) {
      setChapters([]);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from("chapters")
      .select("id,name")
      .eq("class_level", classLevel)
      .eq("subject", subject)
      .order("name", { ascending: true });
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setChapters((data as Chapter[]) ?? []);
  }, [classLevel, subject]);

  useEffect(() => {
    load();
    // Reset selected value when class/subject changes
    onChange("");
    setNewName("");
    setMode("existing");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classLevel, subject]);

  const addChapter = async () => {
    if (!user || !classLevel || !subject) return;
    const name = newName.trim();
    if (!name) {
      toast.error("Enter a chapter name.");
      return;
    }
    // Detect duplicates (case-insensitive) up-front for a better UX
    const existing = chapters.find((c) => c.name.toLowerCase() === name.toLowerCase());
    if (existing) {
      toast.message("Chapter already exists — selected it for you.");
      onChange(existing.name);
      setMode("existing");
      setNewName("");
      return;
    }
    setAdding(true);
    const { data, error } = await supabase
      .from("chapters")
      .insert({ class_level: classLevel, subject, name, created_by: user.id })
      .select("id,name")
      .single();
    setAdding(false);
    if (error) {
      // Unique-violation fallback (in case another user inserted the same name concurrently)
      if ((error as any).code === "23505") {
        await load();
        toast.message("Chapter already exists — selected it for you.");
        onChange(name);
        setMode("existing");
        setNewName("");
        return;
      }
      toast.error(error.message);
      return;
    }
    setChapters((prev) => [...prev, data as Chapter].sort((a, b) => a.name.localeCompare(b.name)));
    onChange((data as Chapter).name);
    setMode("existing");
    setNewName("");
    toast.success("Chapter added.");
  };

  return (
    <div className="space-y-2">
      <ToggleGroup
        type="single"
        value={mode}
        onValueChange={(v) => v && setMode(v as "existing" | "new")}
        className="justify-start"
        disabled={disabled}
      >
        <ToggleGroupItem value="existing" className="text-xs px-3">Existing chapter</ToggleGroupItem>
        <ToggleGroupItem value="new" className="text-xs px-3">New chapter</ToggleGroupItem>
      </ToggleGroup>

      {mode === "existing" ? (
        <Select value={value || undefined} onValueChange={onChange} disabled={disabled || loading}>
          <SelectTrigger>
            <SelectValue
              placeholder={
                disabled
                  ? "Pick class and subject first"
                  : loading
                  ? "Loading…"
                  : chapters.length === 0
                  ? "No chapters yet — switch to New chapter"
                  : "Select a chapter"
              }
            />
          </SelectTrigger>
          <SelectContent>
            {chapters.map((c) => (
              <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <div className="flex gap-2">
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="e.g. Chapter 1 — Light"
            disabled={disabled || adding}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addChapter();
              }
            }}
          />
          <Button type="button" onClick={addChapter} disabled={disabled || adding || !newName.trim()}>
            {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Plus className="h-4 w-4 mr-1" />Add</>}
          </Button>
        </div>
      )}

      {!disabled && mode === "existing" && value && (
        <p className="text-xs text-muted-foreground">Selected: {value}</p>
      )}
    </div>
  );
}
