import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Play } from "lucide-react";
import { DomiflixTitle, DomiflixProgress, DomiflixWatchlistItem, DomiflixEpisode } from "@/hooks/useDomiflix";
import { slugify } from "@/lib/slugify";
import { cn } from "@/lib/utils";
import domiflixLogo from "@/assets/domiflix-logo-horizontal-branco.png";
import { useAppLocaleContext } from "@/contexts/AppLocaleContext";
import { MESSAGES } from "@/lib/i18n/messages";

interface DomiflixCardProps {
  title: DomiflixTitle;
  progress: DomiflixProgress[];
  watchlist: DomiflixWatchlistItem[];
  episodeCount?: number;
  /** "poster" = vertical thumbnail (default), "continue" = horizontal banner with progress bar */
  variant?: "poster" | "continue";
  /** All episodes flat for this title — needed for "continue" variant to find the current episode */
  allEpisodesFlat?: DomiflixEpisode[];
  /** Season info map: episodeId → { seasonNumber, episodeInSeason } */
  episodeSeasonMap?: Record<string, { seasonNumber: number; episodeInSeason: number }>;
}

export function DomiflixCard({
  title,
  progress,
  watchlist,
  episodeCount = 0,
  variant = "poster",
  allEpisodesFlat = [],
  episodeSeasonMap = {},
}: DomiflixCardProps) {
  const navigate = useNavigate();
  const { locale } = useAppLocaleContext();
  const t = MESSAGES[locale].app.domiflix;
  const [imageLoaded, setImageLoaded] = useState(false);

  const isContinue = variant === "continue";

  // Find the most recent progress for this title
  const titleProgress = progress
    .filter((p) => p.title_id === title.id)
    .sort((a, b) => new Date(b.watched_at).getTime() - new Date(a.watched_at).getTime());

  const latestProgress = titleProgress[0];

  // For "continue" variant: find the episode to resume
  const resumeEpisode = latestProgress && allEpisodesFlat.length > 0
    ? allEpisodesFlat.find((e) => e.id === latestProgress.episode_id)
    : null;

  const resumeEpisodeGlobalIndex = resumeEpisode
    ? allEpisodesFlat.findIndex((e) => e.id === resumeEpisode.id) + 1
    : 1;

  const seasonEpInfo = resumeEpisode ? episodeSeasonMap[resumeEpisode.id] : null;

  // Progress bar: use actual seconds-based progress for the current episode
  const progressPct = (() => {
    if (isContinue && latestProgress) {
      const ds = latestProgress.duration_seconds || 0;
      const ps = latestProgress.progress_seconds || 0;
      if (ds > 0) return Math.min(100, (ps / ds) * 100);
    }
    // Fallback for poster: episode-based progress
    if (episodeCount > 0) {
      const watchedCount = progress.filter((p) => p.title_id === title.id && p.completed).length;
      return (watchedCount / episodeCount) * 100;
    }
    return 0;
  })();

  function handleClick() {
    if (isContinue && resumeEpisode) {
      // Go directly to player at the episode at the exact second they stopped
      const startSec = Math.max(0, Math.floor(latestProgress?.progress_seconds || 0));
      navigate(
        `/domiflix/assistir/${slugify(title.title)}/${resumeEpisodeGlobalIndex}/${startSec}`
      );
    } else {
      navigate(`/domiflix/${slugify(title.title)}`);
    }
  }

  // Continue = banner horizontal, Poster = thumbnail vertical
  const bgImage = isContinue
    ? (title.banner_url || title.thumbnail_url)
    : (title.thumbnail_url || title.banner_url);

  const desc = title.description || "";
  const MAX_DESC = 160;
  const truncatedDesc = desc.length > MAX_DESC ? desc.slice(0, MAX_DESC) + "..." : desc;

  // Build subtitle for continue watching hover
  const continueSubtitle = (() => {
    if (!isContinue || !resumeEpisode) return null;
    const parts: string[] = [];
    if (seasonEpInfo) {
      parts.push(`T${seasonEpInfo.seasonNumber} · E${seasonEpInfo.episodeInSeason}`);
    }
    parts.push(resumeEpisode.title);
    return parts.join(" — ");
  })();

  return (
    <div
      className={cn(
        "group relative flex-shrink-0 cursor-pointer rounded overflow-hidden",
        "transition-all duration-300 ease-out",
        isContinue
          ? "w-[300px] sm:w-[360px] md:w-[400px]"
          : "w-[180px] sm:w-[220px] md:w-[260px] lg:w-[280px]"
      )}
      onClick={handleClick}
    >
      {/* ── Thumbnail/Poster ── */}
      <div
        className={cn(
          "bg-[#181818] relative overflow-hidden",
          isContinue ? "aspect-video" : "aspect-[2/3]"
        )}
      >
        {bgImage ? (
          <>
            {/* Skeleton individual enquanto a imagem do card está baixando */}
            {!imageLoaded && (
              <div className="absolute inset-0 bg-[#1e1e1e] animate-pulse" />
            )}
            <img
              src={bgImage}
              alt={title.title}
              loading="lazy"
              decoding="async"
              onLoad={() => setImageLoaded(true)}
              onError={() => setImageLoaded(true)}
              className={cn(
                "w-full h-full object-cover transition-all duration-500",
                imageLoaded ? "opacity-100 group-hover:scale-[1.05]" : "opacity-0"
              )}
            />
          </>
        ) : (
          <div className="relative w-full h-full flex flex-col items-center justify-center px-3 text-center bg-gradient-to-br from-[#7f0a10] via-[#3a0507] to-[#0a0202] overflow-hidden">
            {/* Logo Domiflix esmaecido ao fundo */}
            <img
              src={domiflixLogo}
              aria-hidden="true"
              className="absolute inset-0 m-auto w-[140%] max-w-none opacity-[0.05] scale-150 select-none pointer-events-none"
            />
            {/* Nome do título em destaque */}
            <p
              className={cn(
                "relative z-10 text-white font-extrabold leading-tight uppercase tracking-tight text-balance line-clamp-4",
                "drop-shadow-[0_2px_8px_rgba(0,0,0,0.6)]",
                isContinue
                  ? "text-lg sm:text-xl md:text-2xl"
                  : "text-base sm:text-lg md:text-xl"
              )}
            >
              {title.title}
            </p>
          </div>
        )}

        {/* Barra de progresso */}
        {progressPct > 0 && (
          <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-[#4d4d4d] z-10">
            <div
              className="h-full bg-[#E50914] transition-all"
              style={{ width: `${Math.min(100, progressPct)}%` }}
            />
          </div>
        )}

        {/* ── Hover overlay com info ── */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/35 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-end p-3 sm:p-4">
          <p className="text-white text-sm sm:text-base font-bold leading-tight line-clamp-2 mb-1.5">
            {title.title}
          </p>

          {/* Continue watching: show season/episode info */}
          {isContinue && continueSubtitle && (
            <p className="text-white/75 text-xs sm:text-sm leading-snug mb-1.5 line-clamp-1">
              {continueSubtitle}
            </p>
          )}

          {truncatedDesc && !isContinue && (
            <p className="text-white/70 text-xs sm:text-sm leading-snug line-clamp-3 mb-2.5">
              {truncatedDesc}
              {desc.length > MAX_DESC && (
                <span className="text-white/85 font-medium ml-0.5">ver mais...</span>
              )}
            </p>
          )}
          {!isContinue && (
            <button
              onClick={(e) => { e.stopPropagation(); handleClick(); }}
              className="flex items-center justify-center gap-1.5 w-full py-1.5 sm:py-2 rounded-[4px] bg-white hover:bg-white/90 transition-colors text-black text-xs sm:text-sm font-bold"
            >
              <Play className="w-3 h-3 sm:w-3.5 sm:h-3.5 fill-black" />
              {t.browse.cardWatch}
            </button>
          )}
          {isContinue && (
            <button
              onClick={(e) => { e.stopPropagation(); handleClick(); }}
              className="flex items-center justify-center gap-1.5 w-full py-1.5 sm:py-2 rounded-[4px] bg-white hover:bg-white/90 transition-colors text-black text-xs sm:text-sm font-bold"
            >
              <Play className="w-3 h-3 sm:w-3.5 sm:h-3.5 fill-black" />
              {t.browse.cardContinue}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
