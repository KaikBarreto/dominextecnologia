import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, ChevronDown, Check, Gauge, Lock, List, Subtitles, SkipForward } from "lucide-react";

import {
  useDomiflixTitleBySlug,
  useDomiflixTitle,
  useDomiflixProgress,
  useMarkEpisodeWatched,
  DomiflixEpisode,
  DomiflixProgress,
  DomiflixTitleFull,
} from "@/hooks/useDomiflix";
import {
  useDomiflixPreferences,
  useUpdatePlaybackSpeed,
  PLAYBACK_SPEEDS,
} from "@/hooks/useDomiflixPreferences";
import { supabase } from "@/integrations/supabase/client";
import { getDriveStreamUrl } from "@/lib/drive";
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
import domiflixLogo from "@/assets/logo-white-horizontal.png";
import { playDomiflixIntro, stopDomiflixIntro } from "@/lib/domiflixIntroSound";

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

type ProgressPayload = Pick<
  DomiflixProgress,
  | "user_id"
  | "episode_id"
  | "title_id"
  | "completed"
  | "watched_at"
  | "progress_seconds"
  | "duration_seconds"
>;

// ─── Player Page ─────────────────────────────────────────────────────────────

export default function DomiflixWatchPage() {
  const { titleSlug, episodeNumber, startSeconds } = useParams<{
    titleSlug: string;
    episodeNumber: string;
    startSeconds?: string;
  }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: resolvedTitleId } = useDomiflixTitleBySlug(titleSlug);
  const { data: titleData } = useDomiflixTitle(resolvedTitleId ?? undefined);
  const { data: progress = [] } = useDomiflixProgress();
  const { data: prefs } = useDomiflixPreferences();
  const updateSpeed = useUpdatePlaybackSpeed();
  const markWatched = useMarkEpisodeWatched();
  const markedRef = useRef(false);

  const allEpisodes: DomiflixEpisode[] = useMemo(() => {
    if (!titleData) return [];
    return titleData.type === "series"
      ? titleData.seasons.flatMap((s) => s.episodes)
      : titleData.episodes;
  }, [titleData]);

  const epNum = parseInt(episodeNumber ?? "1", 10);
  const episodeIndex = Math.max(0, epNum - 1);
  const episode = allEpisodes[episodeIndex];
  const nextEpisode = allEpisodes[episodeIndex + 1];

  const seasonInfo =
    titleData?.type === "series" && episode
      ? titleData.seasons.find((s) => s.episodes.some((e) => e.id === episode.id))
      : null;
  const episodeNumberInSeason =
    seasonInfo && episode
      ? seasonInfo.episodes.findIndex((e) => e.id === episode.id) + 1
      : epNum;

  const progressSecondsRef = useRef(0);
  const durationSecondsRef = useRef(0);
  const userIdRef = useRef<string | null>(null);
  const accessTokenRef = useRef<string | null>(null);

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

  const buildProgressPayload = useCallback((): ProgressPayload | null => {
    const userId = userIdRef.current;
    const epId = episode?.id;
    const titleId = resolvedTitleId;
    if (!userId || !epId || !titleId) return null;

    const rawProgress = Math.round(progressSecondsRef.current);
    const rawDuration = Math.round(durationSecondsRef.current);
    const duration = Math.max(0, rawDuration);
    const progressSeconds = duration > 0 ? Math.min(rawProgress, duration) : rawProgress;
    if (progressSeconds <= 1) return null;

    return {
      user_id: userId,
      episode_id: epId,
      title_id: titleId,
      completed: duration > 0 ? progressSeconds / duration > 0.9 : false,
      watched_at: new Date().toISOString(),
      progress_seconds: progressSeconds,
      duration_seconds: duration,
    };
  }, [episode?.id, resolvedTitleId]);

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
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
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

  const saveProgressAsync = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    userIdRef.current = data.session?.user.id ?? null;
    accessTokenRef.current = data.session?.access_token ?? null;

    const payload = buildProgressPayload();
    if (!payload) return;

    const { error } = await supabase
      .from("domiflix_user_progress")
      .upsert(payload, { onConflict: "user_id,episode_id" });

    if (error) throw error;
    queryClient.invalidateQueries({ queryKey: ["domiflix-progress"] });
  }, [buildProgressPayload, queryClient]);

  useEffect(() => {
    if (!markedRef.current && episode?.video_id && resolvedTitleId) {
      markedRef.current = true;
      markWatched.mutate({
        episodeId: episode.id,
        titleId: resolvedTitleId,
        completed: false,
        progressSeconds: 0,
        durationSeconds: 0,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [episode?.id, resolvedTitleId]);

  useEffect(() => {
    const interval = setInterval(() => {
      saveProgressAsync().catch(() => {});
    }, 20000);
    return () => clearInterval(interval);
  }, [saveProgressAsync]);

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

  useEffect(() => {
    return () => {
      saveProgressKeepalive();
    };
  }, [saveProgressKeepalive]);

  useEffect(() => {
    markedRef.current = false;
  }, [episodeIndex]);

  const handleBack = useCallback(async () => {
    try {
      await saveProgressAsync();
    } catch {
      saveProgressKeepalive();
    }
    if (titleSlug) {
      navigate(`/domiflix/${titleSlug}`);
    } else {
      navigate("/domiflix");
    }
  }, [navigate, saveProgressAsync, saveProgressKeepalive, titleSlug]);

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
    const startAt = resumeSecondsFor(nextEpisode.id);
    const path = `/domiflix/assistir/${titleSlug}/${epNum + 1}${startAt > 0 ? `/${startAt}` : ""}`;
    navigate(path, { replace: true });
  }, [
    nextEpisode,
    titleSlug,
    epNum,
    navigate,
    resumeSecondsFor,
    saveProgressAsync,
    saveProgressKeepalive,
  ]);

  const handleVideoEnded = useCallback(async () => {
    if (nextEpisode) {
      await goToNextEpisode();
      return;
    }
    try {
      await saveProgressAsync();
    } catch {
      saveProgressKeepalive();
    }
    navigate("/domiflix", { replace: true });
  }, [nextEpisode, goToNextEpisode, navigate, saveProgressAsync, saveProgressKeepalive]);

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
        const path = `/domiflix/assistir/${titleSlug}/${idx + 1}${startAt > 0 ? `/${startAt}` : ""}`;
        navigate(path, { replace: true });
      }
    },
    [allEpisodes, titleSlug, navigate, resumeSecondsFor, saveProgressAsync, saveProgressKeepalive]
  );

  if (!episode) {
    return (
      <div className="fixed inset-0 z-[100] bg-black flex items-center justify-center text-white/50">
        <div className="text-center">
          <div className="w-10 h-10 border-[3px] border-[#E50914] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-sm mb-4">Carregando...</p>
          <button
            onClick={() => navigate(-1)}
            className="text-xs text-white/30 hover:text-white underline"
          >
            Voltar
          </button>
        </div>
      </div>
    );
  }

  const titleName = titleData?.title ?? "";
  const titleSubLabel = (() => {
    const parts: string[] = [];
    if (seasonInfo) parts.push(`T${seasonInfo.season_number}`);
    parts.push(`Episódio ${episodeNumberInSeason}`);
    return parts.join(" ");
  })();

  const startSec = startSeconds ? Math.max(0, parseInt(startSeconds, 10) || 0) : 0;

  return (
    <div className="domiflix-player-root fixed inset-0 z-[100] bg-black">
      {episode.video_id ? (
        <NetflixPlayer
          videoId={episode.video_id}
          videoType={(episode.video_type as "youtube" | "drive") ?? "youtube"}
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
          onSelectEpisode={navigateToEpisode}
        />
      ) : (
        <div className="flex flex-col items-center justify-center h-full text-white/50 gap-4">
          <p className="text-lg">Vídeo não disponível</p>
          <button
            onClick={handleBack}
            className="text-sm text-white/40 hover:text-white underline"
          >
            Voltar
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Netflix-style Player ────────────────────────────────────────────────────

interface NetflixPlayerProps {
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
}

function NetflixPlayer({
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
}: NetflixPlayerProps) {
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

  useEffect(() => {
    setReady(false);
    setCurrentTime(0);
    setDuration(0);
    setSeeking(false);
  }, [videoId]);

  const [introPlaying, setIntroPlaying] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showVolume, setShowVolume] = useState(false);
  const [showEpisodes, setShowEpisodes] = useState(false);
  const [showSpeed, setShowSpeed] = useState(false);
  const [showNextPreview, setShowNextPreview] = useState(false);
  const [showStillWatching, setShowStillWatching] = useState(false);
  const stillWatchingTimer = useRef<ReturnType<typeof setTimeout>>();

  const [hoverPct, setHoverPct] = useState<number | null>(null);
  const [hoverTime, setHoverTime] = useState(0);
  const [previewReady, setPreviewReady] = useState(false);
  const previewSeekTimer = useRef<number | null>(null);

  const hideTimer = useRef<ReturnType<typeof setTimeout>>();
  const volumeTimer = useRef<ReturnType<typeof setTimeout>>();

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

  useEffect(() => {
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
  }, [introPlaying, ready, isYouTube]);

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

  const toggleFullscreen = useCallback(() => {
    const el = document.querySelector(".domiflix-player-root");
    if (!el) return;
    if (document.fullscreenElement) document.exitFullscreen();
    else (el as HTMLElement).requestFullscreen();
  }, []);

  useEffect(() => {
    const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)
      || window.matchMedia("(max-width: 1024px)").matches;
    if (!isMobile) return;

    const root = document.querySelector(".domiflix-player-root") as HTMLElement | null;

    const applyCssFallback = () => {
      const portrait = window.matchMedia("(orientation: portrait)").matches;
      if (root) root.classList.toggle("domiflix-force-landscape", portrait);
    };

    const tryEnter = () => {
      if (!root || document.fullscreenElement) {
        applyCssFallback();
        return;
      }
      const req = root.requestFullscreen?.();
      if (req && typeof req.then === "function") {
        req
          .then(() => {
            const orientation = (screen as any).orientation;
            if (orientation?.lock) {
              orientation.lock("landscape").catch(() => applyCssFallback());
            } else {
              applyCssFallback();
            }
          })
          .catch(() => applyCssFallback());
      } else {
        applyCssFallback();
      }
    };

    const timer = setTimeout(tryEnter, 300);
    const onInteract = () => { tryEnter(); };
    window.addEventListener("touchstart", onInteract, { once: true, passive: true });
    window.addEventListener("click", onInteract, { once: true });

    const mql = window.matchMedia("(orientation: portrait)");
    const onOrient = () => {
      if (root && !document.fullscreenElement) applyCssFallback();
    };
    mql.addEventListener?.("change", onOrient);

    return () => {
      clearTimeout(timer);
      window.removeEventListener("touchstart", onInteract);
      window.removeEventListener("click", onInteract);
      mql.removeEventListener?.("change", onOrient);
      if (root) root.classList.remove("domiflix-force-landscape");
    };
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      switch (e.key) {
        case " ":
        case "k":
          e.preventDefault();
          togglePlay();
          break;
        case "ArrowLeft":
          e.preventDefault();
          skip(-10);
          break;
        case "ArrowRight":
          e.preventDefault();
          skip(10);
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
          else onBackRef.current();
          break;
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [togglePlay, skip, toggleMute, toggleFullscreen]);

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
            setPlaying(true);
          },
          onStateChange: (e: any) => {
            if (destroyed) return;
            setPlaying(e.data === window.YT.PlayerState.PLAYING);
            if (e.data === window.YT.PlayerState.ENDED) onEndedRef.current?.();
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
  }, [videoId, isYouTube]);

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

  const resetHideTimer = useCallback(() => {
    if (hudLocked) {
      setShowHud(false);
      clearTimeout(hideTimer.current);
      return;
    }
    setShowHud(true);
    clearTimeout(hideTimer.current);
    if (playingRef.current && !showEpisodes) {
      hideTimer.current = setTimeout(() => setShowHud(false), 3500);
    }
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

  useEffect(() => {
    const handler = () => {
      const fs = !!document.fullscreenElement;
      setIsFullscreen(fs);
      const orientation = (screen as any).orientation;
      if (fs && orientation?.lock) {
        orientation.lock("landscape").catch(() => {
          /* unsupported (iOS Safari) — silently ignore */
        });
      } else if (!fs && orientation?.unlock) {
        try { orientation.unlock(); } catch { /* noop */ }
      }
    };
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  useEffect(() => {
    if (!duration) {
      setShowNextPreview(false);
      return;
    }
    const remaining = duration - currentTime;
    setShowNextPreview(remaining > 0 && remaining <= 10);
  }, [currentTime, duration]);

  const driveStreamUrl = isDrive ? getDriveStreamUrl(videoId) : "";

  useEffect(() => {
    if (!isDrive) return;
    const pv = previewVideoRef.current;
    if (!pv) return;
    const onMeta = () => setPreviewReady(true);
    pv.addEventListener("loadedmetadata", onMeta);
    return () => pv.removeEventListener("loadedmetadata", onMeta);
  }, [isDrive]);

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
      className="relative w-full h-full bg-black select-none overflow-hidden"
      style={{ cursor: showHud ? "default" : "none" }}
      onMouseMove={resetHideTimer}
      onTouchStart={resetHideTimer}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest(".player-controls")) return;
        if ((e.target as HTMLElement).closest(".episodes-overlay")) return;
        togglePlay();
      }}
    >
      {/* YouTube iframe */}
      {isYouTube && (
        <>
          <div className="absolute inset-0 overflow-hidden bg-black">
            <div
              ref={ytContainerRef}
              className={cn(
                "absolute inset-0 pointer-events-none domiflix-yt-cover transition-opacity duration-300",
                ready ? "opacity-100" : "opacity-0"
              )}
              style={{ transform: "scale(1.16)", transformOrigin: "center center" }}
            />
          </div>
          <div className="absolute inset-0 z-[5] bg-black pointer-events-none transition-opacity duration-300" style={{ opacity: ready ? 0 : 1 }} />
        </>
      )}

      {/* Drive HTML5 video */}
      {isDrive && (
        <>
          <video
            ref={videoElRef}
            src={driveStreamUrl}
            className="absolute inset-0 w-full h-full object-cover"
            playsInline
            preload="auto"
          />
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

      {/* Intro overlay */}
      <div
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

      {/* HUD: Back button + episode title (top) */}
      <div
        className={cn(
          "player-controls absolute top-0 left-0 right-0 z-20 px-3 pt-2 pb-3 md:px-6 md:pt-3 md:pb-4 transition-all duration-500",
          showHud ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-3 pointer-events-none"
        )}
      >
        <div className="md:hidden relative flex items-center h-9">
          <button
            onClick={onBack}
            className="absolute left-0 flex items-center text-white hover:text-white transition-colors shrink-0"
            aria-label="Voltar"
          >
            <ArrowLeft className="w-6 h-6" />
          </button>
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

        <div className="hidden md:flex items-center gap-4">
          <button
            onClick={onBack}
            className="flex items-center text-white/80 hover:text-white transition-colors shrink-0"
            aria-label="Voltar"
          >
            <ArrowLeft className="w-6 h-6" />
          </button>
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

      {/* Episodes overlay */}
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

      {/* "Você está assistindo" overlay */}
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

      {/* End-of-episode action buttons (last 10s) */}
      {showNextPreview && (() => {
        const remaining = Math.max(0, duration - currentTime);
        const fillPct = Math.max(0, Math.min(1, (10 - remaining) / 10)) * 100;
        return (
          <div
            className={cn(
              "player-controls absolute z-30 transition-all duration-500",
              "right-4 md:right-10 bottom-32 md:bottom-36 flex items-center gap-3",
              "opacity-100 translate-y-0 pointer-events-auto"
            )}
          >
            <button
              onClick={(e) => {
                e.stopPropagation();
                seekTo(0);
              }}
              className="px-5 py-2.5 rounded-sm bg-[#3A3A3A]/90 hover:bg-[#4A4A4A] text-white text-sm font-semibold transition-colors"
            >
              Voltar para o início
            </button>

            {nextEpisode && onEnded && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onEnded();
                }}
                className="relative overflow-hidden rounded-sm border border-white/30 text-sm font-semibold"
              >
                <span className="absolute inset-0 bg-white/30" />
                <span
                  className="absolute inset-y-0 left-0 bg-white transition-[width] duration-200 ease-linear"
                  style={{ width: `${fillPct}%` }}
                />
                <span className="relative flex items-center gap-2 px-5 py-2.5 text-black">
                  <PlayIcon className="w-4 h-4" />
                  Próximo episódio
                </span>
              </button>
            )}
          </div>
        );
      })()}

      {/* HUD Bottom */}
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
              className="group relative flex-1 h-[6px] hover:h-[8px] bg-white/25 rounded-full cursor-pointer transition-all"
              onMouseMove={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                setHoverPct(pct);
                setHoverTime(pct * duration);
              }}
              onMouseLeave={() => setHoverPct(null)}
              onMouseDown={(e) => {
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
              <div
                className="absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 group-hover:w-4 group-hover:h-4 bg-[#E50914] rounded-full shadow-[0_0_8px_rgba(229,9,20,0.6)]"
                style={{
                  left: `${playbackProgress}%`,
                  marginLeft: "-7px",
                  transition: seeking ? "none" : "left 150ms linear, width 150ms, height 150ms",
                }}
              />

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

        {/* Desktop controls row */}
        <div className="hidden md:flex items-center justify-between px-4 md:px-10 pb-4 md:pb-6 pt-2">
          <div className="flex items-center gap-1 md:gap-3">
            <button
              onClick={togglePlay}
              className="text-white hover:scale-110 transition-transform p-1"
            >
              {playing ? <PauseIcon className="w-7 h-7 md:w-8 md:h-8" /> : <PlayIcon className="w-7 h-7 md:w-8 md:h-8" />}
            </button>

            <button
              onClick={() => skip(-10)}
              className="text-white hover:scale-110 transition-transform p-1 hidden sm:block"
            >
              <SkipBack10Icon className="w-7 h-7 md:w-8 md:h-8" />
            </button>

            <button
              onClick={() => skip(10)}
              className="text-white hover:scale-110 transition-transform p-1 hidden sm:block"
            >
              <SkipForward10Icon className="w-7 h-7 md:w-8 md:h-8" />
            </button>

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
            {nextEpisode && onPlayNext && (
              <NextEpisodeButton nextEpisode={nextEpisode} onPlayNext={onPlayNext} />
            )}

            {titleData && titleData.type === "series" && onSelectEpisode && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowSpeed(false);
                  setShowEpisodes((v) => !v);
                }}
                className={cn(
                  "text-white hover:scale-110 transition-transform p-1",
                  showEpisodes && "text-[#E50914]"
                )}
                title="Episódios"
              >
                <EpisodesListIcon className="w-8 h-7 md:w-9 md:h-8" />
              </button>
            )}

            {onChangePlaybackSpeed && (
              <SpeedButton
                speed={playbackSpeed}
                onChange={onChangePlaybackSpeed}
                open={showSpeed}
                onOpenChange={(o) => {
                  if (o) setShowEpisodes(false);
                  setShowSpeed(o);
                }}
              />
            )}

            <button
              onClick={toggleFullscreen}
              className="text-white hover:scale-110 transition-transform p-1"
            >
              {isFullscreen ? (
                <MinimizeIcon className="w-7 h-7 md:w-8 md:h-8" />
              ) : (
                <FullscreenIcon className="w-7 h-7 md:w-8 md:h-8" />
              )}
            </button>
          </div>
        </div>

        {/* Mobile bottom controls row */}
        <div className="md:hidden flex items-center justify-center gap-8 sm:gap-10 pt-2 pb-3 text-white">
          {onChangePlaybackSpeed && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowEpisodes(false);
                setShowSpeed((v) => !v);
              }}
              className="flex flex-col items-center gap-0.5"
            >
              <SpeedIcon className="w-7 h-7" />
              <span className="text-[10px] font-light">Velocidade ({playbackSpeed}x)</span>
            </button>
          )}

          {titleData && titleData.type === "series" && onSelectEpisode && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowSpeed(false);
                setShowEpisodes((v) => !v);
              }}
              className={cn(
                "flex flex-col items-center gap-0.5",
                showEpisodes && "text-[#E50914]"
              )}
            >
              <EpisodesListIcon className="w-7 h-7" />
              <span className="text-[10px] font-light">Episódios</span>
            </button>
          )}

          {nextEpisode && onPlayNext && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onPlayNext();
              }}
              className="flex flex-col items-center gap-0.5"
            >
              <NextEpisodeIcon className="w-7 h-7" />
              <span className="text-[10px] font-light">Próx. episódio</span>
            </button>
          )}
        </div>
      </div>

      {/* Mobile center cluster: skip/play/skip */}
      {ready && showHud && !showEpisodes && (
        <div className="player-controls md:hidden absolute inset-0 z-20 flex items-center justify-center gap-10 pointer-events-none">
          <button
            onPointerDown={(e) => { e.stopPropagation(); }}
            onClick={(e) => { e.stopPropagation(); skip(-10); }}
            className="pointer-events-auto text-white p-3 -m-1"
            aria-label="Voltar 10 segundos"
          >
            <SkipBack10Icon className="w-10 h-10" />
          </button>
          <button
            onPointerDown={(e) => { e.stopPropagation(); }}
            onClick={(e) => { e.stopPropagation(); togglePlay(); }}
            className="pointer-events-auto w-16 h-16 flex items-center justify-center text-white"
            aria-label={playing ? "Pausar" : "Reproduzir"}
          >
            {playing ? <PauseIcon className="w-12 h-12" /> : <PlayIcon className="w-12 h-12 ml-1" />}
          </button>
          <button
            onPointerDown={(e) => { e.stopPropagation(); }}
            onClick={(e) => { e.stopPropagation(); skip(10); }}
            className="pointer-events-auto text-white p-3 -m-1"
            aria-label="Avançar 10 segundos"
          >
            <SkipForward10Icon className="w-10 h-10" />
          </button>
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

// ─── Episodes Overlay ────────────────────────────────────────────────────────
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
                                {ep.thumbnail_url ? (
                                  <img
                                    src={ep.thumbnail_url}
                                    alt={ep.title}
                                    className="w-44 h-24 object-cover rounded group-hover:opacity-80 transition-opacity"
                                  />
                                ) : (
                                  <div className="w-44 h-24 bg-white/10 rounded" />
                                )}
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

// ─── Next Episode Button ─────────────────────────────────────────────────────
function NextEpisodeButton({
  nextEpisode,
  onPlayNext,
}: {
  nextEpisode: DomiflixEpisode;
  onPlayNext: () => void;
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
        title="Próximo episódio"
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
          <span className="text-white font-semibold text-sm">Próximo Episódio</span>
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onPlayNext();
          }}
          className="w-full text-left flex gap-3 p-3 hover:bg-white/5 transition-colors"
        >
          {nextEpisode.thumbnail_url ? (
            <img
              src={nextEpisode.thumbnail_url}
              alt={nextEpisode.title}
              className="w-32 h-20 object-cover rounded shrink-0"
            />
          ) : (
            <div className="w-32 h-20 bg-white/10 rounded shrink-0" />
          )}
          <div className="flex-1 min-w-0">
            <p className="text-white text-sm font-bold mb-1 truncate">
              {nextEpisode.episode_number ?? ""}
              {nextEpisode.episode_number ? "  " : ""}
              {nextEpisode.title || `Episódio ${nextEpisode.episode_number ?? ""}`}
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

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onOpenChange(false);
      }
    };
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
          "absolute bottom-[calc(100%+72px)] right-0 w-[480px] max-w-[80vw]",
          "bg-[#181818] rounded-md border border-white/10 shadow-2xl",
          "transition-all duration-200",
          open ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2 pointer-events-none"
        )}
      >
        <div className="px-7 pt-5 pb-2">
          <p className="text-white font-bold text-sm">Velocidade</p>
        </div>
        <div className="px-6 pt-6 pb-10">
          <div
            className="grid items-center"
            style={{ gridTemplateColumns: `repeat(${PLAYBACK_SPEEDS.length}, minmax(0, 1fr))` }}
          >
            <div className="col-span-full row-start-1 relative h-10 pointer-events-none">
              <div
                className="absolute top-1/2 -translate-y-1/2 h-[2px] bg-white/30 rounded-full"
                style={{ left: `${50 / PLAYBACK_SPEEDS.length}%`, right: `${50 / PLAYBACK_SPEEDS.length}%` }}
              />
            </div>

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
