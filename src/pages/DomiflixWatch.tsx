import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, ChevronDown, Check, CircleCheckBig, Gauge, Loader2, Lock, List, Subtitles, SkipForward, Clock, ListVideo } from "lucide-react";

import {
  useDomiflixTitleBySlug,
  useDomiflixTitle,
  useDomiflixProgress,
  useMarkEpisodeWatched,
  useNextTitleFirstEpisode,
  DomiflixEpisode,
  DomiflixProgress,
  DomiflixTitleFull,
  DomiflixSubtitle,
  useDomiflixEpisodeExtras,
  useDomiflixLearningStatus,
  getDomiflixLessonUrl,
  type DomiflixTrackLesson,
} from "@/hooks/useDomiflix";
import {
  useDomiflixPreferences,
  useUpdatePlaybackSpeed,
  PLAYBACK_SPEEDS,
} from "@/hooks/useDomiflixPreferences";
import { supabase } from "@/integrations/supabase/client";
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
import { getDriveStreamUrl } from "@/lib/drive";
import { getYouTubeThumbnail } from "@/lib/youtube";
import {
  buildDomiflixProgressPayload,
  DomiflixProgressPayload,
} from "@/lib/domiflixProgress";
import {
  PlayIcon,
  PauseIcon,
  FullscreenIcon,
  MinimizeIcon,
  EpisodesListIcon,
  NextEpisodeIcon,
  SpeedIcon,
  SkipBack10Icon,
  SkipForward10Icon,
  VolumeHighIcon,
  VolumeLowIcon,
  VolumeMutedIcon,
} from "@/components/domiflix/PlayerIcons";

import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import domiflixLogo from "@/assets/domiflix-logo-horizontal-branco.png";
import { playDomiflixIntro, stopDomiflixIntro } from "@/lib/domiflixIntroSound";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { DomiflixTrackPanel } from "@/components/domiflix/DomiflixTrackPanel";
import { DomiflixLessonDetails } from "@/components/domiflix/DomiflixLessonDetails";
import { parseTimedText } from "@/lib/timedText";
import { slugify } from "@/lib/slugify";

// ─── YouTube IFrame API ──────────────────────────────────────────────────────

declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady: (() => void) | undefined;
  }
}
let ytApiLoaded = false;
let ytApiPromise: Promise<void> | null = null;

function loadYTApi(): Promise<void> {
  if (ytApiLoaded && window.YT?.Player) return Promise.resolve();
  if (ytApiPromise) return ytApiPromise;
  ytApiPromise = new Promise<void>((resolve) => {
    if (window.YT?.Player) {
      ytApiLoaded = true;
      resolve();
      return;
    }
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      ytApiLoaded = true;
      prev?.();
      resolve();
    };
    const tag = document.createElement("script");
    tag.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(tag);
  });
  return ytApiPromise;
}

function fmt(seconds: number): string {
  const safe = Math.max(0, seconds || 0);
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = Math.floor(safe % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

type ProgressPayload = DomiflixProgressPayload;

// ─── Player Page ─────────────────────────────────────────────────────────────

export default function DomiflixWatchPage() {
  const { titleSlug, episodeNumber, startSeconds } = useParams<{
    titleSlug: string;
    episodeNumber: string;
    startSeconds?: string;
  }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const pathSlug = searchParams.get("trilha") || "tutoriais-do-sistema";
  const queryClient = useQueryClient();
  const isMobileViewport = useIsMobile();

  const titleLookup = useDomiflixTitleBySlug(titleSlug);
  const resolvedTitleId = titleLookup.data;
  const titleQuery = useDomiflixTitle(resolvedTitleId ?? undefined);
  const titleData = titleQuery.data;
  const { data: progress = [] } = useDomiflixProgress();
  const { data: prefs } = useDomiflixPreferences();
  const updateSpeed = useUpdatePlaybackSpeed();
  const markWatched = useMarkEpisodeWatched();
  const markedRef = useRef(false);
  const [mobileTrackOpen, setMobileTrackOpen] = useState(false);
  const [completionOpen, setCompletionOpen] = useState(false);
  const [advanceCountdown, setAdvanceCountdown] = useState(4);
  const [autoAdvancePaused, setAutoAdvancePaused] = useState(false);
  const { data: learningStatus } = useDomiflixLearningStatus(true, pathSlug);
  const prefersReducedMotion = useMemo(
    () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false,
    [],
  );

  // All episodes flat
  const allEpisodes: DomiflixEpisode[] = useMemo(() => {
    if (!titleData) return [];
    return titleData.type === "series"
      ? titleData.seasons.flatMap((s) => s.episodes)
      : titleData.episodes;
  }, [titleData]);

  const epNum = parseInt(episodeNumber ?? "1", 10);
  const episodeIndex = Math.max(0, epNum - 1);
  const episode = allEpisodes[episodeIndex];
  const { data: extras = { subtitles: [], resources: [] } } = useDomiflixEpisodeExtras(episode?.id);
  const legacyNextEpisodeSameTitle = allEpisodes[episodeIndex + 1];
  const currentTrackLesson = learningStatus?.track.find((item) => item.episodeId === episode?.id);
  const currentTrackIndex = currentTrackLesson
    ? learningStatus?.track.findIndex((item) => item.episodeId === currentTrackLesson.episodeId) ?? -1
    : -1;
  const nextTrackLesson = currentTrackIndex >= 0 ? learningStatus?.track[currentTrackIndex + 1] : undefined;
  const crossesIntoOptionalModule = Boolean(
    currentTrackLesson &&
      (currentTrackLesson.group === "core" || currentTrackLesson.includedInPlan) &&
      nextTrackLesson?.group === "plan" &&
      !nextTrackLesson.includedInPlan,
  );
  const trackNextEpisode: DomiflixEpisode | undefined = nextTrackLesson && !crossesIntoOptionalModule
    ? {
        id: nextTrackLesson.episodeId,
        title_id: nextTrackLesson.titleId,
        season_id: null,
        episode_number: nextTrackLesson.episodeNumber,
        title: nextTrackLesson.lessonTitle,
        description: nextTrackLesson.lessonDescription,
        video_id: nextTrackLesson.videoId,
        video_type: nextTrackLesson.videoType,
        mobile_video_id: nextTrackLesson.mobileVideoId,
        mobile_video_type: nextTrackLesson.mobileVideoType,
        duration_minutes: nextTrackLesson.durationMinutes,
        thumbnail_url: nextTrackLesson.thumbnailUrl,
        order_index: nextTrackLesson.sequence,
        recorded_at: null,
        created_at: "",
      }
    : undefined;
  const nextEpisodeSameTitle = currentTrackLesson
    ? nextTrackLesson?.titleId === currentTrackLesson.titleId
      ? trackNextEpisode
      : undefined
    : legacyNextEpisodeSameTitle;

  const isLastInTitle = !legacyNextEpisodeSameTitle;
  const { data: nextSection } = useNextTitleFirstEpisode(
    isLastInTitle && !currentTrackLesson ? resolvedTitleId ?? undefined : undefined
  );
  const crossSectionNextEpisode = isLastInTitle ? nextSection?.firstEpisode : undefined;
  const nextEpisode = currentTrackLesson
    ? trackNextEpisode
    : nextEpisodeSameTitle ?? crossSectionNextEpisode;

  const seasonInfo =
    titleData?.type === "series" && episode
      ? titleData.seasons.find((s) => s.episodes.some((e) => e.id === episode.id))
      : null;
  const episodeNumberInSeason =
    seasonInfo && episode
      ? seasonInfo.episodes.findIndex((e) => e.id === episode.id) + 1
      : epNum;

  // Progress refs
  const progressSecondsRef = useRef(0);
  const durationSecondsRef = useRef(0);
  const userIdRef = useRef<string | null>(null);
  const accessTokenRef = useRef<string | null>(null);

  // Cache auth data once and keep token fresh for keepalive saves
  useEffect(() => {
    let active = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      userIdRef.current = data.session?.user.id ?? null;
      accessTokenRef.current = data.session?.access_token ?? null;
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      userIdRef.current = session?.user.id ?? null;
      accessTokenRef.current = session?.access_token ?? null;
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  // Progresso já salvo, lido por ref pra NÃO entrar nas deps do
  // buildProgressPayload — o array muda de identidade a cada refetch e isso
  // re-dispararia o efeito de save no unmount.
  const progressRef = useRef<DomiflixProgress[]>(progress);
  progressRef.current = progress;

  const buildProgressPayload = useCallback((): ProgressPayload | null => {
    const epId = episode?.id;
    return buildDomiflixProgressPayload({
      userId: userIdRef.current,
      episodeId: epId,
      titleId: resolvedTitleId,
      progressSeconds: progressSecondsRef.current,
      durationSeconds: durationSecondsRef.current,
      existing: epId ? progressRef.current.find((p) => p.episode_id === epId) ?? null : null,
    });
  }, [episode?.id, resolvedTitleId]);

  // Synchronous-ish save using fetch keepalive (works on unload/navigation)
  const saveProgressKeepalive = useCallback(() => {
    const payload = buildProgressPayload();
    const accessToken = accessTokenRef.current;
    if (!payload || !accessToken) return;

    const url = `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/domiflix_user_progress?on_conflict=user_id,episode_id`;
    const body = JSON.stringify(payload);

    try {
      fetch(url, {
        method: "POST",
        headers: {
          apikey: SUPABASE_PUBLISHABLE_KEY,
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          Prefer: "resolution=merge-duplicates",
        },
        body,
        keepalive: true,
      }).catch(() => {});
    } catch {
      // ignore
    }
  }, [buildProgressPayload]);

  // Async save (used on periodic interval — better auth handling)
  const saveProgressAsync = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    userIdRef.current = data.session?.user.id ?? null;
    accessTokenRef.current = data.session?.access_token ?? null;

    const payload = buildProgressPayload();
    if (!payload) return;

    const { error } = await supabase
      .from("domiflix_user_progress" as any)
      .upsert(payload, { onConflict: "user_id,episode_id" });

    if (error) throw error;
    queryClient.invalidateQueries({ queryKey: ["domiflix-progress"] });
  }, [buildProgressPayload, queryClient]);

  // Mark on entry
  useEffect(() => {
    if (!markedRef.current && episode?.video_id && resolvedTitleId) {
      markedRef.current = true;
      markWatched.mutate({
        episodeId: episode.id,
        titleId: resolvedTitleId,
        completed: false,
        progressSeconds: 0,
        durationSeconds: 0,
        // Só cria a linha se ainda não existir. Reabrir uma aula concluída
        // não pode zerar o progresso nem desmarcar o "concluído".
        insertOnly: true,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [episode?.id, resolvedTitleId]);

  // Periodic save every 20s
  useEffect(() => {
    const interval = setInterval(() => {
      saveProgressAsync().catch(() => {});
    }, 20000);
    return () => clearInterval(interval);
  }, [saveProgressAsync]);

  // Save on tab close / navigation away (using keepalive)
  useEffect(() => {
    const onHide = () => saveProgressKeepalive();
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") onHide();
    };

    window.addEventListener("pagehide", onHide);
    window.addEventListener("beforeunload", onHide);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("pagehide", onHide);
      window.removeEventListener("beforeunload", onHide);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [saveProgressKeepalive]);

  // Save on unmount (keepalive — survives navigation)
  useEffect(() => {
    return () => {
      saveProgressKeepalive();
    };
  }, [saveProgressKeepalive]);

  // Reset mark ref on episode change
  useEffect(() => {
    markedRef.current = false;
  }, [episodeIndex]);

  const handleBack = useCallback(async () => {
    try {
      await saveProgressAsync();
    } catch {
      saveProgressKeepalive();
    }
    navigate(`/domiflix?trilha=${encodeURIComponent(pathSlug)}`);
  }, [navigate, pathSlug, saveProgressAsync, saveProgressKeepalive]);

  // Resolve resume-second for any given episode based on saved progress
  const resumeSecondsFor = useCallback(
    (epId: string) => {
      const found = progress.find((p) => p.episode_id === epId);
      if (!found) return 0;
      if (found.completed) return 0;
      const ds = found.duration_seconds || 0;
      const ps = found.progress_seconds || 0;
      if (ds > 0 && ds - ps <= 5) return 0;
      return Math.max(0, Math.floor(ps));
    },
    [progress]
  );

  const goToNextEpisode = useCallback(async () => {
    try {
      await saveProgressAsync();
    } catch {
      saveProgressKeepalive();
    }
    if (!nextEpisode || !titleSlug) return;

    if (currentTrackLesson && nextTrackLesson && learningStatus) {
      navigate(getDomiflixLessonUrl(learningStatus, nextTrackLesson), { replace: true });
      return;
    }

    // Caso 1: próximo episódio é do mesmo título
    if (nextEpisodeSameTitle) {
      const startAt = resumeSecondsFor(nextEpisodeSameTitle.id);
      const path = `/domiflix/assistir/${titleSlug}/${epNum + 1}${startAt > 0 ? `/${startAt}` : ""}?trilha=${encodeURIComponent(pathSlug)}`;
      navigate(path, { replace: true });
      return;
    }

    // Caso 2: próximo é o primeiro episódio do próximo módulo na mesma seção
    if (crossSectionNextEpisode && nextSection?.nextTitleSlug) {
      const startAt = resumeSecondsFor(crossSectionNextEpisode.id);
      const path = `/domiflix/assistir/${nextSection.nextTitleSlug}/1${startAt > 0 ? `/${startAt}` : ""}?trilha=${encodeURIComponent(pathSlug)}`;
      navigate(path, { replace: true });
    }
  }, [
    nextEpisode,
    nextEpisodeSameTitle,
    crossSectionNextEpisode,
    nextSection,
    currentTrackLesson,
    nextTrackLesson,
    learningStatus,
    titleSlug,
    epNum,
    pathSlug,
    navigate,
    resumeSecondsFor,
    saveProgressAsync,
    saveProgressKeepalive,
  ]);

  useEffect(() => {
    setCompletionOpen(false);
    setAdvanceCountdown(4);
    setAutoAdvancePaused(false);
  }, [episode?.id]);

  useEffect(() => {
    if (!completionOpen || !nextEpisode || prefersReducedMotion || autoAdvancePaused) return;
    if (advanceCountdown <= 0) {
      void goToNextEpisode();
      return;
    }
    const timer = window.setTimeout(
      () => setAdvanceCountdown((current) => current - 1),
      1000,
    );
    return () => window.clearTimeout(timer);
  }, [advanceCountdown, autoAdvancePaused, completionOpen, goToNextEpisode, nextEpisode, prefersReducedMotion]);

  const handleVideoEnded = useCallback(async () => {
    try {
      await saveProgressAsync();
    } catch {
      saveProgressKeepalive();
    }
    setAdvanceCountdown(4);
    setAutoAdvancePaused(false);
    setCompletionOpen(true);
  }, [saveProgressAsync, saveProgressKeepalive]);

  const navigateToEpisode = useCallback(
    async (ep: DomiflixEpisode) => {
      try {
        await saveProgressAsync();
      } catch {
        saveProgressKeepalive();
      }
      const idx = allEpisodes.findIndex((e) => e.id === ep.id);
      if (idx >= 0 && titleSlug) {
        const startAt = resumeSecondsFor(ep.id);
        const path = `/domiflix/assistir/${titleSlug}/${idx + 1}${startAt > 0 ? `/${startAt}` : ""}?trilha=${encodeURIComponent(pathSlug)}`;
        navigate(path, { replace: true });
      }
    },
    [allEpisodes, titleSlug, navigate, pathSlug, resumeSecondsFor, saveProgressAsync, saveProgressKeepalive]
  );

  const navigateToTrackLesson = useCallback((lesson: DomiflixTrackLesson) => {
    const siblings = learningStatus?.track.filter((item) => item.titleId === lesson.titleId) ?? [];
    const lessonNumber = Math.max(1, siblings.findIndex((item) => item.episodeId === lesson.episodeId) + 1);
    const startAt = Math.max(0, Math.floor(lesson.progressSeconds));
    setMobileTrackOpen(false);
    navigate(`/domiflix/assistir/${slugify(lesson.moduleTitle)}/${lessonNumber}${startAt ? `/${startAt}` : ""}?trilha=${encodeURIComponent(pathSlug)}`);
  }, [learningStatus?.track, navigate, pathSlug]);

  if (!episode) {
    return (
      <div className="domiflix-root fixed inset-0 z-[100] bg-[#141414] flex flex-col items-center justify-center gap-7">
        <div className="domiflix-spinner" />
      </div>
    );
  }

  const titleName = titleData?.title ?? "";
  const startSec = startSeconds ? Math.max(0, parseInt(startSeconds, 10) || 0) : 0;
  const usePortraitVideo = isMobileViewport && Boolean(episode.mobile_video_id);
  const requiredLessons = learningStatus?.track.filter(
    (item) => item.group === "core" || item.includedInPlan,
  ) ?? [];
  const requiredLessonIndex = currentTrackLesson
    ? requiredLessons.findIndex((item) => item.episodeId === currentTrackLesson.episodeId)
    : -1;
  const moduleLessons = currentTrackLesson
    ? learningStatus?.track.filter((item) => item.titleId === currentTrackLesson.titleId) ?? []
    : [];
  const moduleLessonIndex = currentTrackLesson
    ? moduleLessons.findIndex((item) => item.episodeId === currentTrackLesson.episodeId)
    : -1;
  const titleSubLabel = currentTrackLesson
    ? currentTrackLesson.group === "core" || currentTrackLesson.includedInPlan
      ? `Aula ${requiredLessonIndex + 1} de ${requiredLessons.length} na sua trilha`
      : `Aula ${moduleLessonIndex + 1} de ${moduleLessons.length} neste módulo`
    : `Aula ${epNum}`;
  const contentTransitioning = titleLookup.isPlaceholderData || titleQuery.isPlaceholderData;
  const contentTransitionError = titleLookup.isError || titleQuery.isError;
  const completedRequiredTrack = Boolean(
    currentTrackLesson &&
      (currentTrackLesson.group === "core" || currentTrackLesson.includedInPlan) &&
      (!nextTrackLesson || crossesIntoOptionalModule),
  );
  const selectedVideoId = usePortraitVideo ? episode.mobile_video_id : episode.video_id;
  const selectedVideoType = usePortraitVideo ? episode.mobile_video_type || episode.video_type : episode.video_type;

  return (
    <div className="domiflix-player-root fixed inset-0 z-[100] overflow-y-auto bg-[#141414] text-white lg:grid lg:grid-cols-[340px_minmax(0,1fr)] lg:overflow-hidden">
      <aside className="hidden min-h-0 border-r border-white/10 lg:block">
        <DomiflixTrackPanel status={learningStatus} currentEpisodeId={episode.id} onSelect={navigateToTrackLesson} />
      </aside>
      <div key={episode.id} className="relative min-w-0 animate-in fade-in slide-in-from-right-2 duration-300 motion-reduce:animate-none lg:min-h-0 lg:overflow-y-auto">
        {contentTransitionError ? (
          <div className="absolute inset-0 z-[60] grid place-items-center bg-[#141414]/94 px-6 text-center backdrop-blur-sm" role="alert">
            <div className="max-w-sm">
              <p className="text-lg font-semibold text-white">Não foi possível abrir esta aula</p>
              <p className="mt-2 text-sm leading-6 text-stone-300">A trilha continua no lugar. Confira sua conexão e tente carregar novamente.</p>
              <button type="button" onClick={() => { void titleLookup.refetch(); void titleQuery.refetch(); }} className="mt-5 min-h-11 rounded-sm bg-red-600 px-5 text-sm font-semibold text-white hover:bg-red-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400">
                Tentar novamente
              </button>
            </div>
          </div>
        ) : contentTransitioning && (
          <div className="absolute inset-0 z-[60] grid place-items-center bg-[#141414]/88 backdrop-blur-sm" role="status" aria-live="polite">
            <div className="flex items-center gap-3 text-sm font-medium text-stone-200">
              <Loader2 className="h-5 w-5 animate-spin text-red-500 motion-reduce:animate-none" />
              Preparando a próxima aula…
            </div>
          </div>
        )}
        <div className="sticky top-0 z-10 flex h-12 items-center justify-between border-b border-white/10 bg-[#141414]/95 px-4 backdrop-blur lg:hidden">
          <button onClick={handleBack} className="flex min-h-11 items-center gap-2 rounded-sm text-sm text-stone-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"><ArrowLeft className="h-4 w-4" />Voltar</button>
          <button onClick={() => setMobileTrackOpen(true)} className="flex min-h-11 items-center gap-2 rounded-sm bg-white/[0.06] px-3 text-xs font-semibold text-stone-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"><ListVideo className="h-4 w-4" />Ver trilha</button>
        </div>
        <div className={cn("relative flex w-full items-center justify-center bg-black", usePortraitVideo ? "min-h-[72dvh] lg:min-h-[calc(100dvh-3rem)]" : "aspect-video")}>
        {selectedVideoId ? (
          <NetflixPlayer
          videoId={selectedVideoId}
          videoType={(selectedVideoType as "youtube" | "drive") ?? "youtube"}
          orientation={usePortraitVideo ? "portrait" : "landscape"}
          titleName={titleName}
          titleLogoUrl={titleData?.logo_url ?? null}
          titleSubLabel={titleSubLabel}
          episodeName={episode.title}
          episodeDescription={episode.description ?? ""}
          startSeconds={startSec}
          onBack={handleBack}
          onEnded={handleVideoEnded}
          onPlayNext={nextEpisode ? goToNextEpisode : undefined}
          playbackSpeed={prefs?.playback_speed ?? 1}
          onChangePlaybackSpeed={(s) => updateSpeed.mutate(s)}
          nextEpisode={nextEpisode}
          nextEpisodeNumberInSeason={
            nextEpisode && titleData?.type === "series"
              ? (() => {
                  const ns = titleData.seasons.find((s) =>
                    s.episodes.some((e) => e.id === nextEpisode.id)
                  );
                  return ns ? ns.episodes.findIndex((e) => e.id === nextEpisode.id) + 1 : null;
                })()
              : null
          }
          onProgressUpdate={(current, total) => {
            progressSecondsRef.current = current;
            durationSecondsRef.current = total;
          }}
          titleData={titleData ?? null}
          progress={progress}
          currentEpisodeId={episode.id}
          subtitles={extras.subtitles}
        />
      ) : (
        <div className="flex flex-col items-center justify-center h-full gap-6 px-6 text-center">
          <div className="flex h-20 w-20 sm:h-24 sm:w-24 items-center justify-center rounded-full bg-white/5 ring-1 ring-white/10">
            <Clock className="h-10 w-10 sm:h-12 sm:w-12 text-white/60" />
          </div>
          <div className="space-y-2 max-w-md">
            <h2 className="text-2xl sm:text-3xl font-semibold text-white">
              Essa aula ainda não está disponível
            </h2>
            <p className="text-sm sm:text-base text-white/60">
              Estamos finalizando a gravação. Em breve ela ficará disponível pra você assistir aqui.
            </p>
          </div>
          <button
            onClick={handleBack}
            className="mt-2 inline-flex h-14 min-w-[200px] items-center justify-center rounded-md bg-red-600 px-8 text-base font-semibold text-white shadow-lg transition-colors hover:bg-red-700 active:bg-red-800 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-0 focus:ring-offset-black"
          >
            Voltar
          </button>
        </div>
        )}
        {completionOpen && (
          <div className="absolute inset-0 z-[60] grid place-items-center bg-black/90 px-5 py-8 text-center backdrop-blur-sm" role="dialog" aria-label="Aula concluída" onPointerMove={() => setAutoAdvancePaused(true)} onFocusCapture={() => setAutoAdvancePaused(true)}>
            <div className="w-full max-w-md">
              <CircleCheckBig className="mx-auto h-12 w-12 text-emerald-400" />
              <p className="mt-5 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-400">Aula concluída</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white">
                {nextEpisode ? "Vamos para a próxima" : completedRequiredTrack ? "Sua trilha obrigatória está em dia" : "Conteúdo concluído"}
              </h2>
              <p className="mt-3 text-sm leading-6 text-stone-300">
                {nextEpisode
                  ? prefersReducedMotion || autoAdvancePaused
                    ? "Avance quando estiver pronto."
                    : `A próxima aula começa em ${advanceCountdown} segundo${advanceCountdown === 1 ? "" : "s"}.`
                  : crossesIntoOptionalModule
                    ? "Você concluiu as aulas da formação básica e dos módulos do seu plano. Os demais módulos continuam disponíveis para conhecer."
                    : "Seu progresso foi salvo. Você pode revisar esta aula ou voltar aos módulos."}
              </p>
              <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-center">
                <button type="button" onClick={() => setCompletionOpen(false)} className="min-h-11 rounded-sm border border-white/20 px-5 text-sm font-semibold text-white transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">
                  Ficar nesta aula
                </button>
                <button type="button" onClick={() => nextEpisode ? void goToNextEpisode() : navigate(`/domiflix?trilha=${encodeURIComponent(pathSlug)}`)} className="min-h-11 rounded-sm bg-red-600 px-5 text-sm font-semibold text-white transition-colors hover:bg-red-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400 focus-visible:ring-offset-2 focus-visible:ring-offset-black">
                  {nextEpisode ? "Próxima aula agora" : "Ver todos os módulos"}
                </button>
              </div>
            </div>
          </div>
        )}
        </div>
        <DomiflixLessonDetails
          moduleTitle={titleName}
          lessonTitle={episode.title}
          description={episode.description}
          resources={extras.resources}
          group={currentTrackLesson?.group ?? "core"}
          includedInPlan={currentTrackLesson?.includedInPlan ?? true}
          moduleCode={currentTrackLesson?.moduleCode ?? null}
          moduleName={currentTrackLesson?.moduleName ?? null}
          modulePrice={currentTrackLesson?.modulePrice ?? null}
          accountStage={learningStatus?.user.accountStage ?? "neutral"}
          userEmail={learningStatus?.user.email ?? ""}
          companyName={learningStatus?.user.companyName ?? ""}
          pathTitle={learningStatus?.path.title ?? "Tutoriais do sistema"}
        />
      </div>
      <Drawer open={mobileTrackOpen} onOpenChange={setMobileTrackOpen}>
        <DrawerContent className="h-[88dvh] max-h-[88dvh] overflow-hidden border-white/10 bg-[#181818] p-0 text-white">
          <DrawerHeader className="sr-only"><DrawerTitle>Sua trilha de tutoriais</DrawerTitle></DrawerHeader>
          <DomiflixTrackPanel status={learningStatus} currentEpisodeId={episode.id} onSelect={navigateToTrackLesson} />
        </DrawerContent>
      </Drawer>
    </div>
  );
}

// ─── Netflix-style Player ────────────────────────────────────────────────────

export interface NetflixPlayerProps {
  videoId: string;
  videoType: "youtube" | "drive";
  titleName: string;
  titleLogoUrl?: string | null;
  titleSubLabel: string;
  episodeName?: string;
  episodeDescription?: string;
  startSeconds?: number;
  onBack: () => void;
  onEnded?: () => void;
  onPlayNext?: () => void;
  playbackSpeed?: number;
  onChangePlaybackSpeed?: (speed: number) => void;
  nextEpisode?: DomiflixEpisode;
  nextEpisodeNumberInSeason?: number | null;
  onProgressUpdate?: (currentSeconds: number, totalSeconds: number) => void;
  titleData?: DomiflixTitleFull | null;
  progress?: DomiflixProgress[];
  currentEpisodeId?: string;
  onSelectEpisode?: (ep: DomiflixEpisode) => void;
  subtitles?: DomiflixSubtitle[];
  locked?: boolean;
  orientation?: "landscape" | "portrait";
}

export function NetflixPlayer({
  videoId,
  videoType,
  titleName,
  titleLogoUrl,
  titleSubLabel,
  episodeName,
  episodeDescription,
  startSeconds = 0,
  onBack,
  onEnded,
  onPlayNext,
  playbackSpeed = 1,
  onChangePlaybackSpeed,
  nextEpisode,
  onProgressUpdate,
  titleData,
  progress: progressItems = [],
  currentEpisodeId,
  onSelectEpisode,
  subtitles = [],
  locked = false,
  orientation = "landscape",
}: NetflixPlayerProps) {
  const isMobile = useIsMobile();
  const ytContainerRef = useRef<HTMLDivElement>(null);
  const ytPlayerRef = useRef<any>(null);
  const videoElRef = useRef<HTMLVideoElement>(null);
  const previewVideoRef = useRef<HTMLVideoElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);

  const onEndedRef = useRef(onEnded);
  onEndedRef.current = onEnded;
  const onBackRef = useRef(onBack);
  onBackRef.current = onBack;
  const tickRef = useRef<number>(0);

  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(100);
  const [muted, setMuted] = useState(false);
  const [showHud, setShowHud] = useState(true);
  const [hudLocked, setHudLocked] = useState(false);
  const [seeking, setSeeking] = useState(false);
  const [activeSubtitleId, setActiveSubtitleId] = useState<string | null>(null);
  const [showSubtitleMenu, setShowSubtitleMenu] = useState(false);

  useEffect(() => {
    setActiveSubtitleId((current) => {
      if (current && subtitles.some((subtitle) => subtitle.id === current)) return current;
      return subtitles.find((subtitle) => subtitle.is_default)?.id ?? null;
    });
  }, [subtitles]);

  const activeSubtitle = subtitles.find((subtitle) => subtitle.id === activeSubtitleId) ?? null;
  const subtitleCues = useMemo(
    () => activeSubtitle?.content ? parseTimedText(activeSubtitle.content) : [],
    [activeSubtitle?.content],
  );
  const visibleSubtitle = subtitleCues.find((cue) => currentTime >= cue.start && currentTime < cue.end)?.text ?? null;

  // YouTube bot wall detection — alguns usuários recebem "Faça login pra
  // confirmar que não é um robô" dentro do iframe. Não tem como bypassar
  // do lado do cliente; o objetivo aqui é só detectar e mostrar UI amigável.
  const [ytBlocked, setYtBlocked] = useState(false);
  const [retryNonce, setRetryNonce] = useState(0);
  const playStartedRef = useRef(false);

  // Reset transient playback state whenever the episode/video changes,
  // so the progress bar instantly snaps back to 0 instead of carrying
  // over the previous episode's value while the new video loads.
  useEffect(() => {
    setReady(false);
    setCurrentTime(0);
    setDuration(0);
    setSeeking(false);
    setYtBlocked(false);
    playStartedRef.current = false;
  }, [videoId]);

  const [introPlaying, setIntroPlaying] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showVolume, setShowVolume] = useState(false);
  const [showEpisodes, setShowEpisodes] = useState(false);
  const [showSpeed, setShowSpeed] = useState(false);
  const [showNextPreview, setShowNextPreview] = useState(false);
  const [showStillWatching, setShowStillWatching] = useState(false);
  const stillWatchingTimer = useRef<ReturnType<typeof setTimeout>>();

  // Hover preview state
  const [hoverPct, setHoverPct] = useState<number | null>(null);
  const [hoverTime, setHoverTime] = useState(0);
  const [previewReady, setPreviewReady] = useState(false);
  const previewSeekTimer = useRef<number | null>(null);

  const hideTimer = useRef<ReturnType<typeof setTimeout>>();
  const volumeTimer = useRef<ReturnType<typeof setTimeout>>();

  // Stable refs
  const playingRef = useRef(playing);
  playingRef.current = playing;
  const currentTimeRef = useRef(currentTime);
  currentTimeRef.current = currentTime;
  const durationRef = useRef(duration);
  durationRef.current = duration;
  const mutedRef = useRef(muted);
  mutedRef.current = muted;

  const isYouTube = videoType === "youtube";
  const isDrive = videoType === "drive";

  // ── Intro sound effect ──
  // Plays the Domiflix intro before the video starts, while keeping the
  // player paused/muted under a black overlay. Restarts on every videoId
  // change (i.e. each new episode / live).
  useEffect(() => {
    setIntroPlaying(true);
    let cancelled = false;
    playDomiflixIntro().then(() => {
      if (!cancelled) setIntroPlaying(false);
    });
    return () => {
      cancelled = true;
      stopDomiflixIntro();
    };
  }, [videoId]);

  // While the intro is playing, force the underlying video to be paused
  // and muted. When it ends, resume + unmute.
  useEffect(() => {
    let botWallWatchdog: ReturnType<typeof setTimeout> | undefined;

    if (isYouTube) {
      const yt = ytPlayerRef.current;
      if (!yt || !ready) return;
      try {
        if (introPlaying) {
          yt.mute?.();
          yt.pauseVideo?.();
        } else {
          yt.unMute?.();
          yt.playVideo?.();
          // Watchdog do bot wall: o YouTube renderiza a tela "Faça login pra
          // confirmar que não é robô" DENTRO do iframe — onReady chega
          // normalmente, mas o player nunca entra em PLAYING. Se em 7s o
          // playStartedRef não virou true, assume bloqueado.
          botWallWatchdog = setTimeout(() => {
            if (!playStartedRef.current && !ytBlocked) {
              setYtBlocked(true);
            }
          }, 7000);
        }
      } catch {
        // ignore
      }
    } else {
      const v = videoElRef.current;
      if (!v) return;
      if (introPlaying) {
        v.muted = true;
        try { v.pause(); } catch { /* ignore */ }
      } else {
        v.muted = mutedRef.current;
        v.play().catch(() => {});
      }
    }

    return () => {
      if (botWallWatchdog) clearTimeout(botWallWatchdog);
    };
  }, [introPlaying, ready, isYouTube, ytBlocked]);

  // Apply playback speed (and re-apply when player or speed changes)
  useEffect(() => {
    if (isYouTube) {
      try {
        ytPlayerRef.current?.setPlaybackRate?.(playbackSpeed);
      } catch {
        // ignore
      }
    } else if (videoElRef.current) {
      videoElRef.current.playbackRate = playbackSpeed;
    }
  }, [playbackSpeed, isYouTube, ready]);

  // ── Controls (work for both YT and Drive) ──
  const togglePlay = useCallback(() => {
    if (isYouTube) {
      if (!ytPlayerRef.current) return;
      if (playingRef.current) ytPlayerRef.current.pauseVideo();
      else ytPlayerRef.current.playVideo();
    } else {
      const v = videoElRef.current;
      if (!v) return;
      if (v.paused) v.play().catch(() => {});
      else v.pause();
    }
  }, [isYouTube]);

  const seekTo = useCallback(
    (t: number) => {
      if (isYouTube) {
        ytPlayerRef.current?.seekTo(t, true);
      } else if (videoElRef.current) {
        videoElRef.current.currentTime = t;
      }
      setCurrentTime(t);
    },
    [isYouTube]
  );

  const skip = useCallback(
    (delta: number) => {
      const t = Math.max(0, Math.min(durationRef.current, currentTimeRef.current + delta));
      seekTo(t);
    },
    [seekTo]
  );

  const toggleMute = useCallback(() => {
    if (isYouTube) {
      if (!ytPlayerRef.current) return;
      if (mutedRef.current) {
        ytPlayerRef.current.unMute();
        setMuted(false);
      } else {
        ytPlayerRef.current.mute();
        setMuted(true);
      }
    } else if (videoElRef.current) {
      videoElRef.current.muted = !videoElRef.current.muted;
      setMuted(videoElRef.current.muted);
    }
  }, [isYouTube]);

  const handleVolumeChange = useCallback(
    (v: number) => {
      const clamped = Math.max(0, Math.min(100, v));
      setVolume(clamped);
      if (isYouTube) {
        ytPlayerRef.current?.setVolume(clamped);
        if (clamped === 0) {
          ytPlayerRef.current?.mute();
          setMuted(true);
        } else if (mutedRef.current) {
          ytPlayerRef.current?.unMute();
          setMuted(false);
        }
      } else if (videoElRef.current) {
        videoElRef.current.volume = clamped / 100;
        if (clamped === 0) {
          videoElRef.current.muted = true;
          setMuted(true);
        } else {
          videoElRef.current.muted = false;
          setMuted(false);
        }
      }
    },
    [isYouTube]
  );

  const toggleFullscreen = useCallback(async () => {
    const el = document.querySelector(".domiflix-player-root");
    if (!el) return;
    if (document.fullscreenElement) {
      await document.exitFullscreen();
      return;
    }
    try {
      await (el as HTMLElement).requestFullscreen();
      const screenOrientation = screen.orientation as ScreenOrientation & {
        lock?: (orientation: "landscape") => Promise<void>;
      };
      if (orientation === "landscape" && screenOrientation?.lock) {
        await screenOrientation.lock("landscape").catch(() => undefined);
      }
    } catch {
      // Alguns navegadores não oferecem fullscreen; o player continua inline.
    }
  }, [orientation]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest("button, a, input, textarea, select, [role='checkbox'], [role='menuitem'], [contenteditable='true']")) {
        return;
      }
      switch (e.key) {
        case " ":
        case "k":
          e.preventDefault();
          togglePlay();
          break;
        case "ArrowLeft":
          e.preventDefault();
          if (!locked) skip(-10);
          break;
        case "ArrowRight":
          e.preventDefault();
          if (!locked) skip(10);
          break;
        case "m":
          e.preventDefault();
          toggleMute();
          break;
        case "f":
          e.preventDefault();
          toggleFullscreen();
          break;
        case "Escape":
          if (document.fullscreenElement) document.exitFullscreen();
          else if (!locked) onBackRef.current();
          break;
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [togglePlay, skip, toggleMute, toggleFullscreen, locked]);

  // ── Create YouTube player ──
  useEffect(() => {
    if (!isYouTube) return;
    let destroyed = false;
    loadYTApi().then(() => {
      if (destroyed) return;
      const el = document.createElement("div");
      el.id = "yt-player-" + Date.now();
      el.style.width = "100%";
      el.style.height = "100%";
      if (!ytContainerRef.current) return;
      ytContainerRef.current.innerHTML = "";
      ytContainerRef.current.appendChild(el);

      ytPlayerRef.current = new window.YT.Player(el.id, {
        width: "100%",
        height: "100%",
        videoId,
        // Use privacy-enhanced domain — fewer suggestions, no tracking
        // cookies and minimal YouTube branding overlays.
        host: "https://www.youtube-nocookie.com",
        playerVars: {
          autoplay: 1,
          controls: 0,
          modestbranding: 1,
          rel: 0,
          showinfo: 0,
          iv_load_policy: 3,
          disablekb: 1,
          fs: 0,
          playsinline: 1,
          cc_load_policy: 0,
        },
        events: {
          onReady: (e: any) => {
            if (destroyed) return;
            setReady(true);
            setDuration(e.target.getDuration());
            setVolume(e.target.getVolume());
            setMuted(e.target.isMuted());
            if (startSeconds && startSeconds > 0) {
              try {
                e.target.seekTo(startSeconds, true);
              } catch {
                // ignore
              }
            }
            try {
              e.target.setPlaybackRate?.(playbackSpeed);
            } catch {
              // ignore
            }
            // No mobile, autoplay:1 é ignorado — chamar playVideo() diretamente
            // dentro do onReady (contexto do IFrame API) é o único jeito confiável
            // de iniciar o vídeo sem exigir segundo toque do usuário.
            try {
              e.target.playVideo();
            } catch {
              // ignore
            }
            setPlaying(true);
          },
          onStateChange: (e: any) => {
            if (destroyed) return;
            const isPlaying = e.data === window.YT.PlayerState.PLAYING;
            setPlaying(isPlaying);
            // Sinal real de "vídeo começou a tocar" — usado pelo watchdog
            // que detecta bot wall (onReady chega normalmente mas PLAYING não).
            if (isPlaying) playStartedRef.current = true;
            if (e.data === window.YT.PlayerState.ENDED) onEndedRef.current?.();
          },
          onError: (e: any) => {
            if (destroyed) return;
            // 2 = parâmetro inválido (bug nosso, ignorar)
            // 5/100/101/150 = erro HTML5, vídeo removido/privado, embed bloqueado
            if (e?.data === 5 || e?.data === 100 || e?.data === 101 || e?.data === 150) {
              setYtBlocked(true);
            }
          },
        },
      });
    });
    return () => {
      destroyed = true;
      try {
        ytPlayerRef.current?.destroy();
      } catch {
        // ignore
      }
      cancelAnimationFrame(tickRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoId, isYouTube, retryNonce]);

  // ── Drive HTML5 video init ──
  useEffect(() => {
    if (!isDrive) return;
    const v = videoElRef.current;
    if (!v) return;
    const onLoaded = () => {
      setReady(true);
      setDuration(v.duration || 0);
      if (startSeconds > 0) {
        try {
          v.currentTime = startSeconds;
        } catch {
          // ignore
        }
      }
      v.play().catch(() => {});
    };
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onEnd = () => onEndedRef.current?.();
    v.addEventListener("loadedmetadata", onLoaded);
    v.addEventListener("play", onPlay);
    v.addEventListener("pause", onPause);
    v.addEventListener("ended", onEnd);
    return () => {
      v.removeEventListener("loadedmetadata", onLoaded);
      v.removeEventListener("play", onPlay);
      v.removeEventListener("pause", onPause);
      v.removeEventListener("ended", onEnd);
    };
  }, [isDrive, startSeconds]);

  // Time tick
  const onProgressRef = useRef(onProgressUpdate);
  onProgressRef.current = onProgressUpdate;

  useEffect(() => {
    if (!ready) return;
    let active = true;
    function tick() {
      if (!active) return;
      try {
        let t = 0;
        let d = 0;
        if (isYouTube) {
          t = ytPlayerRef.current?.getCurrentTime?.() ?? 0;
          d = ytPlayerRef.current?.getDuration?.() ?? 0;
        } else if (videoElRef.current) {
          t = videoElRef.current.currentTime || 0;
          d = videoElRef.current.duration || 0;
        }
        if (!seeking) setCurrentTime(t);
        if (d > 0) setDuration(d);
        onProgressRef.current?.(t, d);
      } catch {
        // ignore
      }
      tickRef.current = requestAnimationFrame(tick);
    }
    tick();
    return () => {
      active = false;
      cancelAnimationFrame(tickRef.current);
    };
  }, [ready, seeking, isYouTube]);

  // Auto-hide HUD após 3s parado quando o vídeo está tocando (Netflix-like).
  // Quando pausado, controles ficam sempre visíveis (não agenda esconder).
  // Cursor também some junto via `cursor-none` no container raiz.
  // "Still watching" overlay continua aparecendo após 5s de pausa sem interação.
  const resetHideTimer = useCallback(() => {
    if (hudLocked) {
      setShowHud(false);
      clearTimeout(hideTimer.current);
      return;
    }
    setShowHud(true);
    clearTimeout(hideTimer.current);
    if (playingRef.current && !showEpisodes) {
      hideTimer.current = setTimeout(() => setShowHud(false), 3000);
    }
    // Reset "still watching" overlay on any user interaction
    setShowStillWatching(false);
    clearTimeout(stillWatchingTimer.current);
    if (!playingRef.current) {
      stillWatchingTimer.current = setTimeout(() => setShowStillWatching(true), 5000);
    }
  }, [showEpisodes, hudLocked]);

  useEffect(() => {
    resetHideTimer();
    return () => {
      clearTimeout(hideTimer.current);
      clearTimeout(stillWatchingTimer.current);
    };
  }, [playing, resetHideTimer]);

  // Fullscreen listener
  useEffect(() => {
    const handler = () => {
      const fs = !!document.fullscreenElement;
      setIsFullscreen(fs);
      // Lock landscape on mobile while in fullscreen (Netflix-style)
      const screenOrientation = (screen as any).orientation;
      if (fs && screenOrientation?.lock && orientation !== "portrait") {
        screenOrientation.lock("landscape").catch(() => {
          /* unsupported (iOS Safari) — silently ignore */
        });
      } else if (!fs && screenOrientation?.unlock) {
        try { screenOrientation.unlock(); } catch { /* noop */ }
      }
    };
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, [orientation]);

  // Show "Next Episode" preview when within last 20s
  useEffect(() => {
    if (!duration) {
      setShowNextPreview(false);
      return;
    }
    const remaining = duration - currentTime;
    setShowNextPreview(remaining > 0 && remaining <= 10);
  }, [currentTime, duration]);

  // ── Frame preview (Drive only) ──
  const driveStreamUrl = isDrive ? getDriveStreamUrl(videoId) : "";

  useEffect(() => {
    if (!isDrive) return;
    const pv = previewVideoRef.current;
    if (!pv) return;
    const onMeta = () => setPreviewReady(true);
    pv.addEventListener("loadedmetadata", onMeta);
    return () => pv.removeEventListener("loadedmetadata", onMeta);
  }, [isDrive]);

  // Debounced preview seek + canvas draw
  useEffect(() => {
    if (!isDrive || hoverPct === null || !previewReady) return;
    if (previewSeekTimer.current) cancelAnimationFrame(previewSeekTimer.current);
    previewSeekTimer.current = requestAnimationFrame(() => {
      const pv = previewVideoRef.current;
      const canvas = previewCanvasRef.current;
      if (!pv || !canvas || !pv.duration) return;
      const t = Math.max(0, Math.min(pv.duration - 0.1, hoverPct * pv.duration));
      pv.currentTime = t;
      const drawOnSeeked = () => {
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        try {
          ctx.drawImage(pv, 0, 0, canvas.width, canvas.height);
        } catch {
          // ignore (CORS may block)
        }
        pv.removeEventListener("seeked", drawOnSeeked);
      };
      pv.addEventListener("seeked", drawOnSeeked);
    });
  }, [hoverPct, isDrive, previewReady]);

  const playbackProgress = duration > 0 ? (currentTime / duration) * 100 : 0;

  const VolumeIcon =
    muted || volume === 0 ? VolumeMutedIcon : volume < 50 ? VolumeLowIcon : VolumeHighIcon;

  return (
    <div
      // aspect-video (16:9) ocupando o máximo do viewport sem cropar.
      // Em viewports portrait → letterbox top/bottom; em ultrawide → pillarbox laterais.
      // O container pai (`domiflix-player-root`) já é flex/center com fundo preto.
      className={cn("relative bg-black select-none overflow-hidden", orientation === "portrait" ? "aspect-[9/16] h-[min(78dvh,900px)] w-auto max-h-full max-w-full" : "aspect-video h-full w-full max-h-[56.25vw] max-w-[177.78vh]")}
      style={{ cursor: showHud ? "default" : "none" }}
      onMouseMove={resetHideTimer}
      onTouchStart={() => {
        // Em mobile NÃO chamamos resetHideTimer no touchstart — deixamos o
        // onClick decidir entre "mostrar" ou "esconder" o HUD. Se chamássemos
        // aqui, o HUD seria sempre forçado a aparecer antes do click rodar
        // a lógica de toggle, e ficava impossível esconder.
        if (!isMobile) resetHideTimer();
      }}
      onClick={(e) => {
        const target = e.target as HTMLElement;
        if (target.closest(".player-controls")) return;
        if (target.closest(".episodes-overlay")) return;

        // Em mobile (Netflix-style): tap em área vazia só mostra/esconde
        // os controles. Play/pause SÓ no botão central (cluster mobile).
        // Em desktop mantemos o atalho clássico de "click anywhere = toggle play".
        if (isMobile) {
          if (showHud) {
            // Esconde imediatamente — comportamento Netflix/YouTube mobile.
            setShowHud(false);
            clearTimeout(hideTimer.current);
          } else {
            resetHideTimer();
          }
          return;
        }
        togglePlay();
      }}
    >
      {/* ── YouTube iframe ──
          O container já é `aspect-video` no NetflixPlayer raiz, então o
          iframe respeita 16:9 sem cropar.
          Mantemos um scale leve (1.05) só pra disfarçar o resíduo de UI
          do YouTube (título no topo / "ver no YouTube") — em vez do antigo
          1.16 que cortava ~16% do conteúdo. Esse 5% é praticamente
          imperceptível e ainda esconde os elementos residuais. */}
      {isYouTube && (
        <>
          <div className="absolute inset-0 overflow-hidden bg-black">
            <div
              ref={ytContainerRef}
              className={cn(
                "absolute inset-0 pointer-events-none domiflix-yt-cover transition-opacity duration-300",
                ready ? "opacity-100" : "opacity-0"
              )}
              style={{ transform: "scale(1.05)", transformOrigin: "center center" }}
            />
          </div>
          <div className="absolute inset-0 z-[5] bg-black pointer-events-none transition-opacity duration-300" style={{ opacity: ready ? 0 : 1 }} />

          {ytBlocked && (
            <div className="absolute inset-0 z-[30] flex items-center justify-center bg-black/95 px-6">
              <div className="max-w-md text-center text-white">
                <div className="mb-4 text-4xl">⚠️</div>
                <h2 className="mb-2 text-xl font-semibold">
                  Vídeo bloqueado pelo YouTube
                </h2>
                <p className="mb-6 text-sm text-white/70">
                  O YouTube está pedindo login pra confirmar que você não é um robô.
                  Isso acontece em alguns navegadores e provedores de internet — não é
                  problema do app. Você pode assistir direto no YouTube ou tentar
                  recarregar.
                </p>
                <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
                  <button
                    onClick={() =>
                      window.open(
                        `https://www.youtube.com/watch?v=${videoId}`,
                        "_blank",
                        "noopener,noreferrer"
                      )
                    }
                    className="rounded bg-[#E50914] px-5 py-2 font-medium text-white hover:bg-[#f6121d]"
                  >
                    Assistir no YouTube
                  </button>
                  <button
                    onClick={() => {
                      setYtBlocked(false);
                      playStartedRef.current = false;
                      setRetryNonce((n) => n + 1);
                    }}
                    className="rounded border border-white/30 px-5 py-2 font-medium text-white hover:bg-white/10"
                  >
                    Tentar novamente
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* ── Drive HTML5 video ──
          Notes for fast streaming:
          - `preload="auto"` tells the browser to start fetching bytes
            immediately (the `usercontent.google.com` host honours HTTP
            Range requests, so the video can begin playing before the
            full file is downloaded).
          - We do NOT set `crossOrigin` on the main element: that would
            force a CORS preflight on every range request and slow the
            initial buffering. The hidden preview <video> below keeps
            CORS so it can be drawn into a canvas for thumbnails. */}
      {isDrive && (
        <>
          <video
            ref={videoElRef}
            src={driveStreamUrl}
            // object-contain (não cover): mantém aspect ratio real do vídeo
            // sem cropar — letterbox/pillarbox dentro do container 16:9.
            className="absolute inset-0 w-full h-full object-contain"
            playsInline
            preload="auto"
          />
          {/* Hidden preview video for frame thumbnails.
              `preload="metadata"` avoids downloading the full file in
              parallel with the main player — bytes are only fetched
              on-demand when the user hovers the progress bar. */}
          <video
            ref={previewVideoRef}
            src={driveStreamUrl}
            className="hidden"
            preload="metadata"
            muted
            crossOrigin="anonymous"
          />
        </>
      )}

      {/* Loading spinner */}
      {!ready && (
        <div className="absolute inset-0 flex items-center justify-center z-10">
          <div className="w-12 h-12 border-[3px] border-[#E50914] border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {/* Intro overlay — black screen with Domiflix logo while the
          intro sound effect plays. Fades out smoothly when the intro
          ends, revealing the video with a clean fade-in.
          The `key={videoId}` forces a full remount on every episode
          change so the CSS animation restarts cleanly even when the
          previous overlay was still mid-transition. */}
      <div
        key={videoId}
        className={cn(
          "absolute inset-0 z-[40] bg-black flex items-center justify-center pointer-events-none transition-opacity duration-700 ease-out",
          introPlaying ? "opacity-100" : "opacity-0"
        )}
        style={{ visibility: introPlaying ? "visible" : "hidden", transitionProperty: "opacity, visibility", transitionDelay: introPlaying ? "0ms, 0ms" : "0ms, 700ms" }}
      >
        <img
          src={domiflixLogo}
          alt="Domiflix"
          className="h-16 md:h-20 object-contain domiflix-intro-logo"
          draggable={false}
        />
      </div>

      {/* Gradient overlays */}
      <div
        className={cn(
          "absolute inset-0 z-10 pointer-events-none transition-opacity duration-500",
          showHud ? "opacity-100" : "opacity-0"
        )}
      >
        <div className="absolute top-0 left-0 right-0 h-24 bg-gradient-to-b from-black/70 to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 h-48 bg-gradient-to-t from-black/85 via-black/40 to-transparent" />
      </div>

      {visibleSubtitle && (
        <div className="pointer-events-none absolute inset-x-4 bottom-[18%] z-[19] flex justify-center px-2 text-center sm:bottom-[15%]">
          <span className="whitespace-pre-line rounded-sm bg-black/85 px-2.5 py-1 text-sm font-medium leading-snug text-white shadow-sm sm:text-base">
            {visibleSubtitle}
          </span>
        </div>
      )}

      {/* ── HUD: Back button + episode title (top-left, inline) ── */}
      <div
        className={cn(
          "player-controls absolute top-0 left-0 right-0 z-20 px-3 pt-2 pb-3 md:px-6 md:pt-3 md:pb-4 transition-all duration-500",
          showHud ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-3 pointer-events-none"
        )}
      >
        {/* Mobile: back left, title centered (bold name + light sub) */}
        <div className="md:hidden relative flex items-center h-9">
          {!locked && <button
            onClick={onBack}
            className="absolute left-0 flex items-center text-white hover:text-white transition-colors shrink-0"
            aria-label="Voltar"
          >
            <ArrowLeft className="w-6 h-6" />
          </button>}
          <div
            className="mx-auto max-w-[72%] text-center text-white text-sm truncate px-10"
            style={{ fontFamily: '"Netflix Sans","Helvetica Neue",Helvetica,Arial,sans-serif' }}
          >
            <span className="font-bold">{titleName}</span>
            {titleSubLabel && (
              <span className="font-light text-white/60">{` · ${titleSubLabel}`}</span>
            )}
          </div>
        </div>

        {/* Desktop: original layout */}
        <div className="hidden md:flex items-center gap-4">
          {!locked && <button
            onClick={onBack}
            className="flex items-center text-white/80 hover:text-white transition-colors shrink-0"
            aria-label="Voltar"
          >
            <ArrowLeft className="w-6 h-6" />
          </button>}
          {(titleName || episodeName) && (
            <div
              className="max-w-[420px] animate-fade-in min-w-0"
              style={{ fontFamily: '"Netflix Sans","Helvetica Neue",Helvetica,Arial,sans-serif' }}
            >
              {titleName && (
                <div className="text-white font-bold text-base md:text-lg leading-tight drop-shadow-md truncate">
                  {titleName}
                </div>
              )}
              {(titleSubLabel || episodeName) && (
                <div className="text-white/80 text-xs md:text-sm leading-tight mt-0.5 drop-shadow-md truncate">
                  {(() => {
                    const compactSub = (titleSubLabel || "").replace(/Episódio\s+/i, "Ep. ");
                    if (compactSub && episodeName) return `${compactSub}: ${episodeName}`;
                    return compactSub || episodeName || "";
                  })()}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Episodes overlay (Netflix-style, above bottom bar) ── */}
      {titleData && titleData.type === "series" && onSelectEpisode && (
        <EpisodesOverlay
          open={showEpisodes && showHud}
          onClose={() => setShowEpisodes(false)}
          titleData={titleData}
          progress={progressItems}
          currentEpisodeId={currentEpisodeId}
          currentEpisodeProgressPct={playbackProgress}
          onSelectEpisode={(ep) => {
            setShowEpisodes(false);
            onSelectEpisode(ep);
          }}
        />
      )}

      {/* ── "Você está assistindo" overlay (after 5s paused without interaction) ── */}
      {showStillWatching && !playing && (
        <div
          className="absolute inset-0 z-30 animate-fade-in"
          style={{ fontFamily: '"Netflix Sans","Helvetica Neue",Helvetica,Arial,sans-serif' }}
          onMouseMove={resetHideTimer}
          onClick={(e) => {
            e.stopPropagation();
            resetHideTimer();
            togglePlay();
          }}
        >
          {/* Fundo preto cobrindo toda a tela */}
          <div className="absolute inset-0 pointer-events-none bg-black/80" />
          <div className="relative h-full">
            <div className="absolute top-1/2 left-8 sm:left-12 md:left-20 right-6 sm:right-auto -translate-y-1/2 max-w-[640px] text-white">
              <p className="text-sm md:text-base text-white/70 font-light mb-1">
                Você está assistindo:
              </p>
              {titleLogoUrl ? (
                <img
                  src={titleLogoUrl}
                  alt={titleName}
                  className="mb-2 max-w-[420px] md:max-w-[560px] max-h-[140px] md:max-h-[200px] object-contain object-left drop-shadow-2xl"
                />
              ) : (
                <h2 className="text-5xl md:text-7xl font-bold leading-none tracking-tight mb-6 drop-shadow-2xl">
                  {titleName}
                </h2>
              )}
              {episodeName && (
                <p className="text-lg md:text-xl font-semibold text-white mb-2 drop-shadow-lg">
                  {(() => {
                    const compactSub = (titleSubLabel || "").replace(/Episódio\s+/i, "Ep. ");
                    return compactSub ? `${compactSub}: ${episodeName}` : episodeName;
                  })()}
                </p>
              )}
              {episodeDescription && (
                <p className="text-sm md:text-base text-white/70 font-light leading-snug line-clamp-4 max-w-[560px] drop-shadow-lg">
                  {episodeDescription}
                </p>
              )}
            </div>
            <div className="absolute bottom-32 right-10 text-white/80 text-base md:text-lg font-light tracking-wide drop-shadow-lg">
              Pausado
            </div>
          </div>
        </div>
      )}

      {/* ── End-of-episode action buttons (last 10s) ── */}
      {showNextPreview && (() => {
        const remaining = Math.max(0, duration - currentTime);
        // 0 at 10s remaining → 1 at 0s remaining (fill left→right)
        const fillPct = Math.max(0, Math.min(1, (10 - remaining) / 10)) * 100;
        return (
          <div
            className={cn(
              "player-controls absolute z-30 transition-all duration-500",
              "right-4 md:right-10 bottom-32 md:bottom-36 flex items-center gap-3",
              "opacity-100 translate-y-0 pointer-events-auto"
            )}
          >
            {/* Voltar para o início */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                seekTo(0);
              }}
              className="px-5 py-2.5 rounded-sm bg-[#3A3A3A]/90 hover:bg-[#4A4A4A] text-white text-sm font-semibold transition-colors"
            >
              Voltar para o início
            </button>

            {/* Próximo episódio com preenchimento esquerda → direita */}
            {nextEpisode && onEnded && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onEnded();
                }}
                className="relative overflow-hidden rounded-sm border border-white/30 text-sm font-semibold"
              >
                {/* Camada de fundo (cinza claro) */}
                <span className="absolute inset-0 bg-white/30" />
                {/* Camada de preenchimento (branca) */}
                <span
                  className="absolute inset-y-0 left-0 bg-white transition-[width] duration-200 ease-linear"
                  style={{ width: `${fillPct}%` }}
                />
                {/* Conteúdo */}
                <span className="relative flex items-center gap-2 px-5 py-2.5 text-black">
                  <PlayIcon className="w-4 h-4" />
                  Próxima aula
                </span>
              </button>
            )}
          </div>
        );
      })()}

      {/* ── HUD Bottom ── */}
      <div
        className={cn(
          "player-controls absolute bottom-0 left-0 right-0 z-20 transition-all duration-500",
          showHud ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3 pointer-events-none"
        )}
      >
        {/* Progress bar with hover preview */}
        <div className="px-4 md:px-10 relative">
          <div className="flex items-center gap-3">
            <div
              className={cn("group relative flex-1 h-[6px] bg-white/25 rounded-full transition-all", locked ? "cursor-default" : "cursor-pointer hover:h-[8px]")}
              onMouseMove={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                setHoverPct(pct);
                setHoverTime(pct * duration);
              }}
              onMouseLeave={() => setHoverPct(null)}
              onMouseDown={(e) => {
                if (locked) return;
                setSeeking(true);
                const rect = e.currentTarget.getBoundingClientRect();
                const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                seekTo(pct * duration);
                const onMove = (ev: MouseEvent) => {
                  const p = Math.max(0, Math.min(1, (ev.clientX - rect.left) / rect.width));
                  seekTo(p * duration);
                };
                const onUp = () => {
                  setSeeking(false);
                  window.removeEventListener("mousemove", onMove);
                  window.removeEventListener("mouseup", onUp);
                };
                window.addEventListener("mousemove", onMove);
                window.addEventListener("mouseup", onUp);
              }}
            >
              <div
                className="absolute inset-y-0 left-0 bg-[#E50914] rounded-full"
                  style={{
                    width: `${playbackProgress}%`,
                    transition: seeking ? "none" : "width 150ms linear",
                  }}
              />
              {/* Scrubber dot — always visible, grows on hover */}
              <div
                className="absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 group-hover:w-4 group-hover:h-4 bg-[#E50914] rounded-full shadow-[0_0_8px_rgba(229,9,20,0.6)]"
                  style={{
                    left: `${playbackProgress}%`,
                    marginLeft: "-7px",
                    transition: seeking ? "none" : "left 150ms linear, width 150ms, height 150ms",
                  }}
              />

              {/* Hover preview tooltip */}
              {hoverPct !== null && duration > 0 && (
                <div
                  className="absolute bottom-full mb-2 -translate-x-1/2 pointer-events-none"
                  style={{ left: `${hoverPct * 100}%` }}
                >
                  {isDrive && (
                    <div className="bg-black/90 rounded overflow-hidden border border-white/10 mb-1">
                      <canvas
                        ref={previewCanvasRef}
                        width={160}
                        height={90}
                        className="block w-[160px] h-[90px] bg-[#181818]"
                      />
                    </div>
                  )}
                  <div
                    className="text-center text-white text-xs tabular-nums bg-black/80 px-2 py-0.5 rounded"
                    style={{ fontFamily: '"Netflix Sans","Helvetica Neue",Helvetica,Arial,sans-serif' }}
                  >
                    {fmt(hoverTime)}
                  </div>
                </div>
              )}
            </div>
            <span
              className="text-white/60 text-[11px] tabular-nums shrink-0 w-[52px] text-right"
              style={{ fontFamily: '"Netflix Sans","Helvetica Neue",Helvetica,Arial,sans-serif' }}
            >
              {fmt(duration - currentTime)}
            </span>
          </div>
        </div>

        {/* Controls row */}
        <div className="hidden md:flex items-center justify-between px-4 md:px-10 pb-4 md:pb-6 pt-2">
          {/* Left controls */}
          <div className="flex items-center gap-1 md:gap-3">
            <button
              onClick={togglePlay}
              className="text-white hover:scale-110 transition-transform p-1"
            >
              {playing ? (
                <PauseIcon className="w-7 h-7 md:w-8 md:h-8" />
              ) : (
                <PlayIcon className="w-7 h-7 md:w-8 md:h-8" />
              )}
            </button>

            {!locked && <button
              onClick={() => skip(-10)}
              className="text-white hover:scale-110 transition-transform p-1 hidden sm:block"
            >
              <SkipBack10Icon className="w-7 h-7 md:w-8 md:h-8" />
            </button>}

            {!locked && <button
              onClick={() => skip(10)}
              className="text-white hover:scale-110 transition-transform p-1 hidden sm:block"
            >
              <SkipForward10Icon className="w-7 h-7 md:w-8 md:h-8" />
            </button>}

            {/* Volume */}
            <div
              className="relative flex items-center"
              onMouseEnter={() => {
                clearTimeout(volumeTimer.current);
                setShowVolume(true);
              }}
              onMouseLeave={() => {
                volumeTimer.current = setTimeout(() => setShowVolume(false), 300);
              }}
            >
              <button
                onClick={toggleMute}
                className="text-white hover:scale-110 transition-transform p-1"
              >
                <VolumeIcon className="w-6 h-6 md:w-7 md:h-7" />
              </button>

              <div
                className={cn(
                  "absolute bottom-full left-1/2 -translate-x-1/2 mb-2 bg-[#181818] rounded-md px-3 py-4 flex flex-col items-center transition-all border border-white/10",
                  showVolume ? "opacity-100 scale-100" : "opacity-0 scale-95 pointer-events-none"
                )}
              >
                <div
                  className="relative w-[10px] h-24 bg-white/25 rounded-sm cursor-pointer"
                  onMouseDown={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    const pct =
                      1 - Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
                    handleVolumeChange(Math.round(pct * 100));
                    const onMove = (ev: MouseEvent) => {
                      const p =
                        1 - Math.max(0, Math.min(1, (ev.clientY - rect.top) / rect.height));
                      handleVolumeChange(Math.round(p * 100));
                    };
                    const onUp = () => {
                      window.removeEventListener("mousemove", onMove);
                      window.removeEventListener("mouseup", onUp);
                    };
                    window.addEventListener("mousemove", onMove);
                    window.addEventListener("mouseup", onUp);
                  }}
                >
                  <div
                    className="absolute bottom-0 left-0 right-0 bg-[#E50914] rounded-sm"
                    style={{ height: `${muted ? 0 : volume}%` }}
                  />
                  <div
                    className="absolute left-1/2 -translate-x-1/2 w-3 h-3 bg-[#E50914] rounded-full shadow"
                    style={{ bottom: `${muted ? 0 : volume}%`, marginBottom: "-6px" }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Center: Title */}
          <div className="hidden md:flex items-center min-w-0 mx-4 gap-2">
            <span className="text-white font-bold text-sm truncate max-w-[280px]">
              {titleName}
            </span>
            <span className="text-white/60 text-sm font-light truncate max-w-[200px]">
              {titleSubLabel}
            </span>
          </div>

          {/* Right controls */}
          <div className="flex items-center gap-1 md:gap-3">
            {/* Next episode button with hover preview */}
            {nextEpisode && onPlayNext && (
              <div className="order-2">
              <NextEpisodeButton
                nextEpisode={nextEpisode}
                onPlayNext={onPlayNext}
                titleData={titleData}
              />
              </div>
            )}

            {titleData && titleData.type === "series" && onSelectEpisode && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowSpeed(false);
                  setShowEpisodes((v) => !v);
                }}
                className={cn(
                  "order-3",
                  "text-white hover:scale-110 transition-transform p-1",
                  showEpisodes && "text-[#E50914]"
                )}
                title="Episódios"
              >
                <EpisodesListIcon className="w-8 h-7 md:w-9 md:h-8" />
              </button>
            )}

            {/* Playback speed */}
            {onChangePlaybackSpeed && (
              <div className="order-3">
              <SpeedButton
                speed={playbackSpeed}
                onChange={onChangePlaybackSpeed}
                open={showSpeed}
                onOpenChange={(o) => {
                  if (o) setShowEpisodes(false);
                  setShowSpeed(o);
                }}
              />
              </div>
            )}

            {subtitles.length > 0 && (
              <div className="relative order-1">
                <button
                  onClick={(event) => { event.stopPropagation(); setShowSubtitleMenu((open) => !open); }}
                  className={cn("rounded-sm p-1 text-white transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white motion-reduce:transform-none motion-reduce:transition-none", activeSubtitleId && "text-red-500")}
                  title="Legendas"
                  aria-label="Selecionar legenda"
                >
                  <Subtitles className="h-7 w-7" />
                </button>
                {showSubtitleMenu && (
                  <div className="absolute bottom-full right-0 mb-3 min-w-48 overflow-hidden rounded-md border border-white/10 bg-[#181818] py-1 shadow-2xl">
                    <button onClick={(event) => { event.stopPropagation(); setActiveSubtitleId(null); setShowSubtitleMenu(false); }} className="block w-full px-3 py-2 text-left text-xs text-stone-400 hover:bg-white/[0.06] hover:text-white">Desligada</button>
                    {subtitles.map((subtitle) => (
                      <button key={subtitle.id} onClick={(event) => { event.stopPropagation(); setActiveSubtitleId(subtitle.id); setShowSubtitleMenu(false); }} className={cn("block w-full px-3 py-2 text-left text-xs hover:bg-white/[0.06]", activeSubtitleId === subtitle.id ? "text-red-400" : "text-stone-300")}>
                        {subtitle.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            <button
              onClick={toggleFullscreen}
              className="order-4 rounded-sm p-1 text-white transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white motion-reduce:transform-none motion-reduce:transition-none"
              aria-label={isFullscreen ? "Sair da tela cheia" : "Abrir em tela cheia"}
            >
              {isFullscreen ? (
                <MinimizeIcon className="w-7 h-7 md:w-8 md:h-8" />
              ) : (
                <FullscreenIcon className="w-7 h-7 md:w-8 md:h-8" />
              )}
            </button>
          </div>
        </div>

        {/* ── Mobile bottom controls row (Netflix-style) ── */}
        {/* `pointer-events-auto` força a barra a receber toque mesmo se outro
            overlay (ex: cluster central de play/pause) estiver na frente em
            stacking order. Sem isso, em alguns devices o toque "vazava" pro
            overlay de baixo e os botões viravam inertes no celular. */}
        <div className="md:hidden flex items-center justify-center gap-8 sm:gap-10 pt-2 pb-3 text-white relative z-10 pointer-events-auto">
          {subtitles.length > 0 && (
            <div className="relative order-3">
              <button onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); setShowSubtitleMenu((open) => !open); }} className={cn("flex min-h-11 min-w-11 flex-col items-center justify-center gap-0.5 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white", activeSubtitleId && "text-red-500")} aria-label="Selecionar legenda">
                <Subtitles className="h-7 w-7" />
                <span className="max-w-24 truncate text-[10px] font-light">{activeSubtitle?.label ?? "Legendas"}</span>
              </button>
              {showSubtitleMenu && (
                <div className="absolute bottom-full left-1/2 mb-3 min-w-48 -translate-x-1/2 overflow-hidden rounded-sm border border-white/10 bg-[#181818] py-1 shadow-2xl">
                  <button onClick={(event) => { event.stopPropagation(); setActiveSubtitleId(null); setShowSubtitleMenu(false); }} className="block w-full px-3 py-2 text-left text-xs text-stone-400 hover:bg-white/[0.06] hover:text-white">Desligada</button>
                  {subtitles.map((subtitle) => <button key={subtitle.id} onClick={(event) => { event.stopPropagation(); setActiveSubtitleId(subtitle.id); setShowSubtitleMenu(false); }} className={cn("block w-full px-3 py-2 text-left text-xs", activeSubtitleId === subtitle.id ? "bg-white/[0.05] text-red-400" : "text-stone-300")}>{subtitle.label}</button>)}
                </div>
              )}
            </div>
          )}
          {onChangePlaybackSpeed && (
            <button
              onPointerDown={(e) => { e.stopPropagation(); }}
              onClick={(e) => {
                e.stopPropagation();
                setShowEpisodes(false);
                setShowSpeed((v) => !v);
              }}
              className="order-1 flex min-h-11 min-w-11 flex-col items-center justify-center gap-0.5 rounded-sm pointer-events-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
              aria-label={`Velocidade de reprodução: ${playbackSpeed}x`}
            >
              <SpeedIcon className="w-7 h-7" />
              <span className="text-[10px] font-light">Velocidade ({playbackSpeed}x)</span>
            </button>
          )}

          {titleData && titleData.type === "series" && onSelectEpisode && (
            <button
              onPointerDown={(e) => { e.stopPropagation(); }}
              onClick={(e) => {
                e.stopPropagation();
                setShowSpeed(false);
                setShowEpisodes((v) => !v);
              }}
              className={cn(
                "order-2 flex min-h-11 min-w-11 flex-col items-center justify-center gap-0.5 rounded-sm pointer-events-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white",
                showEpisodes && "text-[#E50914]"
              )}
              aria-label="Abrir lista de aulas"
            >
              <EpisodesListIcon className="w-7 h-7" />
              <span className="text-[10px] font-light">Episódios</span>
            </button>
          )}

          {nextEpisode && onPlayNext && (
            <button
              onPointerDown={(e) => { e.stopPropagation(); }}
              onClick={(e) => {
                e.stopPropagation();
                onPlayNext();
              }}
              className="order-4 flex min-h-11 min-w-11 flex-col items-center justify-center gap-0.5 rounded-sm pointer-events-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
              aria-label="Reproduzir próxima aula"
            >
              <NextEpisodeIcon className="w-7 h-7" />
              <span className="text-[10px] font-light">Próxima aula</span>
            </button>
          )}
        </div>
      </div>

      {/* ── Mobile center cluster: skip-back / play-pause / skip-forward ── */}
      {ready && showHud && !showEpisodes && (
        <div className="player-controls md:hidden absolute inset-0 z-20 flex items-center justify-center gap-10 pointer-events-none">
          {!locked && <button
            onPointerDown={(e) => { e.stopPropagation(); }}
            onClick={(e) => { e.stopPropagation(); skip(-10); }}
            className="pointer-events-auto text-white p-3 -m-1"
            aria-label="Voltar 10 segundos"
          >
            <SkipBack10Icon className="w-10 h-10" />
          </button>}
          <button
            onPointerDown={(e) => { e.stopPropagation(); }}
            onClick={(e) => { e.stopPropagation(); togglePlay(); }}
            className="pointer-events-auto w-16 h-16 flex items-center justify-center text-white"
            aria-label={playing ? "Pausar" : "Reproduzir"}
          >
            {playing ? (
              <PauseIcon className="w-12 h-12" />
            ) : (
              <PlayIcon className="w-12 h-12 ml-1" />
            )}
          </button>
          {!locked && <button
            onPointerDown={(e) => { e.stopPropagation(); }}
            onClick={(e) => { e.stopPropagation(); skip(10); }}
            className="pointer-events-auto text-white p-3 -m-1"
            aria-label="Avançar 10 segundos"
          >
            <SkipForward10Icon className="w-10 h-10" />
          </button>}
        </div>
      )}

      {/* Center play button when paused (desktop only) */}
      {ready && !playing && showHud && !showEpisodes && (
        <div className="hidden md:flex absolute inset-0 z-15 items-center justify-center pointer-events-none">
          <div className="w-20 h-20 bg-black/40 backdrop-blur-sm rounded-full items-center justify-center flex">
            <PlayIcon className="w-10 h-10 text-white ml-1" />
          </div>
        </div>
      )}

      {/* Locked HUD: floating unlock button (mobile) */}
      {hudLocked && (
        <button
          onClick={(e) => { e.stopPropagation(); setHudLocked(false); }}
          className="md:hidden absolute z-30 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-14 h-14 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center text-white pointer-events-auto"
          aria-label="Desbloquear"
        >
          <Lock className="w-6 h-6" />
        </button>
      )}
    </div>
  );
}

// ─── Episodes Overlay (Netflix-style, sits above bottom bar) ─────────────────
function EpisodesOverlay({
  open,
  onClose,
  titleData,
  progress,
  currentEpisodeId,
  currentEpisodeProgressPct,
  onSelectEpisode,
}: {
  open: boolean;
  onClose: () => void;
  titleData: DomiflixTitleFull;
  progress: DomiflixProgress[];
  currentEpisodeId?: string;
  currentEpisodeProgressPct: number;
  onSelectEpisode: (ep: DomiflixEpisode) => void;
}) {
  const seasons = titleData.type === "series" ? titleData.seasons : [];
  const progressByEpisode = useMemo(
    () => new Map(progress.map((item) => [item.episode_id, item])),
    [progress]
  );

  // Track open state per season — current season open by default
  const initialOpen = useMemo(() => {
    const set = new Set<string>();
    const currentSeason = seasons.find((s) =>
      s.episodes.some((e) => e.id === currentEpisodeId)
    );
    if (currentSeason) set.add(currentSeason.id);
    else if (seasons[0]) set.add(seasons[0].id);
    return set;
  }, [titleData, currentEpisodeId]);

  const [openSeasons, setOpenSeasons] = useState<Set<string>>(initialOpen);
  const [expandedEpisodeId, setExpandedEpisodeId] = useState<string | null>(
    currentEpisodeId ?? null
  );
  const currentRowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setOpenSeasons(new Set(initialOpen));
    setExpandedEpisodeId(currentEpisodeId ?? null);
  }, [initialOpen, currentEpisodeId, open]);

  // Auto-scroll to current episode when overlay opens
  useEffect(() => {
    if (open && currentRowRef.current) {
      setTimeout(() => {
        currentRowRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
      }, 100);
    }
  }, [open]);

  const toggleSeason = (id: string) => {
    setOpenSeasons((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const getEpisodeProgressPct = useCallback(
    (episodeId: string) => {
      const saved = progressByEpisode.get(episodeId);
      const savedPct = saved
        ? saved.completed
          ? 100
          : saved.duration_seconds > 0
            ? Math.min(100, (saved.progress_seconds / saved.duration_seconds) * 100)
            : 0
        : 0;

      if (episodeId === currentEpisodeId && currentEpisodeProgressPct > 0) {
        return currentEpisodeProgressPct;
      }

      return savedPct;
    },
    [currentEpisodeId, currentEpisodeProgressPct, progressByEpisode]
  );

  return (
    <div className="episodes-overlay absolute inset-0 z-30 pointer-events-none flex items-center justify-center md:items-end md:justify-end px-3 md:px-10 pb-4 md:pb-28">
      <div
        className={cn(
          "w-full max-w-[420px] md:max-w-[640px] max-h-[80vh] md:max-h-[560px] flex flex-col pointer-events-auto",
          "bg-[#141414]/95 backdrop-blur-md rounded-md border border-white/10 shadow-2xl transition-all duration-300",
          open ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4 pointer-events-none"
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-4 md:px-5 py-2.5 md:py-3.5 border-b border-white/10 flex items-center justify-between shrink-0">
          <h3 className="text-white text-sm md:text-lg font-semibold truncate">{titleData.title}</h3>
          <button
            onClick={onClose}
            className="text-white/60 hover:text-white text-xs"
            aria-label="Fechar"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto py-1">
          {seasons.map((season) => {
            const seasonOpen = openSeasons.has(season.id);
            return (
              <div key={season.id}>
                <button
                  onClick={() => toggleSeason(season.id)}
                  className="w-full flex items-center justify-between px-5 py-4 bg-white/[0.04] hover:bg-white/[0.07] transition-colors"
                >
                  <span className="text-white text-base font-light uppercase tracking-[0.18em]">
                    Temporada {season.season_number}
                  </span>
                  <div className="flex items-center gap-3">
                    <span className="text-white/50 text-xs uppercase tracking-wider font-light">
                      {season.episodes.length} {season.episodes.length === 1 ? "Episódio" : "Episódios"}
                    </span>
                    <ChevronDown
                      className={cn(
                        "w-4 h-4 text-white/60 transition-transform",
                        seasonOpen && "rotate-180"
                      )}
                    />
                  </div>
                </button>

                {seasonOpen && (
                  <div>
                    {season.episodes.map((ep, eIdx) => {
                      const isCurrent = ep.id === currentEpisodeId;
                      const isExpanded = expandedEpisodeId === ep.id;
                      const displayEpisodeNumber = ep.episode_number ?? eIdx + 1;
                      const episodeProgressPct = getEpisodeProgressPct(ep.id);
                      const hasCustomTitle =
                        !!ep.title && !/^episode\s+\d+$/i.test(ep.title) && !/^epis[oó]dio\s+\d+$/i.test(ep.title);

                      return (
                        <div
                          key={ep.id}
                          ref={isCurrent ? currentRowRef : undefined}
                          className={cn(
                            "border-b border-white/5 transition-colors",
                            isCurrent && "ring-1 ring-white/40"
                          )}
                        >
                          <button
                            onClick={() => setExpandedEpisodeId(isExpanded ? null : ep.id)}
                            className="w-full flex items-center gap-4 pl-10 pr-5 py-3 text-left hover:bg-white/5 transition-colors"
                          >
                            <span className="text-white font-bold text-sm w-6 shrink-0">
                              {displayEpisodeNumber}
                            </span>
                            <div className="flex-1 min-w-0">
                              <span className="text-white font-bold text-sm block truncate">
                                Episódio {displayEpisodeNumber}
                              </span>
                            </div>
                            {episodeProgressPct >= 90 && (
                              <Check
                                className="w-4 h-4 text-[#E50914] shrink-0"
                                strokeWidth={3}
                                aria-label="Assistido"
                              />
                            )}
                            {episodeProgressPct > 0 && episodeProgressPct < 90 && (
                              <div className="relative h-[3px] w-12 rounded-full bg-white/20 overflow-hidden shrink-0">
                                <div
                                  className="absolute inset-y-0 left-0 bg-[#E50914] rounded-full transition-all"
                                  style={{ width: `${episodeProgressPct}%` }}
                                />
                              </div>
                            )}
                          </button>

                          {isExpanded && (
                            <div className="pl-10 pr-5 pb-4 flex gap-4">
                              <button
                                onClick={() => onSelectEpisode(ep)}
                                className="shrink-0 group"
                              >
                                {(() => {
                                  const titleFallback = titleData?.banner_url || titleData?.thumbnail_url || null;
                                  const thumbSrc = ep.thumbnail_url
                                    ? ep.thumbnail_url
                                    : ep.video_type === "youtube" && ep.video_id
                                      ? getYouTubeThumbnail(ep.video_id)
                                      : titleFallback;
                                  return thumbSrc ? (
                                    <img
                                      src={thumbSrc}
                                      alt={ep.title}
                                      loading="lazy"
                                      className="w-44 h-24 object-cover rounded group-hover:opacity-80 transition-opacity"
                                    />
                                  ) : (
                                    <div className="w-44 h-24 bg-white/10 rounded" />
                                  );
                                })()}
                              </button>
                              <div className="flex-1 min-w-0">
                                <p className="text-white text-sm font-medium mb-1">
                                  {ep.title || `Episódio ${displayEpisodeNumber}`}
                                </p>
                                <p className="text-white/80 text-sm leading-snug line-clamp-4">
                                  {ep.description || "Sem descrição."}
                                </p>
                                {ep.duration_minutes ? (
                                  <p className="text-[#E50914] text-[11px] font-semibold mt-1">
                                    {ep.duration_minutes} min
                                  </p>
                                ) : null}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
// ─── Next Episode Button (with hover preview card) ───────────────────────────
function NextEpisodeButton({
  nextEpisode,
  onPlayNext,
  titleData,
}: {
  nextEpisode: DomiflixEpisode;
  onPlayNext: () => void;
  titleData?: DomiflixTitleFull | null;
}) {
  const [open, setOpen] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout>>();

  const show = () => {
    clearTimeout(closeTimer.current);
    setOpen(true);
  };
  const hide = () => {
    closeTimer.current = setTimeout(() => setOpen(false), 150);
  };

  return (
    <div className="relative" onMouseEnter={show} onMouseLeave={hide}>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onPlayNext();
        }}
        className="text-white hover:scale-110 transition-transform p-1"
        title="Próxima aula"
      >
        <NextEpisodeIcon className="w-7 h-7 md:w-8 md:h-8" />
      </button>

      <div
        className={cn(
          "absolute bottom-full right-0 mb-3 w-[400px] max-w-[80vw]",
          "bg-[#181818] rounded-md overflow-hidden border border-white/10 shadow-2xl",
          "transition-all duration-200",
          open ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2 pointer-events-none"
        )}
      >
        <div className="px-4 py-2.5 bg-black/40 border-b border-white/5">
          <span className="text-white font-semibold text-sm">Próxima aula</span>
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onPlayNext();
          }}
          className="w-full text-left flex gap-3 p-3 hover:bg-white/5 transition-colors"
        >
          {(() => {
            const titleFallback = titleData?.banner_url || titleData?.thumbnail_url || null;
            const src = nextEpisode.thumbnail_url || titleFallback;
            return src ? (
              <img
                src={src}
                alt={nextEpisode.title}
                className="w-32 h-20 object-cover rounded shrink-0"
              />
            ) : (
              <div className="w-32 h-20 bg-white/10 rounded shrink-0" />
            );
          })()}
          <div className="flex-1 min-w-0">
            <p className="text-white text-sm font-bold mb-1 truncate">
              {nextEpisode.episode_number ?? ""}
              {nextEpisode.episode_number ? "  " : ""}
              {nextEpisode.title || "Próxima aula"}
            </p>
            {nextEpisode.description && (
              <p className="text-white/70 text-xs leading-snug line-clamp-3">
                {nextEpisode.description}
              </p>
            )}
          </div>
        </button>
      </div>
    </div>
  );
}

// ─── Playback Speed Button ───────────────────────────────────────────────────
function SpeedButton({
  speed,
  onChange,
  open,
  onOpenChange,
}: {
  speed: number;
  onChange: (s: number) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Click-outside to close
  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onOpenChange(false);
      }
    };
    // Defer attaching to avoid immediate close on the same click that opens it
    const id = setTimeout(() => {
      document.addEventListener("mousedown", handleClickOutside);
    }, 0);
    return () => {
      clearTimeout(id);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [open, onOpenChange]);

  return (
    <div className="relative" ref={containerRef}>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onOpenChange(!open);
        }}
        className={cn(
          "text-white hover:scale-110 transition-transform p-1",
          open && "text-[#E50914]"
        )}
        title="Velocidade"
      >
        <SpeedIcon className="w-7 h-7 md:w-8 md:h-8" />
      </button>

      <div
        className={cn(
          // Same vertical offset as the episodes overlay so it sits above the progress bar
          "absolute bottom-[calc(100%+72px)] right-0 w-[480px] max-w-[80vw]",
          "bg-[#181818] rounded-md border border-white/10 shadow-2xl",
          "transition-all duration-200",
          open ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2 pointer-events-none"
        )}
      >
        <div className="px-7 pt-5 pb-2">
          <p className="text-white font-bold text-sm">Velocidade</p>
        </div>
        {/* Speed selector — grid layout keeps every dot inside its own
            column so labels never overflow the panel. The line spans
            from the centre of the 1st column to the centre of the last
            (10% → 90% of the rail width) and stays vertically aligned
            with the dots because both share the same fixed-height row. */}
        <div className="px-6 pt-6 pb-10">
          <div
            className="grid items-center"
            style={{ gridTemplateColumns: `repeat(${PLAYBACK_SPEEDS.length}, minmax(0, 1fr))` }}
          >
            {/* Rail line — full row, behind the dots, vertically centered */}
            <div className="col-span-full row-start-1 relative h-10 pointer-events-none">
              <div
                className="absolute top-1/2 -translate-y-1/2 h-[2px] bg-white/30 rounded-full"
                style={{ left: `${50 / PLAYBACK_SPEEDS.length}%`, right: `${50 / PLAYBACK_SPEEDS.length}%` }}
              />
            </div>

            {/* Dots — each in its own grid cell, perfectly centered */}
            {PLAYBACK_SPEEDS.map((s, i) => {
              const active = Math.abs(s - speed) < 0.01;
              return (
                <button
                  key={s}
                  onClick={(e) => {
                    e.stopPropagation();
                    onChange(s);
                  }}
                  style={{ gridColumnStart: i + 1, gridRowStart: 1 }}
                  className="group relative z-10 mx-auto flex items-center justify-center w-14 h-10 rounded-md hover:bg-white/10 transition-colors"
                >
                  <span
                    className={cn(
                      "block rounded-full transition-all",
                      active
                        ? "w-3.5 h-3.5 bg-white ring-2 ring-white/40"
                        : "w-2.5 h-2.5 bg-white/70 group-hover:bg-white"
                    )}
                  />
                  <span
                    className={cn(
                      "absolute top-full mt-2 whitespace-nowrap text-xs",
                      active ? "text-white font-bold" : "text-white/60 group-hover:text-white"
                    )}
                  >
                    {s === 1 ? "1x (Padrão)" : `${s}x`}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
