import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface DomiflixUserPreferences {
  user_id: string;
  playback_speed: number;
  domiflix_avatar_url: string | null;
  updated_at: string;
}

export const PLAYBACK_SPEEDS = [0.5, 0.75, 1, 1.5, 2] as const;

export function useDomiflixPreferences() {
  return useQuery({
    queryKey: ["domiflix-user-preferences"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      const { data, error } = await supabase
        .from("domiflix_user_preferences" as any)
        .select("playback_speed, domiflix_avatar_url, updated_at")
        .eq("user_id", user.id)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as unknown as DomiflixUserPreferences | null;
    },
    staleTime: 60_000,
  });
}

export function useUpdatePlaybackSpeed() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (playback_speed: number) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { error } = await supabase
        .from("domiflix_user_preferences" as any)
        .upsert({ user_id: user.id, playback_speed }, { onConflict: "user_id" });
      if (error) throw error;
    },
    onMutate: async (playback_speed) => {
      await queryClient.cancelQueries({ queryKey: ["domiflix-user-preferences"] });
      const previous = queryClient.getQueryData<DomiflixUserPreferences | null>([
        "domiflix-user-preferences",
      ]);
      queryClient.setQueryData<DomiflixUserPreferences | null>(
        ["domiflix-user-preferences"],
        (curr) =>
          curr
            ? { ...curr, playback_speed }
            : ({
                user_id: "",
                playback_speed,
                domiflix_avatar_url: null,
                updated_at: new Date().toISOString(),
              } as DomiflixUserPreferences)
      );
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous !== undefined) {
        queryClient.setQueryData(["domiflix-user-preferences"], ctx.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["domiflix-user-preferences"] });
    },
  });
}
