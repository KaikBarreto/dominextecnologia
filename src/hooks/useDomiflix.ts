import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { slugify } from "@/lib/slugify";
import { domiflixToast } from "@/lib/domiflixToast";

export interface DomiflixTitle {
  id: string;
  type: "series" | "movie";
  title: string;
  description: string | null;
  banner_url: string | null;
  thumbnail_url: string | null;
  logo_url: string | null;
  tags: string[];
  is_featured: boolean;
  order_index: number;
  live_url: string | null;
  live_scheduled_at: string | null;
  created_at: string;
}

export interface DomiflixSeason {
  id: string;
  title_id: string;
  season_number: number;
  title: string;
  description: string | null;
  order_index: number;
  created_at: string;
}

export interface DomiflixEpisode {
  id: string;
  title_id: string;
  season_id: string | null;
  episode_number: number | null;
  title: string;
  description: string | null;
  video_id: string | null;
  video_type: "drive" | "youtube";
  duration_minutes: number | null;
  thumbnail_url: string | null;
  order_index: number;
  recorded_at: string | null;
  created_at: string;
}

export interface DomiflixProgress {
  id: string;
  user_id: string;
  episode_id: string;
  title_id: string;
  completed: boolean;
  watched_at: string;
  progress_seconds: number;
  duration_seconds: number;
}

export interface DomiflixWatchlistItem {
  id: string;
  user_id: string;
  title_id: string;
  added_at: string;
}

export interface DomiflixTitleFull extends DomiflixTitle {
  seasons: (DomiflixSeason & { episodes: DomiflixEpisode[] })[];
  episodes: DomiflixEpisode[];
}

export function useDomiflixTitles() {
  return useQuery({
    queryKey: ["domiflix-titles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("domiflix_titles")
        .select("*")
        .order("order_index", { ascending: true })
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as DomiflixTitle[];
    },
  });
}

export function useDomiflixFeatured() {
  return useQuery({
    queryKey: ["domiflix-featured"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("domiflix_titles")
        .select("*")
        .eq("is_featured", true)
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as unknown as DomiflixTitle | null;
    },
  });
}

export function useDomiflixTitleBySlug(slug: string | undefined) {
  return useQuery({
    queryKey: ["domiflix-title-by-slug", slug],
    enabled: !!slug,
    queryFn: async () => {
      if (!slug) return null;
      const { data, error } = await supabase
        .from("domiflix_titles")
        .select("id, title")
        .order("order_index", { ascending: true });
      if (error) throw error;
      const titles = (data ?? []) as unknown as { id: string; title: string }[];
      const match = titles.find((t) => slugify(t.title) === slug);
      return match?.id ?? null;
    },
  });
}

export function useDomiflixTitle(id: string | undefined) {
  return useQuery({
    queryKey: ["domiflix-title", id],
    enabled: !!id,
    queryFn: async () => {
      if (!id) return null;
      const [titleRes, seasonsRes, episodesRes] = await Promise.all([
        supabase.from("domiflix_titles").select("*").eq("id", id).single(),
        supabase
          .from("domiflix_seasons")
          .select("*")
          .eq("title_id", id)
          .order("order_index", { ascending: true })
          .order("season_number", { ascending: true }),
        supabase
          .from("domiflix_episodes")
          .select("*")
          .eq("title_id", id)
          .order("order_index", { ascending: true })
          .order("episode_number", { ascending: true }),
      ]);
      if (titleRes.error) throw titleRes.error;
      const title = titleRes.data as unknown as DomiflixTitle;
      const seasons = (seasonsRes.data ?? []) as unknown as DomiflixSeason[];
      const allEpisodes = (episodesRes.data ?? []) as unknown as DomiflixEpisode[];
      const seasonsWithEpisodes = seasons.map((season) => ({
        ...season,
        episodes: allEpisodes.filter((ep) => ep.season_id === season.id),
      }));
      const directEpisodes = allEpisodes.filter((ep) => ep.season_id === null);
      return { ...title, seasons: seasonsWithEpisodes, episodes: directEpisodes } as DomiflixTitleFull;
    },
  });
}

export function useDomiflixEpisodeCounts() {
  return useQuery({
    queryKey: ["domiflix-episode-counts"],
    queryFn: async () => {
      const { data, error } = await supabase.from("domiflix_episodes").select("title_id");
      if (error) throw error;
      const counts: Record<string, number> = {};
      ((data ?? []) as unknown as { title_id: string }[]).forEach((ep) => {
        counts[ep.title_id] = (counts[ep.title_id] || 0) + 1;
      });
      return counts;
    },
  });
}

export function useDomiflixAllEpisodes() {
  return useQuery({
    queryKey: ["domiflix-all-episodes"],
    queryFn: async () => {
      const [episodesRes, seasonsRes] = await Promise.all([
        supabase.from("domiflix_episodes").select("*").order("order_index"),
        supabase.from("domiflix_seasons").select("*").order("order_index"),
      ]);
      const episodes = (episodesRes.data ?? []) as unknown as DomiflixEpisode[];
      const seasons = (seasonsRes.data ?? []) as unknown as DomiflixSeason[];
      const byTitle: Record<string, DomiflixEpisode[]> = {};
      episodes.forEach((ep) => {
        if (!byTitle[ep.title_id]) byTitle[ep.title_id] = [];
        byTitle[ep.title_id].push(ep);
      });
      const seasonMap: Record<string, { seasonNumber: number; episodeInSeason: number }> = {};
      seasons.forEach((s) => {
        const seasonEps = episodes.filter((e) => e.season_id === s.id);
        seasonEps.forEach((ep, idx) => {
          seasonMap[ep.id] = { seasonNumber: s.season_number, episodeInSeason: idx + 1 };
        });
      });
      return { byTitle, seasonMap };
    },
  });
}

export function useDomiflixProgress() {
  return useQuery({
    queryKey: ["domiflix-progress"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [] as DomiflixProgress[];
      const { data, error } = await supabase
        .from("domiflix_user_progress")
        .select("*")
        .eq("user_id", user.id)
        .order("watched_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as DomiflixProgress[];
    },
  });
}

export function useMarkEpisodeWatched() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      episodeId, titleId, progressSeconds, durationSeconds, completed,
    }: { episodeId: string; titleId: string; progressSeconds?: number; durationSeconds?: number; completed?: boolean }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const isCompleted = completed ?? (durationSeconds && progressSeconds ? progressSeconds / durationSeconds > 0.9 : true);
      const { error } = await supabase.from("domiflix_user_progress").upsert(
        {
          user_id: user.id,
          episode_id: episodeId,
          title_id: titleId,
          completed: isCompleted,
          watched_at: new Date().toISOString(),
          progress_seconds: progressSeconds ?? 0,
          duration_seconds: durationSeconds ?? 0,
        },
        { onConflict: "user_id,episode_id" }
      );
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["domiflix-progress"] }),
  });
}

export function useDomiflixWatchlist() {
  return useQuery({
    queryKey: ["domiflix-watchlist"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [] as DomiflixWatchlistItem[];
      const { data, error } = await supabase
        .from("domiflix_watchlist")
        .select("*")
        .eq("user_id", user.id)
        .order("added_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as DomiflixWatchlistItem[];
    },
  });
}

export function useToggleWatchlist() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ titleId, isInList }: { titleId: string; isInList: boolean }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      if (isInList) {
        const { error } = await supabase
          .from("domiflix_watchlist")
          .delete()
          .eq("user_id", user.id)
          .eq("title_id", titleId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("domiflix_watchlist")
          .insert({ user_id: user.id, title_id: titleId });
        if (error) throw error;
      }
    },
    onSuccess: (_data, { isInList }) => {
      queryClient.invalidateQueries({ queryKey: ["domiflix-watchlist"] });
      if (isInList) domiflixToast({ variant: "removed", message: "Removido da sua lista" });
      else domiflixToast({ variant: "added", message: "Adicionado à sua lista" });
    },
    onError: () => domiflixToast({ variant: "error", message: "Erro ao atualizar lista" }),
  });
}

// ─── Admin mutations ──────────────────────────────────────────────────────────

export function useCreateTitle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: Omit<DomiflixTitle, "id" | "created_at">) => {
      const { error } = await supabase.from("domiflix_titles").insert([data] as any);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["domiflix-titles"] });
      qc.invalidateQueries({ queryKey: ["domiflix-featured"] });
      toast.success("Título criado");
    },
    onError: () => toast.error("Erro ao criar título"),
  });
}

export function useUpdateTitle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...data }: Partial<DomiflixTitle> & { id: string }) => {
      const { error } = await supabase.from("domiflix_titles").update(data as any).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["domiflix-titles"] });
      qc.invalidateQueries({ queryKey: ["domiflix-featured"] });
      qc.invalidateQueries({ queryKey: ["domiflix-title"] });
      toast.success("Título atualizado");
    },
    onError: () => toast.error("Erro ao atualizar título"),
  });
}

export function useDeleteTitle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("domiflix_titles").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["domiflix-titles"] });
      qc.invalidateQueries({ queryKey: ["domiflix-featured"] });
      toast.success("Título removido");
    },
    onError: () => toast.error("Erro ao remover título"),
  });
}

export function useCreateSeason() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: Omit<DomiflixSeason, "id" | "created_at">) => {
      const { data: existing } = await supabase
        .from("domiflix_seasons")
        .select("order_index")
        .eq("title_id", data.title_id)
        .order("order_index", { ascending: false })
        .limit(1);
      const maxOrder = (existing as any)?.[0]?.order_index ?? -1;
      const { error } = await supabase
        .from("domiflix_seasons")
        .insert([{ ...data, order_index: maxOrder + 1 }] as any);
      if (error) throw error;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["domiflix-title", vars.title_id] });
      toast.success("Temporada criada");
    },
    onError: () => toast.error("Erro ao criar temporada"),
  });
}

export function useUpdateSeason() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, title_id, ...data }: Partial<DomiflixSeason> & { id: string; title_id: string }) => {
      const { error } = await supabase.from("domiflix_seasons").update(data as any).eq("id", id);
      if (error) throw error;
      return { title_id };
    },
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ["domiflix-title", result?.title_id] });
      toast.success("Temporada atualizada");
    },
    onError: () => toast.error("Erro ao atualizar temporada"),
  });
}

export function useDeleteSeason() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, title_id }: { id: string; title_id: string }) => {
      const { error } = await supabase.from("domiflix_seasons").delete().eq("id", id);
      if (error) throw error;
      return { title_id };
    },
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ["domiflix-title", result?.title_id] });
      toast.success("Temporada removida");
    },
    onError: () => toast.error("Erro ao remover temporada"),
  });
}

export function useCreateEpisode() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: Omit<DomiflixEpisode, "id" | "created_at">) => {
      let query = supabase
        .from("domiflix_episodes")
        .select("order_index")
        .eq("title_id", data.title_id)
        .order("order_index", { ascending: false })
        .limit(1);
      query = data.season_id ? query.eq("season_id", data.season_id) : query.is("season_id", null);
      const { data: existing } = await query;
      const maxOrder = (existing as any)?.[0]?.order_index ?? -1;
      const { error } = await supabase
        .from("domiflix_episodes")
        .insert([{ ...data, order_index: maxOrder + 1 }] as any);
      if (error) throw error;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["domiflix-title", vars.title_id] });
      toast.success("Episódio criado");
    },
    onError: () => toast.error("Erro ao criar episódio"),
  });
}

export function useUpdateEpisode() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, title_id, ...data }: Partial<DomiflixEpisode> & { id: string; title_id: string }) => {
      const { error } = await supabase.from("domiflix_episodes").update(data as any).eq("id", id);
      if (error) throw error;
      return { title_id };
    },
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ["domiflix-title", result?.title_id] });
      toast.success("Episódio atualizado");
    },
    onError: () => toast.error("Erro ao atualizar episódio"),
  });
}

export function useDeleteEpisode() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, title_id }: { id: string; title_id: string }) => {
      const { error } = await supabase.from("domiflix_episodes").delete().eq("id", id);
      if (error) throw error;
      return { title_id };
    },
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ["domiflix-title", result?.title_id] });
      toast.success("Episódio removido");
    },
    onError: () => toast.error("Erro ao remover episódio"),
  });
}
