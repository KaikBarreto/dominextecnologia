import { useEffect, useRef, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Maximize, Minimize, Volume2, VolumeX, SkipForward } from "lucide-react";
import { useDomiflixTitleBySlug, useDomiflixTitle, useDomiflixProgress, useMarkEpisodeWatched, DomiflixEpisode } from "@/hooks/useDomiflix";
import { useDomiflixPreferences, useUpdatePlaybackSpeed, PLAYBACK_SPEEDS } from "@/hooks/useDomiflixPreferences";
import { supabase } from "@/integrations/supabase/client";
import { getDriveStreamUrl } from "@/lib/drive";
import { PlayIcon, PauseIcon } from "@/components/domiflix/PlayerIcons";
import { cn } from "@/lib/utils";
import { playDomiflixIntro, stopDomiflixIntro } from "@/lib/domiflixIntroSound";
import logoWhite from "@/assets/logo-white-horizontal.png";

declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady: (() => void) | undefined;
  }
}

let ytApiPromise: Promise<void> | null = null;
function loadYTApi(): Promise<void> {
  if (window.YT?.Player) return Promise.resolve();
  if (ytApiPromise) return ytApiPromise;
  ytApiPromise = new Promise<void>((resolve) => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => { prev?.(); resolve(); };
    const tag = document.createElement("script");
    tag.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(tag);
  });
  return ytApiPromise;
}

function fmt(seconds: number) {
  const s = Math.max(0, seconds || 0);
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, "0")}`;
}

export default function DomiflixWatch() {
  const { titleSlug, episodeNumber, startSeconds } = useParams<{ titleSlug: string; episodeNumber: string; startSeconds?: string }>();
  const navigate = useNavigate();

  const { data: resolvedTitleId } = useDomiflixTitleBySlug(titleSlug);
  const { data: titleData } = useDomiflixTitle(resolvedTitleId ?? undefined);
  const { data: prefs } = useDomiflixPreferences();
  const updateSpeed = useUpdatePlaybackSpeed();
  const markWatched = useMarkEpisodeWatched();

  const allEpisodes: DomiflixEpisode[] = titleData
    ? (titleData.type === "series" ? titleData.seasons.flatMap((s) => s.episodes) : titleData.episodes)
    : [];
  const epNum = parseInt(episodeNumber ?? "1", 10);
  const episode = allEpisodes[epNum - 1];
  const nextEpisode = allEpisodes[epNum];

  const progressRef = useRef(0);
  const durationRef = useRef(0);

  const saveProgress = useCallback(async () => {
    if (!episode || !resolvedTitleId) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const dur = Math.round(durationRef.current);
    const prog = Math.round(progressRef.current);
    if (prog <= 1) return;
    await supabase.from("domiflix_user_progress" as any).upsert({
      user_id: user.id,
      episode_id: episode.id,
      title_id: resolvedTitleId,
      completed: dur > 0 ? prog / dur > 0.9 : false,
      watched_at: new Date().toISOString(),
      progress_seconds: prog,
      duration_seconds: dur,
    }, { onConflict: "user_id,episode_id" });
  }, [episode, resolvedTitleId]);

  useEffect(() => {
    if (!episode || !resolvedTitleId) return;
    markWatched.mutate({ episodeId: episode.id, titleId: resolvedTitleId, completed: false, progressSeconds: 0, durationSeconds: 0 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [episode?.id, resolvedTitleId]);

  useEffect(() => {
    const id = setInterval(() => { saveProgress().catch(() => {}); }, 20000);
    const onHide = () => { saveProgress().catch(() => {}); };
    window.addEventListener("pagehide", onHide);
    window.addEventListener("beforeunload", onHide);
    return () => { clearInterval(id); window.removeEventListener("pagehide", onHide); window.removeEventListener("beforeunload", onHide); saveProgress().catch(() => {}); };
  }, [saveProgress]);

  const handleBack = useCallback(async () => {
    await saveProgress();
    if (titleSlug) navigate(`/domiflix/${titleSlug}`);
    else navigate("/domiflix");
  }, [navigate, saveProgress, titleSlug]);

  const goNext = useCallback(async () => {
    await saveProgress();
    if (!nextEpisode || !titleSlug) return;
    navigate(`/domiflix/assistir/${titleSlug}/${epNum + 1}`, { replace: true });
  }, [nextEpisode, titleSlug, epNum, navigate, saveProgress]);

  if (!episode) {
    return (
      <div className="fixed inset-0 z-[100] bg-black flex items-center justify-center text-white/50">
        <div className="text-center">
          <div className="w-10 h-10 border-[3px] border-[#e50914] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-sm mb-4">Carregando...</p>
          <button onClick={() => navigate(-1)} className="text-xs text-white/30 hover:text-white underline">Voltar</button>
        </div>
      </div>
    );
  }

  const startSec = startSeconds ? Math.max(0, parseInt(startSeconds, 10) || 0) : 0;
  const titleName = titleData?.title ?? "";
  const subLabel = `Episódio ${epNum}`;

  return (
    <div className="domiflix-player-root fixed inset-0 z-[100] bg-black">
      {episode.video_id ? (
        <Player
          videoId={episode.video_id}
          videoType={(episode.video_type as "youtube" | "drive") ?? "youtube"}
          titleName={titleName}
          subLabel={subLabel}
          episodeName={episode.title}
          startSeconds={startSec}
          playbackSpeed={prefs?.playback_speed ?? 1}
          onChangeSpeed={(s) => updateSpeed.mutate(s)}
          onBack={handleBack}
          onEnded={() => { if (nextEpisode) goNext(); else handleBack(); }}
          onProgress={(c, d) => { progressRef.current = c; durationRef.current = d; }}
          hasNext={!!nextEpisode}
          onPlayNext={goNext}
        />
      ) : (
        <div className="flex flex-col items-center justify-center h-full text-white/50 gap-4">
          <p className="text-lg">Vídeo não disponível</p>
          <button onClick={handleBack} className="text-sm text-white/40 hover:text-white underline">Voltar</button>
        </div>
      )}
    </div>
  );
}

interface PlayerProps {
  videoId: string;
  videoType: "youtube" | "drive";
  titleName: string;
  subLabel: string;
  episodeName: string;
  startSeconds: number;
  playbackSpeed: number;
  onChangeSpeed: (s: number) => void;
  onBack: () => void;
  onEnded: () => void;
  onProgress: (current: number, total: number) => void;
  hasNext: boolean;
  onPlayNext: () => void;
}

function Player({ videoId, videoType, titleName, subLabel, episodeName, startSeconds, playbackSpeed, onChangeSpeed, onBack, onEnded, onProgress, hasNext, onPlayNext }: PlayerProps) {
  const ytContainerRef = useRef<HTMLDivElement>(null);
  const ytRef = useRef<any>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const tickRef = useRef<number>(0);

  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [muted, setMuted] = useState(false);
  const [showHud, setShowHud] = useState(true);
  const [isFs, setIsFs] = useState(false);
  const [introPlaying, setIntroPlaying] = useState(true);
  const [showSpeed, setShowSpeed] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout>>();

  const isYouTube = videoType === "youtube";
  const isDrive = videoType === "drive";

  // Intro overlay
  useEffect(() => {
    setIntroPlaying(true);
    let cancelled = false;
    playDomiflixIntro().then(() => { if (!cancelled) setIntroPlaying(false); });
    return () => { cancelled = true; stopDomiflixIntro(); };
  }, [videoId]);

  useEffect(() => {
    if (!ready) return;
    if (isYouTube) {
      try {
        if (introPlaying) { ytRef.current?.mute(); ytRef.current?.pauseVideo(); }
        else { ytRef.current?.unMute(); ytRef.current?.playVideo(); }
      } catch {}
    } else if (videoRef.current) {
      if (introPlaying) { videoRef.current.muted = true; videoRef.current.pause(); }
      else { videoRef.current.muted = muted; videoRef.current.play().catch(() => {}); }
    }
  }, [introPlaying, ready, isYouTube, muted]);

  // Apply playback speed
  useEffect(() => {
    if (isYouTube) try { ytRef.current?.setPlaybackRate?.(playbackSpeed); } catch {}
    else if (videoRef.current) videoRef.current.playbackRate = playbackSpeed;
  }, [playbackSpeed, isYouTube, ready]);

  // Init YouTube
  useEffect(() => {
    if (!isYouTube) return;
    let destroyed = false;
    loadYTApi().then(() => {
      if (destroyed || !ytContainerRef.current) return;
      const el = document.createElement("div");
      el.id = "yt-player-" + Date.now();
      el.style.width = "100%"; el.style.height = "100%";
      ytContainerRef.current.innerHTML = "";
      ytContainerRef.current.appendChild(el);
      ytRef.current = new window.YT.Player(el.id, {
        width: "100%", height: "100%", videoId,
        host: "https://www.youtube-nocookie.com",
        playerVars: { autoplay: 1, controls: 0, modestbranding: 1, rel: 0, iv_load_policy: 3, disablekb: 1, fs: 0, playsinline: 1 },
        events: {
          onReady: (e: any) => {
            setReady(true);
            setDuration(e.target.getDuration());
            if (startSeconds > 0) try { e.target.seekTo(startSeconds, true); } catch {}
            try { e.target.setPlaybackRate?.(playbackSpeed); } catch {}
            setPlaying(true);
          },
          onStateChange: (e: any) => {
            setPlaying(e.data === window.YT.PlayerState.PLAYING);
            if (e.data === window.YT.PlayerState.ENDED) onEnded();
          },
        },
      });
    });
    return () => { destroyed = true; try { ytRef.current?.destroy(); } catch {} cancelAnimationFrame(tickRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoId, isYouTube]);

  // Init Drive
  useEffect(() => {
    if (!isDrive) return;
    const v = videoRef.current;
    if (!v) return;
    const onLoaded = () => {
      setReady(true);
      setDuration(v.duration || 0);
      if (startSeconds > 0) try { v.currentTime = startSeconds; } catch {}
      v.play().catch(() => {});
    };
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onEnd = () => onEnded();
    v.addEventListener("loadedmetadata", onLoaded);
    v.addEventListener("play", onPlay);
    v.addEventListener("pause", onPause);
    v.addEventListener("ended", onEnd);
    return () => { v.removeEventListener("loadedmetadata", onLoaded); v.removeEventListener("play", onPlay); v.removeEventListener("pause", onPause); v.removeEventListener("ended", onEnd); };
  }, [isDrive, startSeconds, onEnded]);

  // Tick
  useEffect(() => {
    if (!ready) return;
    let active = true;
    function tick() {
      if (!active) return;
      try {
        let t = 0, d = 0;
        if (isYouTube) { t = ytRef.current?.getCurrentTime?.() ?? 0; d = ytRef.current?.getDuration?.() ?? 0; }
        else if (videoRef.current) { t = videoRef.current.currentTime; d = videoRef.current.duration || 0; }
        setCurrentTime(t);
        if (d > 0) setDuration(d);
        onProgress(t, d);
      } catch {}
      tickRef.current = requestAnimationFrame(tick);
    }
    tick();
    return () => { active = false; cancelAnimationFrame(tickRef.current); };
  }, [ready, isYouTube, onProgress]);

  // Auto-hide HUD
  const resetHide = useCallback(() => {
    setShowHud(true);
    clearTimeout(hideTimer.current);
    if (playing && !showSpeed) hideTimer.current = setTimeout(() => setShowHud(false), 3500);
  }, [playing, showSpeed]);
  useEffect(() => { resetHide(); return () => clearTimeout(hideTimer.current); }, [playing, resetHide]);

  const togglePlay = useCallback(() => {
    if (isYouTube) { if (playing) ytRef.current?.pauseVideo(); else ytRef.current?.playVideo(); }
    else if (videoRef.current) { if (videoRef.current.paused) videoRef.current.play().catch(() => {}); else videoRef.current.pause(); }
  }, [isYouTube, playing]);

  const seekTo = useCallback((t: number) => {
    if (isYouTube) ytRef.current?.seekTo(t, true);
    else if (videoRef.current) videoRef.current.currentTime = t;
    setCurrentTime(t);
  }, [isYouTube]);

  const skip = useCallback((d: number) => seekTo(Math.max(0, Math.min(duration, currentTime + d))), [seekTo, currentTime, duration]);

  const toggleMute = useCallback(() => {
    if (isYouTube) { if (muted) ytRef.current?.unMute(); else ytRef.current?.mute(); setMuted(!muted); }
    else if (videoRef.current) { videoRef.current.muted = !videoRef.current.muted; setMuted(videoRef.current.muted); }
  }, [isYouTube, muted]);

  const toggleFs = useCallback(() => {
    const el = document.querySelector(".domiflix-player-root");
    if (!el) return;
    if (document.fullscreenElement) document.exitFullscreen();
    else (el as HTMLElement).requestFullscreen();
  }, []);

  useEffect(() => {
    const h = () => setIsFs(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", h);
    return () => document.removeEventListener("fullscreenchange", h);
  }, []);

  // Keyboard
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      switch (e.key) {
        case " ": case "k": e.preventDefault(); togglePlay(); break;
        case "ArrowLeft": e.preventDefault(); skip(-10); break;
        case "ArrowRight": e.preventDefault(); skip(10); break;
        case "m": e.preventDefault(); toggleMute(); break;
        case "f": e.preventDefault(); toggleFs(); break;
        case "Escape": if (document.fullscreenElement) document.exitFullscreen(); else onBack(); break;
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [togglePlay, skip, toggleMute, toggleFs, onBack]);

  const driveUrl = isDrive ? getDriveStreamUrl(videoId) : "";
  const pct = duration > 0 ? (currentTime / duration) * 100 : 0;
  const showNextBtn = duration > 0 && hasNext && (duration - currentTime) <= 15;

  return (
    <div className="relative w-full h-full bg-black select-none overflow-hidden"
      style={{ cursor: showHud ? "default" : "none" }}
      onMouseMove={resetHide} onTouchStart={resetHide}
      onClick={(e) => { if (!(e.target as HTMLElement).closest(".player-controls")) togglePlay(); }}>
      {isYouTube && (
        <div ref={ytContainerRef} className={cn("absolute inset-0 transition-opacity duration-300", ready ? "opacity-100" : "opacity-0")}
          style={{ transform: "scale(1.16)", transformOrigin: "center center" }} />
      )}
      {isDrive && <video ref={videoRef} src={driveUrl} className="absolute inset-0 w-full h-full object-cover" playsInline preload="auto" />}

      {!ready && (
        <div className="absolute inset-0 flex items-center justify-center z-10">
          <div className="w-12 h-12 border-[3px] border-[#e50914] border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {/* Intro overlay */}
      <div className={cn("absolute inset-0 z-[40] bg-black flex items-center justify-center pointer-events-none transition-opacity duration-700",
        introPlaying ? "opacity-100" : "opacity-0")}
        style={{ visibility: introPlaying ? "visible" : "hidden" }}>
        <img src={logoWhite} alt="Domiflix" className="h-16 md:h-20 object-contain" draggable={false} />
      </div>

      {/* Gradient overlays */}
      <div className={cn("absolute inset-0 z-10 pointer-events-none transition-opacity duration-500", showHud ? "opacity-100" : "opacity-0")}>
        <div className="absolute top-0 left-0 right-0 h-24 bg-gradient-to-b from-black/70 to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 h-48 bg-gradient-to-t from-black/85 via-black/40 to-transparent" />
      </div>

      {/* Top: back + title */}
      <div className={cn("player-controls absolute top-0 left-0 right-0 z-20 px-4 py-3 md:px-6 md:py-4 flex items-center gap-4 transition-all duration-500",
        showHud ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-3 pointer-events-none")}>
        <button onClick={onBack} className="text-white hover:text-white/80" aria-label="Voltar"><ArrowLeft className="w-6 h-6" /></button>
        <div className="min-w-0">
          <div className="text-white font-bold text-base md:text-lg truncate">{titleName}</div>
          <div className="text-white/70 text-xs md:text-sm truncate">{subLabel} · {episodeName}</div>
        </div>
      </div>

      {/* Next episode button */}
      {showNextBtn && (
        <button onClick={(e) => { e.stopPropagation(); onPlayNext(); }}
          className="player-controls absolute right-6 bottom-32 z-30 flex items-center gap-2 px-5 py-2.5 rounded bg-white text-black text-sm font-semibold hover:bg-white/85">
          <SkipForward className="w-4 h-4" /> Próximo episódio
        </button>
      )}

      {/* Bottom HUD */}
      <div className={cn("player-controls absolute bottom-0 left-0 right-0 z-20 transition-all duration-500",
        showHud ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3 pointer-events-none")}>
        {/* Progress bar */}
        <div className="px-4 md:px-10 mb-2">
          <div className="flex items-center gap-3">
            <div className="group relative flex-1 h-[6px] hover:h-[8px] bg-white/25 rounded-full cursor-pointer transition-all"
              onMouseDown={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const move = (clientX: number) => {
                  const p = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
                  seekTo(p * duration);
                };
                move(e.clientX);
                const onMove = (ev: MouseEvent) => move(ev.clientX);
                const onUp = () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
                window.addEventListener("mousemove", onMove);
                window.addEventListener("mouseup", onUp);
              }}>
              <div className="absolute inset-y-0 left-0 bg-[#e50914] rounded-full" style={{ width: `${pct}%` }} />
              <div className="absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 bg-[#e50914] rounded-full" style={{ left: `${pct}%`, marginLeft: "-7px" }} />
            </div>
            <span className="text-white/60 text-[11px] tabular-nums w-[52px] text-right">{fmt(duration - currentTime)}</span>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center justify-between px-4 md:px-10 pb-4 md:pb-6 pt-2">
          <div className="flex items-center gap-2 md:gap-3">
            <button onClick={(e) => { e.stopPropagation(); togglePlay(); }} className="text-white hover:scale-110 transition p-1">
              {playing ? <PauseIcon className="w-7 h-7 md:w-8 md:h-8" /> : <PlayIcon className="w-7 h-7 md:w-8 md:h-8" />}
            </button>
            <button onClick={(e) => { e.stopPropagation(); skip(-10); }} className="text-white/85 hover:text-white text-xs font-medium px-2 py-1 border border-white/30 rounded hidden sm:block">-10s</button>
            <button onClick={(e) => { e.stopPropagation(); skip(10); }} className="text-white/85 hover:text-white text-xs font-medium px-2 py-1 border border-white/30 rounded hidden sm:block">+10s</button>
            <button onClick={(e) => { e.stopPropagation(); toggleMute(); }} className="text-white p-1">
              {muted ? <VolumeX className="w-6 h-6" /> : <Volume2 className="w-6 h-6" />}
            </button>
            <span className="text-white text-sm tabular-nums hidden sm:block">{fmt(currentTime)} / {fmt(duration)}</span>
          </div>

          <div className="flex items-center gap-3">
            <div className="relative">
              <button onClick={(e) => { e.stopPropagation(); setShowSpeed((v) => !v); }}
                className="text-white text-sm font-semibold px-3 py-1 hover:bg-white/10 rounded">{playbackSpeed}x</button>
              {showSpeed && (
                <div className="absolute bottom-full mb-2 right-0 bg-[#181818] border border-white/10 rounded-md py-1 min-w-[80px]">
                  {PLAYBACK_SPEEDS.map((s) => (
                    <button key={s} onClick={(e) => { e.stopPropagation(); onChangeSpeed(s); setShowSpeed(false); }}
                      className={cn("block w-full text-left px-3 py-1.5 text-sm hover:bg-white/10",
                        s === playbackSpeed ? "text-[#e50914] font-semibold" : "text-white")}>{s}x</button>
                  ))}
                </div>
              )}
            </div>
            <button onClick={(e) => { e.stopPropagation(); toggleFs(); }} className="text-white p-1">
              {isFs ? <Minimize className="w-6 h-6" /> : <Maximize className="w-6 h-6" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
