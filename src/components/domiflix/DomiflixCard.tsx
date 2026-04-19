import { useNavigate } from "react-router-dom";
import { Play, Film, Tv } from "lucide-react";
import { DomiflixTitle, DomiflixProgress, DomiflixWatchlistItem, DomiflixEpisode } from "@/hooks/useDomiflix";
import { slugify } from "@/lib/slugify";
import { cn } from "@/lib/utils";

interface DomiflixCardProps {
  title: DomiflixTitle;
  progress: DomiflixProgress[];
  watchlist: DomiflixWatchlistItem[];
  episodeCount?: number;
  variant?: "poster" | "continue";
  allEpisodesFlat?: DomiflixEpisode[];
  episodeSeasonMap?: Record<string, { seasonNumber: number; episodeInSeason: number }>;
}

export function DomiflixCard({
  title, progress, episodeCount = 0, variant = "poster",
  allEpisodesFlat = [], episodeSeasonMap = {},
}: DomiflixCardProps) {
  const navigate = useNavigate();
  const isContinue = variant === "continue";

  const titleProgress = progress
    .filter((p) => p.title_id === title.id)
    .sort((a, b) => new Date(b.watched_at).getTime() - new Date(a.watched_at).getTime());
  const latestProgress = titleProgress[0];

  const resumeEpisode = latestProgress && allEpisodesFlat.length > 0
    ? allEpisodesFlat.find((e) => e.id === latestProgress.episode_id)
    : null;

  const resumeEpisodeGlobalIndex = resumeEpisode
    ? allEpisodesFlat.findIndex((e) => e.id === resumeEpisode.id) + 1
    : 1;

  const seasonEpInfo = resumeEpisode ? episodeSeasonMap[resumeEpisode.id] : null;

  const progressPct = (() => {
    if (isContinue && latestProgress) {
      const ds = latestProgress.duration_seconds || 0;
      const ps = latestProgress.progress_seconds || 0;
      if (ds > 0) return Math.min(100, (ps / ds) * 100);
    }
    if (episodeCount > 0) {
      const watchedCount = progress.filter((p) => p.title_id === title.id && p.completed).length;
      return (watchedCount / episodeCount) * 100;
    }
    return 0;
  })();

  function handleClick() {
    if (isContinue && resumeEpisode) {
      const startSec = Math.max(0, Math.floor(latestProgress?.progress_seconds || 0));
      navigate(`/domiflix/assistir/${slugify(title.title)}/${resumeEpisodeGlobalIndex}/${startSec}`);
    } else {
      navigate(`/domiflix/${slugify(title.title)}`);
    }
  }

  const bgImage = isContinue ? (title.banner_url || title.thumbnail_url) : (title.thumbnail_url || title.banner_url);
  const desc = title.description || "";
  const truncatedDesc = desc.length > 100 ? desc.slice(0, 100) + "..." : desc;

  const continueSubtitle = (() => {
    if (!isContinue || !resumeEpisode) return null;
    const parts: string[] = [];
    if (seasonEpInfo) parts.push(`T${seasonEpInfo.seasonNumber} · E${seasonEpInfo.episodeInSeason}`);
    parts.push(resumeEpisode.title);
    return parts.join(" — ");
  })();

  return (
    <div
      className={cn(
        "group relative flex-shrink-0 cursor-pointer rounded overflow-hidden transition-all duration-300 ease-out",
        isContinue ? "w-[260px] sm:w-[300px]" : "w-[150px] sm:w-[180px] md:w-[195px]"
      )}
      onClick={handleClick}
    >
      <div className={cn("bg-[#181818] relative overflow-hidden", isContinue ? "aspect-video" : "aspect-[2/3]")}>
        {bgImage ? (
          <img src={bgImage} alt={title.title} loading="lazy" decoding="async"
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.05]" />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-[#2a2a2a] to-[#141414]">
            {title.type === "movie" ? <Film className="w-10 h-10 text-[#555]" /> : <Tv className="w-10 h-10 text-[#555]" />}
          </div>
        )}

        {progressPct > 0 && (
          <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-[#4d4d4d] z-10">
            <div className="h-full bg-[#e50914] transition-all" style={{ width: `${Math.min(100, progressPct)}%` }} />
          </div>
        )}

        <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-end p-2.5">
          <p className="text-white text-[11px] sm:text-xs font-semibold leading-tight line-clamp-2 mb-1">{title.title}</p>
          {isContinue && continueSubtitle && (
            <p className="text-white/70 text-[10px] leading-snug mb-1 line-clamp-1">{continueSubtitle}</p>
          )}
          {truncatedDesc && !isContinue && (
            <p className="text-white/50 text-[9px] leading-snug line-clamp-3 mb-1.5">{truncatedDesc}</p>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); handleClick(); }}
            className="flex items-center justify-center gap-1 w-full py-1 rounded-sm bg-white hover:bg-white/90 transition-colors text-black text-[9px] sm:text-[10px] font-bold"
          >
            <Play className="w-2.5 h-2.5 fill-black" />
            {isContinue ? "Continuar" : "Ver episódios"}
          </button>
        </div>
      </div>
    </div>
  );
}
