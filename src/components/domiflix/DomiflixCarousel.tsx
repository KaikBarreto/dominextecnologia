import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { DomiflixTitle, DomiflixProgress, DomiflixWatchlistItem, DomiflixEpisode } from "@/hooks/useDomiflix";
import { DomiflixCard } from "./DomiflixCard";
import { cn } from "@/lib/utils";

interface DomiflixCarouselProps {
  label: string;
  titles: DomiflixTitle[];
  progress: DomiflixProgress[];
  watchlist: DomiflixWatchlistItem[];
  episodeCounts?: Record<string, number>;
  variant?: "poster" | "continue";
  exploreUrl?: string;
  episodesByTitle?: Record<string, DomiflixEpisode[]>;
  episodeSeasonMap?: Record<string, { seasonNumber: number; episodeInSeason: number }>;
}

export function DomiflixCarousel({
  label, titles, progress, watchlist, episodeCounts = {}, variant = "poster",
  exploreUrl, episodesByTitle = {}, episodeSeasonMap = {},
}: DomiflixCarouselProps) {
  const navigate = useNavigate();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showLeft, setShowLeft] = useState(false);
  const [showRight, setShowRight] = useState(true);
  const [labelVisible, setLabelVisible] = useState(false);

  if (titles.length === 0) return null;

  function scroll(dir: "left" | "right") {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({ left: dir === "left" ? -el.clientWidth * 0.8 : el.clientWidth * 0.8, behavior: "smooth" });
  }

  function handleScroll() {
    const el = scrollRef.current;
    if (!el) return;
    setShowLeft(el.scrollLeft > 8);
    setShowRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 8);
  }

  return (
    <div
      className="mb-5 group/row"
      onMouseEnter={() => setLabelVisible(true)}
      onMouseLeave={() => setLabelVisible(false)}
    >
      <div className="flex items-center gap-2 mb-1 px-4 md:px-12">
        <h2 className="text-white text-base md:text-[1.1rem] font-bold">{label}</h2>
        {exploreUrl && (
          <button
            onClick={() => navigate(exploreUrl)}
            className={cn(
              "text-[#00C597] text-[11px] font-semibold flex items-center gap-0.5 transition-all duration-200 hover:underline",
              labelVisible ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-2"
            )}
          >
            Explorar todos
            <ChevronRight className="w-3 h-3" />
          </button>
        )}
      </div>

      <div className="relative">
        <button
          onClick={() => scroll("left")}
          aria-label="Anterior"
          className={cn(
            "absolute left-0 top-0 bottom-0 z-10 w-10 md:w-14 flex items-center justify-center bg-gradient-to-r from-black/90 to-transparent text-white opacity-0 group-hover/row:opacity-100 transition-opacity duration-200",
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
          aria-label="Próximo"
          className={cn(
            "absolute right-0 top-0 bottom-0 z-10 w-10 md:w-14 flex items-center justify-center bg-gradient-to-l from-black/90 to-transparent text-white opacity-0 group-hover/row:opacity-100 transition-opacity duration-200",
            showRight ? "pointer-events-auto" : "pointer-events-none invisible"
          )}
        >
          <ChevronRight className="w-7 h-7 md:w-8 md:h-8" />
        </button>
      </div>
    </div>
  );
}
