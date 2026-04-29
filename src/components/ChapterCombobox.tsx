import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  classLevel: number | null;
  subject: string | null;
  value: string;
  onChange: (v: string) => void;
}

export function ChapterCombobox({ classLevel, subject, value, onChange }: Props) {
  const [suggestions, setSuggestions] = useState<string[]>([]);

  useEffect(() => {
    if (!classLevel || !subject) {
      setSuggestions([]);
      return;
    }
    (async () => {
      const { data } = await supabase
        .from("content_items")
        .select("chapter")
        .eq("class_level", classLevel)
        .eq("subject", subject);
      const uniq = Array.from(new Set((data ?? []).map((d: any) => d.chapter))).sort();
      setSuggestions(uniq);
    })();
  }, [classLevel, subject]);

  return (
    <div>
      <Input
        list="chapter-suggestions"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="e.g. Chapter 1 — Light"
      />
      <datalist id="chapter-suggestions">
        {suggestions.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
    </div>
  );
}
