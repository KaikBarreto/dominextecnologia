import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { DomiflixTitle, DomiflixProgress, DomiflixWatchlistItem, DomiflixEpisode } from "@/hooks/useDomiflix";
import { DomiflixCard } from "./DomiflixCard";
import { cn } from "@/lib/utils";
import { useScrollReveal } from "@/hooks/useScrollReveal";
import { useAppLocaleContext } from "@/contexts/AppLocaleContext";
import { MESSAGES } from "@/lib/i18n/messages";

interface DomiflixCarouselProps {
  label: string;
  titles: DomiflixTitle[];
  progress: DomiflixProgress[];
  watchlist: DomiflixWatchlistItem[];
  episodeCounts?: Record<string, number>;
  /** "poster" = vertical cards (default), "continue" = horizontal banner cards */
  variant?: "poster" | "continue";
  /** URL to navigate when clicking "Explorar todos" */
  exploreUrl?: string;
  /** All episodes by title_id — for continue watching direct navigation */
  episodesByTitle?: Record<string, DomiflixEpisode[]>;
  /** Map episodeId → season/episode info */
  episodeSeasonMap?: Record<string, { seasonNumber: number; episodeInSeason: number }>;
  /** Mostra "XX% concluído" + barra de progresso da seção (default false) */
  showProgress?: boolean;
}

export function DomiflixCarousel({
  label,
  titles,
  progress,
  watchlist,
  episodeCounts = {},
  variant = "poster",
  exploreUrl,
  episodesByTitle = {},
  episodeSeasonMap = {},
  showProgress = false,
}: DomiflixCarouselProps) {
  const navigate = useNavigate();
  const { locale } = useAppLocaleContext();
  const t = MESSAGES[locale].app.domiflix;
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showLeft, setShowLeft] = useState(false);
  const [showRight, setShowRight] = useState(true);
  const [labelVisible, setLabelVisible] = useState(false);
  const revealRef = useScrollReveal<HTMLDivElement>();

  if (titles.length === 0) return null;

  // Progresso da seção: total de episódios completados / total de episódios dos títulos da seção
  const sectionTotalEpisodes = showProgress
    ? titles.reduce((sum, t) => sum + (episodeCounts[t.id] ?? 0), 0)
    : 0;
  const sectionWatchedEpisodes = showProgress
    ? (() => {
        const titleIdSet = new Set(titles.map((t) => t.id));
        return progress.filter((p) => titleIdSet.has(p.title_id) && p.completed).length;
      })()
    : 0;
  const sectionPct =
    showProgress && sectionTotalEpisodes > 0
      ? Math.round((sectionWatchedEpisodes / sectionTotalEpisodes) * 100)
      : 0;
  const renderSectionProgress = showProgress && sectionTotalEpisodes > 0;

  function scroll(dir: "left" | "right") {
    const el = scrollRef.current;
    if (!el) return;
    const amount = el.clientWidth * 0.8;
    el.scrollBy({ left: dir === "left" ? -amount : amount, behavior: "smooth" });
  }

  function handleScroll() {
    const el = scrollRef.current;
    if (!el) return;
    setShowLeft(el.scrollLeft > 8);
    setShowRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 8);
  }

  return (
    <div
      ref={revealRef}
      className="mb-5 group/row scroll-reveal"
      onMouseEnter={() => setLabelVisible(true)}
      onMouseLeave={() => setLabelVisible(false)}
    >
      {/* Label da linha */}
      <div className="flex items-center gap-2 mb-1 px-4 md:px-12">
        <h2 className="text-white text-base md:text-[1.1rem] font-bold">{label}</h2>
        {renderSectionProgress && (
          <span className="text-xs md:text-sm text-white/60">
            {t.browse.sectionProgress.replace('{{pct}}', String(sectionPct))}
          </span>
        )}
        {exploreUrl && (
          <button
            onClick={() => navigate(exploreUrl)}
            className={cn(
              "text-[#e50914] text-[11px] font-semibold flex items-center gap-0.5 transition-all duration-200 hover:underline",
              labelVisible ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-2"
            )}
          >
            {t.browse.exploreAll}
            <ChevronRight className="w-3 h-3" />
          </button>
        )}
      </div>

      {/* Barra de progresso da seção */}
      {renderSectionProgress && (
        <div className="px-4 md:px-12 mb-3">
          <div className="h-1 rounded-full bg-white/10 overflow-hidden">
            <div
              className="h-full bg-[#E50914] rounded-full transition-all duration-500"
              style={{ width: `${sectionPct}%` }}
            />
          </div>
        </div>
      )}

      {/* Track com arrows */}
      <div className="relative">
        <button
          onClick={() => scroll("left")}
          aria-label={t.browse.previous}
          className={cn(
            "absolute left-0 top-0 bottom-0 z-10 w-10 md:w-14 flex items-center justify-center",
            "bg-gradient-to-r from-black/90 to-transparent",
            "text-white opacity-0 group-hover/row:opacity-100 transition-opacity duration-200",
            showLeft ? "pointer-events-auto" : "pointer-events-none invisible"
          )}
        >
          <ChevronLeft className="w-7 h-7 md:w-8 md:h-8" />
        </button>

        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="flex gap-1.5 overflow-x-auto px-4 md:px-12 py-3 snap-x snap-mandatory md:snap-none touch-pan-x overscroll-x-contain"
          style={{ scrollbarWidth: "none", msOverflowStyle: "none", WebkitOverflowScrolling: "touch" }}
        >
          {titles.map((title) => (
            <div key={title.id} className="snap-start md:snap-align-none">
              <DomiflixCard
                title={title}
                progress={progress}
                watchlist={watchlist}
                episodeCount={episodeCounts[title.id] ?? 0}
                variant={variant}
                allEpisodesFlat={episodesByTitle[title.id] ?? []}
                episodeSeasonMap={episodeSeasonMap}
              />
            </div>
          ))}
        </div>

        <button
          onClick={() => scroll("right")}
          aria-label={t.browse.next}
          className={cn(
            "absolute right-0 top-0 bottom-0 z-10 w-10 md:w-14 flex items-center justify-center",
            "bg-gradient-to-l from-black/90 to-transparent",
            "text-white opacity-0 group-hover/row:opacity-100 transition-opacity duration-200",
            showRight ? "pointer-events-auto" : "pointer-events-none invisible"
          )}
        >
          <ChevronRight className="w-7 h-7 md:w-8 md:h-8" />
        </button>
      </div>
    </div>
  );
}
