import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Clapperboard } from "lucide-react";
import {
  useDomiflixTitles, useDomiflixFeatured, useDomiflixProgress, useDomiflixWatchlist,
  useDomiflixEpisodeCounts, useDomiflixAllEpisodes, DomiflixTitle,
} from "@/hooks/useDomiflix";
import { useDomiflixSectionsWithTitles } from "@/hooks/useDomiflixSections";
import { DomiflixHero } from "@/components/domiflix/DomiflixHero";
import { DomiflixCarousel } from "@/components/domiflix/DomiflixCarousel";
import { DomiflixPageSkeleton, DomiflixFilteredPageSkeleton } from "@/components/domiflix/DomiflixSkeletons";

export default function DomiflixHome() {
  const [searchParams] = useSearchParams();
  const filterType = searchParams.get("tipo");

  const { data: titles = [], isLoading: titlesLoading } = useDomiflixTitles();
  const { data: featured } = useDomiflixFeatured();
  const { data: progress = [] } = useDomiflixProgress();
  const { data: watchlist = [] } = useDomiflixWatchlist();
  const { data: episodeCounts = {} } = useDomiflixEpisodeCounts();
  const { data: allEpisodesData } = useDomiflixAllEpisodes();
  const { data: sections = [], isLoading: sectionsLoading } = useDomiflixSectionsWithTitles();
  const episodesByTitle = allEpisodesData?.byTitle ?? {};
  const episodeSeasonMap = allEpisodesData?.seasonMap ?? {};

  const titlesById = useMemo(() => {
    const m = new Map<string, DomiflixTitle>();
    titles.forEach((t) => m.set(t.id, t));
    return m;
  }, [titles]);

  const series = useMemo(() => titles.filter((t) => t.type === "series"), [titles]);
  const movies = useMemo(() => titles.filter((t) => t.type === "movie"), [titles]);

  const visibleTitles = useMemo(() => {
    if (filterType === "modulos") return series;
    if (filterType === "lives") return movies;
    return titles;
  }, [filterType, titles, series, movies]);

  const continueWatching = useMemo(() => {
    const titleIds = new Set(progress.map((p) => p.title_id));
    return visibleTitles.filter((t) => titleIds.has(t.id));
  }, [visibleTitles, progress]);

  const continueWatchingHero = useMemo(() => {
    if (progress.length === 0) return null;
    const sorted = [...progress].filter((p) => !p.completed)
      .sort((a, b) => new Date(b.watched_at).getTime() - new Date(a.watched_at).getTime());
    const mostRecentTitleId = sorted[0]?.title_id;
    return titles.find((t) => t.id === mostRecentTitleId) ?? null;
  }, [progress, titles]);

  const myList = useMemo(() => {
    const titleIds = new Set(watchlist.map((w) => w.title_id));
    return visibleTitles.filter((t) => titleIds.has(t.id));
  }, [visibleTitles, watchlist]);

  const sectionCarousels = useMemo(() => {
    return sections.map((section) => {
      const sectionTitles = section.titleIds
        .map((id) => titlesById.get(id))
        .filter((t): t is DomiflixTitle => Boolean(t))
        .filter((t) => {
          if (filterType === "modulos") return t.type === "series";
          if (filterType === "lives") return t.type === "movie";
          return true;
        });
      return { section, titles: sectionTitles };
    }).filter((s) => s.titles.length > 0);
  }, [sections, titlesById, filterType]);

  const isEmpty = !titlesLoading && visibleTitles.length === 0;
  const filterLabel = filterType === "modulos" ? "Módulos" : filterType === "lives" ? "Lives" : null;
  const filterSubtitle = filterType === "modulos"
    ? "Séries completas para dominar cada funcionalidade do Dominex"
    : filterType === "lives" ? "Gravações de lives e treinamentos ao vivo" : null;

  if (titlesLoading || sectionsLoading) {
    return filterType ? <DomiflixFilteredPageSkeleton /> : <DomiflixPageSkeleton />;
  }

  return (
    <div className="min-h-screen bg-[#141414] pt-0">
      {!filterType && (
        <DomiflixHero
          title={featured ?? null}
          continueWatchingTitle={continueWatchingHero}
          watchlist={watchlist}
          progress={progress}
        />
      )}

      <div className="pb-16 relative z-10" style={{ marginTop: filterType ? "56px" : "-60px" }}>
        {filterLabel && (
          <div className="pt-10 pb-6 px-4 md:px-12 text-center">
            <h1 className="text-white text-2xl md:text-3xl font-bold mb-2">{filterLabel}</h1>
            {filterSubtitle && <p className="text-white/40 text-sm md:text-base max-w-xl mx-auto">{filterSubtitle}</p>}
          </div>
        )}

        {isEmpty ? (
          <div className="flex flex-col items-center justify-center py-32 gap-4">
            <Clapperboard className="w-20 h-20 opacity-20 text-white" />
            <p className="text-xl font-semibold text-white/30">Nenhum conteúdo disponível ainda</p>
            <p className="text-sm text-white/20">O conteúdo será adicionado pelo administrador</p>
          </div>
        ) : (
          <>
            {continueWatching.length > 0 && (
              <DomiflixCarousel label="Continuar Assistindo" titles={continueWatching} progress={progress}
                watchlist={watchlist} episodeCounts={episodeCounts} variant="continue"
                episodesByTitle={episodesByTitle} episodeSeasonMap={episodeSeasonMap} />
            )}
            {myList.length > 0 && (
              <DomiflixCarousel label="Minha Lista" titles={myList} progress={progress} watchlist={watchlist}
                episodeCounts={episodeCounts} episodesByTitle={episodesByTitle} episodeSeasonMap={episodeSeasonMap} />
            )}
            {sectionCarousels.map(({ section, titles: sectionTitles }) => (
              <DomiflixCarousel key={section.id} label={section.label} titles={sectionTitles}
                progress={progress} watchlist={watchlist} episodeCounts={episodeCounts}
                episodesByTitle={episodesByTitle} episodeSeasonMap={episodeSeasonMap} />
            ))}
            {/* Fallback: if no sections configured, show all */}
            {sectionCarousels.length === 0 && visibleTitles.length > 0 && (
              <DomiflixCarousel label="Todos os títulos" titles={visibleTitles} progress={progress}
                watchlist={watchlist} episodeCounts={episodeCounts}
                episodesByTitle={episodesByTitle} episodeSeasonMap={episodeSeasonMap} />
            )}
          </>
        )}
      </div>
    </div>
  );
}
