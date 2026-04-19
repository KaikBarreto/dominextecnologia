import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Play, Plus, Check, Info } from "lucide-react";
import {
  DomiflixTitle, DomiflixWatchlistItem, DomiflixProgress,
  useToggleWatchlist, useDomiflixAllEpisodes,
} from "@/hooks/useDomiflix";
import { slugify } from "@/lib/slugify";
import { cn } from "@/lib/utils";

interface DomiflixHeroProps {
  title: DomiflixTitle | null;
  continueWatchingTitle?: DomiflixTitle | null;
  watchlist: DomiflixWatchlistItem[];
  progress?: DomiflixProgress[];
}

export function DomiflixHero({ title, continueWatchingTitle, watchlist, progress = [] }: DomiflixHeroProps) {
  const navigate = useNavigate();
  const toggleWatchlist = useToggleWatchlist();
  const { data: allEpisodesData } = useDomiflixAllEpisodes();
  const [visible, setVisible] = useState(false);

  const displayTitle = continueWatchingTitle ?? title;

  useEffect(() => {
    setVisible(false);
    const t = setTimeout(() => setVisible(true), 80);
    return () => clearTimeout(t);
  }, [displayTitle?.id]);

  if (!displayTitle) {
    return <div className="relative w-full min-h-[360px] bg-gradient-to-b from-[#1a1a1a] to-[#141414]" style={{ height: 'min(60vw, 62vh)' }} />;
  }

  const isInWatchlist = watchlist.some((w) => w.title_id === displayTitle.id);
  const bgImage = displayTitle.banner_url || displayTitle.thumbnail_url;
  const titleSlug = slugify(displayTitle.title);
  const isContinuing = !!continueWatchingTitle;

  const resumeInfo = (() => {
    if (!isContinuing || !allEpisodesData) return null;
    const titleProgress = progress
      .filter((p) => p.title_id === displayTitle.id)
      .sort((a, b) => new Date(b.watched_at).getTime() - new Date(a.watched_at).getTime());
    const latest = titleProgress[0];
    const titleEpisodes = allEpisodesData.byTitle[displayTitle.id] ?? [];
    if (!latest || titleEpisodes.length === 0) return null;
    const ep = titleEpisodes.find((e) => e.id === latest.episode_id);
    if (!ep) return null;
    const seasonInfo = allEpisodesData.seasonMap?.[ep.id];
    const min = Math.floor((latest.progress_seconds || 0) / 60);
    const sec = Math.floor((latest.progress_seconds || 0) % 60);
    const label = seasonInfo
      ? `T${seasonInfo.seasonNumber} · Ep. ${seasonInfo.episodeInSeason}: ${ep.title}`
      : ep.title;
    return { label, timestamp: `${min}:${String(sec).padStart(2, "0")}` };
  })();

  function handlePlayClick() {
    if (isContinuing && allEpisodesData) {
      const titleProgress = progress
        .filter((p) => p.title_id === displayTitle!.id)
        .sort((a, b) => new Date(b.watched_at).getTime() - new Date(a.watched_at).getTime());
      const latest = titleProgress[0];
      const titleEpisodes = allEpisodesData.byTitle[displayTitle!.id] ?? [];
      if (latest && titleEpisodes.length > 0) {
        const idx = titleEpisodes.findIndex((e) => e.id === latest.episode_id);
        if (idx >= 0) {
          const startSec = Math.max(0, Math.floor(latest.progress_seconds || 0));
          navigate(`/domiflix/assistir/${titleSlug}/${idx + 1}/${startSec}`);
          return;
        }
      }
    }
    navigate(`/domiflix/${titleSlug}`);
  }

  return (
    <div className="relative w-full min-h-[420px] sm:min-h-[360px] overflow-hidden" style={{ height: 'min(60vw, 62vh)' }}>
      {bgImage ? (
        <img src={bgImage} alt={displayTitle.title} loading="eager" fetchPriority="high" decoding="async"
          className="absolute inset-0 w-full h-full object-cover object-top" />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-[#2a2a2a] to-[#141414]" />
      )}

      <div className="absolute inset-0 bg-gradient-to-r from-black/85 via-black/40 to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-t from-[#141414] via-transparent to-black/30" />

      <div
        className="absolute bottom-[18%] sm:bottom-[14%] left-0 right-0 px-4 sm:px-8 md:px-16"
        style={{
          opacity: visible ? 1 : 0,
          transform: visible ? "translateY(0)" : "translateY(16px)",
          transition: "opacity 0.7s ease, transform 0.7s ease",
        }}
      >
        <div className="flex items-center gap-3 mb-2 sm:mb-3">
          {isContinuing && (
            <span className="text-[10px] sm:text-[11px] font-bold tracking-[0.15em] uppercase text-white/60">Continuar Assistindo</span>
          )}
          <span className="text-[10px] sm:text-[11px] font-bold tracking-[0.2em] uppercase text-[#e50914]">
            {displayTitle.type === "movie" ? "Live" : "Série"}
          </span>
        </div>

        {displayTitle.logo_url ? (
          <img src={displayTitle.logo_url} alt={displayTitle.title}
            className="mb-2 sm:mb-4 max-w-[60%] sm:max-w-[420px] md:max-w-[520px] max-h-[100px] sm:max-h-[160px] md:max-h-[200px] object-contain object-left drop-shadow-[0_2px_8px_rgba(0,0,0,0.9)]" />
        ) : (
          <h1 className="text-white font-bold mb-2 sm:mb-4 leading-none max-w-2xl drop-shadow-[0_2px_8px_rgba(0,0,0,0.9)]"
            style={{ fontSize: "clamp(1.5rem, 5vw, 3.5rem)" }}>
            {displayTitle.title}
          </h1>
        )}

        {displayTitle.description && (
          <p className="text-[#e5e5e5] max-w-md mb-3 sm:mb-6 line-clamp-2 sm:line-clamp-3 leading-snug drop-shadow"
            style={{ fontSize: "clamp(0.75rem, 1.2vw, 1rem)" }}>
            {displayTitle.description}
          </p>
        )}

        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
          <button onClick={handlePlayClick}
            className="flex items-center gap-1.5 sm:gap-2 px-4 sm:px-7 py-2 sm:py-2.5 rounded-sm font-bold text-black bg-white hover:bg-white/85 transition-all text-xs sm:text-sm md:text-base">
            <Play className="w-4 h-4 sm:w-5 sm:h-5 fill-black" />
            {isContinuing ? "Continuar" : "Assistir"}
          </button>

          <button
            onClick={() => toggleWatchlist.mutate({ titleId: displayTitle.id, isInList: isInWatchlist })}
            className={cn(
              "flex items-center gap-1.5 sm:gap-2 px-3 sm:px-6 py-2 sm:py-2.5 rounded-sm font-semibold transition-all text-xs sm:text-sm md:text-base backdrop-blur-sm border",
              isInWatchlist
                ? "bg-[#e50914] hover:bg-[#b80710] text-white border-[#e50914] shadow-[0_0_18px_rgba(229,9,20,0.35)]"
                : "bg-[#6d6d6eb3] hover:bg-[#6d6d6e] text-white border-white/20"
            )}
          >
            {isInWatchlist
              ? <><Check className="w-4 h-4 sm:w-5 sm:h-5" strokeWidth={3} /> Na lista</>
              : <><Plus className="w-4 h-4 sm:w-5 sm:h-5" /> Minha lista</>}
          </button>

          <button onClick={() => navigate(`/domiflix/${titleSlug}`)}
            className="hidden sm:flex items-center gap-2 px-6 py-2.5 rounded-sm font-semibold text-white hover:bg-white/10 transition-all text-sm md:text-base">
            <Info className="w-5 h-5" />
            Mais informações
          </button>
        </div>

        {resumeInfo && (
          <div className="mt-2 sm:mt-3 text-white/75 text-xs sm:text-sm font-medium drop-shadow-md max-w-2xl truncate">
            {resumeInfo.label} · <span className="text-white/55">{resumeInfo.timestamp}</span>
          </div>
        )}
      </div>
    </div>
  );
}
