import { useCallback, useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

const localKey = (userId: string) => `domiflix_avatar_${userId}`;
const QUERY_KEY = ["domiflix-user-preferences"] as const;
const EVENT_NAME = "domiflix:avatar-changed";

function emitChange(userId: string, url: string | null) {
  window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: { userId, url } }));
}

export function useDomiflixAvatar() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [avatarUrl, setAvatarUrlState] = useState<string | null>(() => {
    if (typeof window === "undefined" || !user?.id) return null;
    return localStorage.getItem(localKey(user.id));
  });

  useEffect(() => {
    if (!user?.id) {
      setAvatarUrlState(null);
      return;
    }
    const cached = localStorage.getItem(localKey(user.id));
    if (cached) setAvatarUrlState(cached);

    supabase
      .from("domiflix_user_preferences" as any)
      .select("domiflix_avatar_url")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        const url = (data as any)?.domiflix_avatar_url ?? null;
        setAvatarUrlState(url);
        if (url) localStorage.setItem(localKey(user.id), url);
        else localStorage.removeItem(localKey(user.id));
      });
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) return;
    function handler(e: Event) {
      const detail = (e as CustomEvent).detail as { userId: string; url: string | null };
      if (detail.userId === user.id) setAvatarUrlState(detail.url);
    }
    window.addEventListener(EVENT_NAME, handler);
    return () => window.removeEventListener(EVENT_NAME, handler);
  }, [user?.id]);

  const setAvatar = useCallback(
    async (url: string) => {
      if (!user?.id) return;
      setAvatarUrlState(url);
      localStorage.setItem(localKey(user.id), url);
      emitChange(user.id, url);
      const { error } = await supabase
        .from("domiflix_user_preferences" as any)
        .upsert({ user_id: user.id, domiflix_avatar_url: url }, { onConflict: "user_id" });
      if (!error) {
        queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      }
    },
    [user?.id, queryClient]
  );

  const clearAvatar = useCallback(async () => {
    if (!user?.id) return;
    setAvatarUrlState(null);
    localStorage.removeItem(localKey(user.id));
    emitChange(user.id, null);
    await supabase
      .from("domiflix_user_preferences" as any)
      .upsert({ user_id: user.id, domiflix_avatar_url: null }, { onConflict: "user_id" });
    queryClient.invalidateQueries({ queryKey: QUERY_KEY });
  }, [user?.id, queryClient]);

  return { avatarUrl, setAvatar, clearAvatar };
}
