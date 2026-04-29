import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export function useAppSetting<T = unknown>(key: string, fallback: T) {
  const [value, setValue] = useState<T>(fallback);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const { data } = await supabase.from("app_settings").select("value").eq("key", key).maybeSingle();
    if (data) setValue(data.value as T);
    setLoading(false);
  }, [key]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const update = async (next: T) => {
    const { error } = await supabase
      .from("app_settings")
      .upsert({ key, value: next as any, updated_at: new Date().toISOString() });
    if (!error) setValue(next);
    return error;
  };

  return { value, loading, refresh, update };
}

export const useNotebookLMEnabled = () => useAppSetting<boolean>("notebooklm_enabled", false);
