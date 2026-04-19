import { useNavigate } from "react-router-dom";
import { Play, Film, Tv, ChevronRight } from "lucide-react";
import { useState } from "react";
import { DomiflixTitle, DomiflixEpisode } from "@/hooks/useDomiflix";
import { slugify } from "@/lib/slugify";
import { cn } from "@/lib/utils";

interface DomiflixSearchResultsProps {
  results: DomiflixTitle[];
  query: string;
  episodeCounts?: Record<string, number>;
  episodesByTitle?: Record<string, DomiflixEpisode[]>;
  episodeSeasonMap?: Record<string, { seasonNumber: number; episodeInSeason: number }>;
}

const MAX_DESC = 180;

export function DomiflixSearchResults({
  results,
  query,
  episodeCounts = {},
  episodesByTitle = {},
  episodeSeasonMap = {},
}: DomiflixSearchResultsProps) {
  const navigate = useNavigate();
  const q = query.trim().toLowerCase();

  if (results.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3 px-4">
        <p className="text-white/40 text-lg font-medium">
          Nenhum resultado para "<span className="text-white/60">{query}</span>"
        </p>
        <p className="text-white/25 text-sm">Tente buscar com outros termos</p>
      </div>
    );
  }

  return (
    <div className="px-4 md:px-12 space-y-3">
      <p className="text-white/50 text-sm mb-4">
        {results.length} resultado{results.length !== 1 ? "s" : ""} para "
        <span className="text-white/70">{query}</span>"
      </p>

      {results.map((title) => {
        const eps = episodesByTitle[title.id] ?? [];
        const matchingEps = q.length >= 2
          ? eps.filter((ep) => ep.title?.toLowerCase().includes(q) || ep.description?.toLowerCase().includes(q))
          : [];

        return (
          <SearchResultCard
            key={title.id}
            title={title}
            epCount={episodeCounts[title.id] ?? eps.length}
            matchingEpisodes={matchingEps}
            episodeSeasonMap={episodeSeasonMap}
            onOpenTitle={() => navigate(`/domiflix/${slugify(title.title)}`)}
            onPlayEpisode={(ep) => {
              const idx = eps.findIndex((e) => e.id === ep.id);
              const epNumber = idx >= 0 ? idx + 1 : 1;
              navigate(`/domiflix/assistir/${slugify(title.title)}/${epNumber}`);
            }}
          />
        );
      })}
    </div>
  );
}

interface SearchResultCardProps {
  title: DomiflixTitle;
  epCount: number;
  matchingEpisodes: DomiflixEpisode[];
  episodeSeasonMap: Record<string, { seasonNumber: number; episodeInSeason: number }>;
  onOpenTitle: () => void;
  onPlayEpisode: (ep: DomiflixEpisode) => void;
}

function SearchResultCard({ title, epCount, matchingEpisodes, episodeSeasonMap, onOpenTitle, onPlayEpisode }: SearchResultCardProps) {
  const bgImage = title.banner_url || title.thumbnail_url;
  const desc = title.description || "";
  const [expanded, setExpanded] = useState(false);
  const truncatedDesc = desc.length > MAX_DESC && !expanded ? desc.slice(0, MAX_DESC) + "…" : desc;
  const hasMatchingEps = matchingEpisodes.length > 0;
  const epCountLabel = title.type === "series" ? "episódios" : "gravações";

  return (
    <div className="rounded-lg overflow-hidden bg-[#1a1a1a] hover:bg-[#222] transition-colors">
      <div onClick={onOpenTitle} className="flex gap-4 cursor-pointer group">
        <div className="relative w-[200px] sm:w-[260px] flex-shrink-0 aspect-video overflow-hidden">
          {bgImage ? (
            <img src={bgImage} alt={title.title} loading="lazy" decoding="async"
              className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-[#2a2a2a] to-[#181818]">
              {title.type === "movie" ? <Film className="w-8 h-8 text-[#555]" /> : <Tv className="w-8 h-8 text-[#555]" />}
            </div>
          )}
          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
            <div className="w-10 h-10 rounded-full bg-white/90 flex items-center justify-center">
              <Play className="w-4 h-4 text-black fill-black ml-0.5" />
            </div>
          </div>
        </div>

        <div className="flex-1 py-3 pr-4 flex flex-col justify-center min-w-0 gap-1.5">
          <div className="flex items-start justify-between gap-3">
            <h3 className="text-white font-semibold text-base leading-tight line-clamp-1 min-w-0">{title.title}</h3>
            {epCount > 0 && (
              <span className="text-white/55 text-xs font-light shrink-0 mt-0.5 whitespace-nowrap">
                {epCount} {epCountLabel}
              </span>
            )}
          </div>

          {desc && (
            <p className={cn("text-white/55 text-sm leading-relaxed", expanded ? "" : "line-clamp-3")}>
              {truncatedDesc}
              {desc.length > MAX_DESC && (
                <button onClick={(e) => { e.stopPropagation(); setExpanded((v) => !v); }}
                  className="text-white/75 font-medium ml-1 hover:underline">
                  {expanded ? "ver menos" : "ver mais..."}
                </button>
              )}
            </p>
          )}

          {title.tags?.length > 0 && (
            <div className="flex gap-1.5 flex-wrap mt-0.5">
              {title.tags.slice(0, 3).map((tag) => (
                <span key={tag} className="text-[10px] border border-white/15 text-white/45 rounded-sm py-0.5 px-1.5">{tag}</span>
              ))}
            </div>
          )}
        </div>
      </div>

      {hasMatchingEps && (
        <div className="border-t border-white/[0.06] bg-black/20">
          <p className="text-[11px] uppercase tracking-wider text-white/40 font-semibold px-4 sm:px-6 pt-3 pb-2">
            {matchingEpisodes.length} episódio{matchingEpisodes.length !== 1 ? "s" : ""} correspondente{matchingEpisodes.length !== 1 ? "s" : ""}
          </p>
          <div className="pb-2">
            {matchingEpisodes.slice(0, 6).map((ep) => {
              const info = episodeSeasonMap[ep.id];
              const label = info ? `T${info.seasonNumber} · Ep. ${info.episodeInSeason}` : null;
              return (
                <button key={ep.id} onClick={(e) => { e.stopPropagation(); onPlayEpisode(ep); }}
                  className="w-full text-left flex items-center gap-3 px-4 sm:px-6 py-2 pl-8 sm:pl-12 hover:bg-white/[0.04] transition-colors group/ep">
                  <Play className="w-3.5 h-3.5 text-white/40 group-hover/ep:text-white shrink-0 fill-current" />
                  {label && <span className="text-[11px] font-semibold text-white/45 shrink-0 w-14">{label}</span>}
                  <span className="text-sm text-white/80 truncate flex-1">{ep.title}</span>
                  <ChevronRight className="w-4 h-4 text-white/25 group-hover/ep:text-white/60 shrink-0" />
                </button>
              );
            })}
            {matchingEpisodes.length > 6 && (
              <button onClick={(e) => { e.stopPropagation(); onOpenTitle(); }}
                className="w-full text-left text-xs text-white/45 hover:text-white/70 px-4 sm:px-6 py-2 pl-8 sm:pl-12">
                + {matchingEpisodes.length - 6} outros episódios — ver todos
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
