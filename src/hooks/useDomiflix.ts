import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { slugify } from "@/lib/slugify";
import { domiflixToast } from "@/lib/domiflixToast";

// ─── Types ────────────────────────────────────────────────────────────────────

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
  is_active?: boolean;
  order_index: number;
  live_url: string | null;
  live_scheduled_at: string | null;
  created_at: string;
  track_group?: "core" | "plan";
  track_order?: number;
  learning_path_id?: string;
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
  mobile_video_id?: string | null;
  mobile_video_type?: "drive" | "youtube" | null;
  is_active?: boolean;
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
  company_id?: string | null;
  last_progress_at?: string | null;
}

export interface DomiflixTrackLesson {
  sequence: number;
  titleId: string;
  moduleTitle: string;
  moduleDescription: string | null;
  thumbnailUrl: string | null;
  bannerUrl: string | null;
  group: "core" | "plan";
  moduleCode: string | null;
  moduleName: string | null;
  modulePrice: number | null;
  includedInPlan: boolean;
  episodeId: string;
  lessonTitle: string;
  lessonDescription: string | null;
  episodeNumber: number | null;
  durationMinutes: number | null;
  videoType: "drive" | "youtube";
  videoId: string;
  completed: boolean;
  progressSeconds: number;
  durationSeconds: number;
}

export function getDomiflixLessonUrl(
  status: DomiflixLearningStatus,
  lesson: DomiflixTrackLesson,
) {
  const siblings = status.track.filter((item) => item.titleId === lesson.titleId);
  const lessonNumber = Math.max(1, siblings.findIndex((item) => item.episodeId === lesson.episodeId) + 1);
  const startAt = Math.max(0, Math.floor(lesson.progressSeconds));
  return `/domiflix/assistir/${slugify(lesson.moduleTitle)}/${lessonNumber}${startAt ? `/${startAt}` : ""}?trilha=${encodeURIComponent(status.path.slug)}`;
}

export function getDomiflixContinueUrl(status: DomiflixLearningStatus) {
  const next = status.track.find(
    (lesson) => lesson.episodeId === status.nextLesson?.episodeId || (!lesson.completed && (lesson.group === "core" || lesson.includedInPlan)),
  );
  return next ? getDomiflixLessonUrl(status, next) : `/domiflix?trilha=${encodeURIComponent(status.path.slug)}`;
}

export interface DomiflixLearningStatus {
  path: DomiflixLearningPath;
  paths: DomiflixLearningPath[];
  user: {
    firstName: string;
    email: string;
    companyName: string;
    companyId: string;
    accountStage: "trial" | "paid" | "neutral";
    onboardingDay: number;
  };
  progress: {
    coreTotal: number;
    coreCompleted: number;
    corePercent: number;
    trackTotal: number;
    trackCompleted: number;
    trackPercent: number;
    lastProgressAt: string | null;
  };
  reminder: {
    severity: "none" | "invite" | "soft" | "critical" | "complete";
    dismissedUntil: string | null;
  };
  nextLesson: {
    titleId: string;
    moduleTitle: string;
    episodeId: string;
    lessonTitle: string;
    episodeNumber: number | null;
    progressSeconds: number;
  } | null;
  introGate: {
    required: boolean;
    acknowledged: boolean;
    lesson: DomiflixTrackLesson | null;
  };
  track: DomiflixTrackLesson[];
}

export interface DomiflixLearningPath {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  coverUrl: string | null;
  isOnboarding: boolean;
}

export interface DomiflixSubtitle {
  id: string;
  episode_id: string;
  language_code: string;
  label: string;
  format: "vtt" | "srt";
  content: string | null;
  storage_path: string | null;
  is_default: boolean;
  order_index: number;
}

export interface DomiflixResource {
  id: string;
  episode_id: string;
  title: string;
  description: string | null;
  resource_type: "file" | "link";
  url: string | null;
  storage_path: string | null;
  order_index: number;
}

export interface DomiflixWatchlistItem {
  id: string;
  user_id: string;
  title_id: string;
  added_at: string;
}

// Full title with nested data
export interface DomiflixTitleFull extends DomiflixTitle {
  seasons: (DomiflixSeason & { episodes: DomiflixEpisode[] })[];
  episodes: DomiflixEpisode[]; // direct episodes (movies/lives without seasons)
}

// ─── Content queries ──────────────────────────────────────────────────────────

export function useDomiflixTitles() {
  return useQuery({
    queryKey: ["domiflix-titles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("domiflix_titles" as any)
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
        .from("domiflix_titles" as any)
        .select("*")
        .eq("is_featured", true)
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as unknown as DomiflixTitle | null;
    },
  });
}

/** Resolve um slug URL para o ID do título. */
export function useDomiflixTitleBySlug(slug: string | undefined) {
  return useQuery({
    queryKey: ["domiflix-title-by-slug", slug],
    enabled: !!slug,
    placeholderData: (previous) => previous,
    queryFn: async () => {
      if (!slug) return null;

      const { data, error } = await supabase
        .from("domiflix_titles" as any)
        .select("id, title")
        .order("order_index", { ascending: true });
      if (error) throw error;

      const titles = (data ?? []) as unknown as { id: string; title: string }[];
      const match = titles.find((t) => slugify(t.title) === slug);
      return match?.id ?? null;
    },
  });
}

/**
 * Dado o título atual, retorna o **primeiro episódio do próximo título** dentro
 * da MESMA seção (ordenado por `domiflix_section_titles.order_index`).
 *
 * Caso de uso: quando o usuário termina o último episódio de um módulo na
 * seção "Tutoriais", a tela de assistir oferece como "próximo" o primeiro
 * episódio do módulo seguinte da mesma seção. Retorna `null` se o título não
 * pertence a nenhuma seção, é o último da seção, ou o próximo módulo está
 * vazio.
 */
export function useNextTitleFirstEpisode(currentTitleId: string | undefined) {
  return useQuery({
    queryKey: ["domiflix-next-title-first-ep", currentTitleId],
    enabled: !!currentTitleId,
    queryFn: async (): Promise<{
      nextTitleId: string;
      nextTitleSlug: string;
      firstEpisode: DomiflixEpisode;
    } | null> => {
      if (!currentTitleId) return null;

      // 1) Seção que contém o título (se estiver em mais de uma, pega a de menor order_index)
      const { data: links, error } = await supabase
        .from("domiflix_section_titles" as any)
        .select("section_id, order_index")
        .eq("title_id", currentTitleId)
        .order("order_index", { ascending: true })
        .limit(1);
      if (error) throw error;
      const link = (links ?? [])[0] as unknown as
        | { section_id: string; order_index: number }
        | undefined;
      if (!link) return null;

      // 2) Próximo título da mesma seção
      const { data: nextLinks, error: e2 } = await supabase
        .from("domiflix_section_titles" as any)
        .select("title_id")
        .eq("section_id", link.section_id)
        .gt("order_index", link.order_index)
        .order("order_index", { ascending: true })
        .limit(1);
      if (e2) throw e2;
      const nextLink = (nextLinks ?? [])[0] as unknown as { title_id: string } | undefined;
      if (!nextLink) return null;

      // 3) Slug + primeiro episódio do próximo título
      const { data: nextTitle, error: e3 } = await supabase
        .from("domiflix_titles" as any)
        .select("id, title")
        .eq("id", nextLink.title_id)
        .maybeSingle();
      if (e3) throw e3;
      if (!nextTitle) return null;

      const { data: episodes, error: e4 } = await supabase
        .from("domiflix_episodes" as any)
        .select("*")
        .eq("title_id", nextLink.title_id)
        .order("order_index", { ascending: true })
        .limit(1);
      if (e4) throw e4;
      const firstEp = (episodes ?? [])[0] as unknown as DomiflixEpisode | undefined;
      if (!firstEp) return null;

      return {
        nextTitleId: nextLink.title_id,
        nextTitleSlug: slugify((nextTitle as { id: string; title: string }).title),
        firstEpisode: firstEp,
      };
    },
  });
}

export function useDomiflixTitle(id: string | undefined) {
  return useQuery({
    queryKey: ["domiflix-title", id],
    enabled: !!id,
    placeholderData: (previous) => previous,
    queryFn: async () => {
      if (!id) return null;

      const [titleRes, seasonsRes, episodesRes] = await Promise.all([
        supabase.from("domiflix_titles" as any).select("*").eq("id", id).single(),
        supabase
          .from("domiflix_seasons" as any)
          .select("*")
          .eq("title_id", id)
          .order("order_index", { ascending: true })
          .order("season_number", { ascending: true }),
        supabase
          .from("domiflix_episodes" as any)
          .select("*")
          .eq("title_id", id)
          .order("order_index", { ascending: true })
          .order("episode_number", { ascending: true }),
      ]);

      if (titleRes.error) throw titleRes.error;

      const title = titleRes.data as unknown as DomiflixTitle;
      const seasons = (seasonsRes.data ?? []) as unknown as DomiflixSeason[];
      const allEpisodes = (episodesRes.data ?? []) as unknown as DomiflixEpisode[];

      // Group episodes by season
      const seasonsWithEpisodes = seasons.map((season) => ({
        ...season,
        episodes: allEpisodes.filter((ep) => ep.season_id === season.id),
      }));

      // Direct episodes (no season assigned)
      const directEpisodes = allEpisodes.filter((ep) => ep.season_id === null);

      return {
        ...title,
        seasons: seasonsWithEpisodes,
        episodes: directEpisodes,
      } as DomiflixTitleFull;
    },
  });
}

/** Fetch episode counts per title (for progress bars on cards). */
export function useDomiflixEpisodeCounts() {
  return useQuery({
    queryKey: ["domiflix-episode-counts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("domiflix_episodes" as any)
        .select("title_id");
      if (error) throw error;
      const counts: Record<string, number> = {};
      ((data ?? []) as unknown as { title_id: string }[]).forEach((ep) => {
        counts[ep.title_id] = (counts[ep.title_id] || 0) + 1;
      });
      return counts;
    },
  });
}

/** Fetch all episodes grouped by title, with season info for "continue watching" cards. */
export function useDomiflixAllEpisodes() {
  return useQuery({
    queryKey: ["domiflix-all-episodes"],
    queryFn: async () => {
      const [episodesRes, seasonsRes] = await Promise.all([
        supabase.from("domiflix_episodes" as any).select("*").order("order_index"),
        supabase.from("domiflix_seasons" as any).select("*").order("order_index"),
      ]);

      const episodes = (episodesRes.data ?? []) as unknown as DomiflixEpisode[];
      const seasons = (seasonsRes.data ?? []) as unknown as DomiflixSeason[];

      // Group episodes by title_id (flat order)
      const byTitle: Record<string, DomiflixEpisode[]> = {};
      episodes.forEach((ep) => {
        if (!byTitle[ep.title_id]) byTitle[ep.title_id] = [];
        byTitle[ep.title_id].push(ep);
      });

      // Build season map: episodeId → { seasonNumber, episodeInSeason }
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

// ─── User progress ────────────────────────────────────────────────────────────

export function useDomiflixProgress() {
  return useQuery({
    queryKey: ["domiflix-progress"],
    queryFn: async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return [] as DomiflixProgress[];

      const { data, error } = await supabase
        .from("domiflix_user_progress" as any)
        .select("*")
        .eq("user_id", user.id)
        .order("watched_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as DomiflixProgress[];
    },
  });
}

export function useDomiflixLearningStatus(enabled = true, pathSlug = "tutoriais-do-sistema") {
  return useQuery({
    queryKey: ["domiflix-learning-status", pathSlug],
    enabled,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_domiflix_learning_status" as any, { p_path_slug: pathSlug });
      if (error) throw error;
      return data as unknown as DomiflixLearningStatus;
    },
  });
}

export function useDismissDomiflixReminder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("dismiss_domiflix_learning_reminder" as any);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["domiflix-learning-status"] }),
  });
}

export function useAcknowledgeDomiflixIntro() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (episodeId: string) => {
      const { error } = await supabase.rpc("acknowledge_domiflix_intro" as any, { p_episode_id: episodeId });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["domiflix-learning-status"] }),
  });
}

export function useDomiflixEpisodeExtras(episodeId: string | undefined) {
  return useQuery({
    queryKey: ["domiflix-episode-extras", episodeId],
    enabled: !!episodeId,
    queryFn: async () => {
      if (!episodeId) return { subtitles: [], resources: [] };
      const [subtitleResult, resourceResult] = await Promise.all([
        supabase.from("domiflix_episode_subtitles" as any).select("*").eq("episode_id", episodeId).order("order_index"),
        supabase.from("domiflix_episode_resources" as any).select("*").eq("episode_id", episodeId).order("order_index"),
      ]);
      if (subtitleResult.error) throw subtitleResult.error;
      if (resourceResult.error) throw resourceResult.error;
      const subtitles = await Promise.all(((subtitleResult.data ?? []) as unknown as DomiflixSubtitle[]).map(async (subtitle) => {
        if (subtitle.content || !subtitle.storage_path) return subtitle;
        const { data: signed, error: signedError } = await supabase.storage
          .from("domiflix-learning-assets")
          .createSignedUrl(subtitle.storage_path, 300);
        if (signedError || !signed?.signedUrl) return subtitle;
        const response = await fetch(signed.signedUrl);
        if (!response.ok) return subtitle;
        return { ...subtitle, content: await response.text() };
      }));
      return {
        subtitles,
        resources: (resourceResult.data ?? []) as unknown as DomiflixResource[],
      };
    },
  });
}

export function useDomiflixEpisodeMedia(episodeId: string | undefined) {
  return useQuery({
    queryKey: ["domiflix-episode-media", episodeId],
    enabled: !!episodeId,
    queryFn: async () => {
      if (!episodeId) return null;
      const { data, error } = await supabase
        .from("domiflix_episodes" as any)
        .select("video_id, video_type, mobile_video_id, mobile_video_type")
        .eq("id", episodeId)
        .single();
      if (error) throw error;
      return data as unknown as Pick<DomiflixEpisode, "video_id" | "video_type" | "mobile_video_id" | "mobile_video_type">;
    },
  });
}

export function useMarkEpisodeWatched() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      episodeId,
      titleId,
      progressSeconds,
      durationSeconds,
      completed,
      insertOnly,
    }: {
      episodeId: string;
      titleId: string;
      progressSeconds?: number;
      durationSeconds?: number;
      completed?: boolean;
      /**
       * Quando `true`, só CRIA a linha se ela ainda não existir — se o usuário
       * já tem progresso nesse episódio, a linha existente fica intacta.
       *
       * Usado pelo "marcar ao entrar" do player: abrir uma aula já concluída
       * não pode sobrescrever `completed`/`progress_seconds` com zero.
       * A garantia é do próprio Postgres (`ON CONFLICT DO NOTHING`), então não
       * há corrida entre ler e escrever.
       */
      insertOnly?: boolean;
    }) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const isCompleted = completed ?? (durationSeconds && progressSeconds
        ? progressSeconds / durationSeconds > 0.9
        : true);

      const { error } = await supabase.rpc("save_domiflix_progress" as any, {
        p_episode_id: episodeId,
        p_progress_seconds: progressSeconds ?? 0,
        p_duration_seconds: durationSeconds ?? 0,
        p_completed: isCompleted,
        p_insert_only: insertOnly === true,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["domiflix-progress"] });
      queryClient.invalidateQueries({ queryKey: ["domiflix-learning-status"] });
    },
  });
}

// ─── Watchlist ────────────────────────────────────────────────────────────────

export function useDomiflixWatchlist() {
  return useQuery({
    queryKey: ["domiflix-watchlist"],
    queryFn: async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return [] as DomiflixWatchlistItem[];

      const { data, error } = await supabase
        .from("domiflix_watchlist" as any)
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
    mutationFn: async ({
      titleId,
      isInList,
    }: {
      titleId: string;
      isInList: boolean;
    }) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      if (isInList) {
        const { error } = await supabase
          .from("domiflix_watchlist" as any)
          .delete()
          .eq("user_id", user.id)
          .eq("title_id", titleId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("domiflix_watchlist" as any)
          .insert({ user_id: user.id, title_id: titleId });
        if (error) throw error;
      }
    },
    onSuccess: (_data, { isInList }) => {
      queryClient.invalidateQueries({ queryKey: ["domiflix-watchlist"] });
      if (isInList) {
        domiflixToast({ variant: "removed", message: "Removido da sua lista" });
      } else {
        domiflixToast({ variant: "added", message: "Adicionado à sua lista" });
      }
    },
    onError: () => {
      domiflixToast({ variant: "error", message: "Erro ao atualizar lista" });
    },
  });
}

// ─── Admin mutations ──────────────────────────────────────────────────────────

export function useCreateTitle() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (
      data: Omit<DomiflixTitle, "id" | "created_at">
    ) => {
      const { data: created, error } = await supabase
        .from("domiflix_titles" as any)
        .insert([data])
        .select("id")
        .single();
      if (error) throw error;
      return (created as unknown as { id: string }).id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["domiflix-titles"] });
      queryClient.invalidateQueries({ queryKey: ["domiflix-featured"] });
      toast.success("Título criado");
    },
    onError: () => toast.error("Erro ao criar título"),
  });
}

export function useUpdateTitle() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      ...data
    }: Partial<DomiflixTitle> & { id: string }) => {
      const { error } = await supabase
        .from("domiflix_titles" as any)
        .update(data)
        .eq("id", id);
      if (error) throw error;
      return id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["domiflix-titles"] });
      queryClient.invalidateQueries({ queryKey: ["domiflix-featured"] });
      queryClient.invalidateQueries({ queryKey: ["domiflix-title"] });
      toast.success("Título atualizado");
    },
    onError: () => toast.error("Erro ao atualizar título"),
  });
}

export function useDeleteTitle() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("domiflix_titles" as any)
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["domiflix-titles"] });
      queryClient.invalidateQueries({ queryKey: ["domiflix-featured"] });
      toast.success("Título removido");
    },
    onError: () => toast.error("Erro ao remover título"),
  });
}

export function useCreateSeason() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (
      data: Omit<DomiflixSeason, "id" | "created_at">
    ) => {
      // Append to end of queue: compute next order_index = max + 1
      const { data: existing } = await supabase
        .from("domiflix_seasons" as any)
        .select("order_index")
        .eq("title_id", data.title_id)
        .order("order_index", { ascending: false })
        .limit(1);
      const maxOrder = (existing as any)?.[0]?.order_index ?? -1;
      const payload = { ...data, order_index: (maxOrder ?? -1) + 1 };
      const { error } = await supabase
        .from("domiflix_seasons" as any)
        .insert([payload]);
      if (error) throw error;
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["domiflix-title", vars.title_id] });
      toast.success("Temporada criada");
    },
    onError: () => toast.error("Erro ao criar temporada"),
  });
}

export function useUpdateSeason() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      title_id,
      ...data
    }: Partial<DomiflixSeason> & { id: string; title_id: string }) => {
      const { error } = await supabase
        .from("domiflix_seasons" as any)
        .update(data)
        .eq("id", id);
      if (error) throw error;
      return { title_id };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["domiflix-title", result?.title_id] });
      toast.success("Temporada atualizada");
    },
    onError: () => toast.error("Erro ao atualizar temporada"),
  });
}

export function useDeleteSeason() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, title_id }: { id: string; title_id: string }) => {
      const { error } = await supabase
        .from("domiflix_seasons" as any)
        .delete()
        .eq("id", id);
      if (error) throw error;
      return { title_id };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["domiflix-title", result?.title_id] });
      toast.success("Temporada removida");
    },
    onError: () => toast.error("Erro ao remover temporada"),
  });
}

export function useCreateEpisode() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (
      data: Omit<DomiflixEpisode, "id" | "created_at">
    ) => {
      // Append to end of queue within the same season (or "no season" bucket)
      let query = supabase
        .from("domiflix_episodes" as any)
        .select("order_index")
        .eq("title_id", data.title_id)
        .order("order_index", { ascending: false })
        .limit(1);
      query = data.season_id
        ? query.eq("season_id", data.season_id)
        : query.is("season_id", null);
      const { data: existing } = await query;
      const maxOrder = (existing as any)?.[0]?.order_index ?? -1;
      const payload = { ...data, order_index: (maxOrder ?? -1) + 1 };
      const { error } = await supabase
        .from("domiflix_episodes" as any)
        .insert([payload]);
      if (error) throw error;
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["domiflix-title", vars.title_id] });
      toast.success("Episódio criado");
    },
    onError: () => toast.error("Erro ao criar episódio"),
  });
}

export function useUpdateEpisode() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      title_id,
      ...data
    }: Partial<DomiflixEpisode> & { id: string; title_id: string }) => {
      const { error } = await supabase
        .from("domiflix_episodes" as any)
        .update(data)
        .eq("id", id);
      if (error) throw error;
      return { title_id };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["domiflix-title", result?.title_id] });
      toast.success("Episódio atualizado");
    },
    onError: () => toast.error("Erro ao atualizar episódio"),
  });
}

export function useDeleteEpisode() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, title_id }: { id: string; title_id: string }) => {
      const { error } = await supabase
        .from("domiflix_episodes" as any)
        .delete()
        .eq("id", id);
      if (error) throw error;
      return { title_id };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["domiflix-title", result?.title_id] });
      toast.success("Episódio removido");
    },
    onError: () => toast.error("Erro ao remover episódio"),
  });
}
