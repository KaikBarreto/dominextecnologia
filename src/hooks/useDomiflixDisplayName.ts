import { useCallback, useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

const localKey = (userId: string) => `domiflix_display_name_${userId}`;
const QUERY_KEY = ["domiflix-user-preferences"] as const;
const EVENT_NAME = "domiflix:display-name-changed";

function emitChange(userId: string, name: string | null) {
  window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: { userId, name } }));
}

export function useDomiflixDisplayName() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [displayName, setDisplayNameState] = useState<string | null>(() => {
    if (typeof window === "undefined" || !user?.id) return null;
    return localStorage.getItem(localKey(user.id));
  });

  useEffect(() => {
    if (!user?.id) {
      setDisplayNameState(null);
      return;
    }
    const cached = localStorage.getItem(localKey(user.id));
    if (cached) setDisplayNameState(cached);

    supabase
      .from("domiflix_user_preferences" as any)
      .select("domiflix_display_name")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        const name = (data as any)?.domiflix_display_name ?? null;
        setDisplayNameState(name);
        if (name) localStorage.setItem(localKey(user.id), name);
        else localStorage.removeItem(localKey(user.id));
      });
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) return;
    function handler(e: Event) {
      const detail = (e as CustomEvent).detail as { userId: string; name: string | null };
      if (detail.userId === user.id) setDisplayNameState(detail.name);
    }
    window.addEventListener(EVENT_NAME, handler);
    return () => window.removeEventListener(EVENT_NAME, handler);
  }, [user?.id]);

  const setDisplayName = useCallback(
    async (name: string | null) => {
      if (!user?.id) return;
      const trimmed = name?.trim() || null;
      setDisplayNameState(trimmed);
      if (trimmed) localStorage.setItem(localKey(user.id), trimmed);
      else localStorage.removeItem(localKey(user.id));
      emitChange(user.id, trimmed);
      const { error } = await supabase
        .from("domiflix_user_preferences" as any)
        .upsert({ user_id: user.id, domiflix_display_name: trimmed }, { onConflict: "user_id" });
      if (!error) queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
    [user?.id, queryClient]
  );

  return { displayName, setDisplayName };
}
