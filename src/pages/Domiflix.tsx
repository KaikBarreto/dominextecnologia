import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Clapperboard, Search, X } from "lucide-react";
import {
  useDomiflixTitles,
  useDomiflixFeatured,
  useDomiflixProgress,
  useDomiflixWatchlist,
  useDomiflixEpisodeCounts,
  useDomiflixAllEpisodes,
  DomiflixTitle,
} from "@/hooks/useDomiflix";
import { useDomiflixSectionsWithTitles } from "@/hooks/useDomiflixSections";
import { DomiflixHero } from "@/components/domiflix/DomiflixHero";
import { DomiflixCarousel } from "@/components/domiflix/DomiflixCarousel";
import { DomiflixSearchResults } from "@/components/domiflix/DomiflixSearchResults";
import { DomiflixPageSkeleton, DomiflixFilteredPageSkeleton } from "@/components/domiflix/DomiflixSkeletons";
import { useAppLocaleContext } from "@/contexts/AppLocaleContext";
import { MESSAGES } from "@/lib/i18n/messages";

export default function DomiflixHome() {
  const [searchParams] = useSearchParams();
  const filterType = searchParams.get("tipo");
  const navSearch = searchParams.get("busca") || "";
  const [searchQuery, setSearchQuery] = useState("");
  const { locale } = useAppLocaleContext();
  const t = MESSAGES[locale].app.domiflix;

  const effectiveSearch = searchQuery || navSearch;

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

  // "Continuar assistindo" é uma FILA, não lista: o último título assistido
  // aparece primeiro. progress já vem ordenado por watched_at DESC (query em
  // useDomiflixProgress). Iteramos progress preservando essa ordem,
  // deduplicando títulos com múltiplos episódios em progresso (pega o mais
  // recente do mesmo título).
  const continueWatching = useMemo(() => {
    const titleById = new Map(visibleTitles.map((t) => [t.id, t]));
    const seen = new Set<string>();
    const ordered: typeof visibleTitles = [];
    for (const p of progress) {
      if (seen.has(p.title_id)) continue;
      seen.add(p.title_id);
      const title = titleById.get(p.title_id);
      if (title) ordered.push(title);
    }
    return ordered;
  }, [visibleTitles, progress]);

  const continueWatchingHero = useMemo(() => {
    if (progress.length === 0) return null;
    const incompleteTitleIds = new Set(
      progress.filter((p) => !p.completed).map((p) => p.title_id),
    );
    if (incompleteTitleIds.size === 0) return null;
    const sorted = [...progress]
      .filter((p) => !p.completed)
      .sort((a, b) => new Date(b.watched_at).getTime() - new Date(a.watched_at).getTime());
    const mostRecentTitleId = sorted[0]?.title_id;
    return titles.find((t) => t.id === mostRecentTitleId) ?? null;
  }, [progress, titles]);

  const myList = useMemo(() => {
    const titleIds = new Set(watchlist.map((w) => w.title_id));
    return visibleTitles.filter((t) => titleIds.has(t.id));
  }, [visibleTitles, watchlist]);

  // Sections rendered as carousels — apply current filter (modulos/lives)
  const sectionCarousels = useMemo(() => {
    return sections
      .map((section) => {
        const sectionTitles = section.titleIds
          .map((id) => titlesById.get(id))
          .filter((t): t is DomiflixTitle => Boolean(t))
          .filter((t) => {
            if (filterType === "modulos") return t.type === "series";
            if (filterType === "lives") return t.type === "movie";
            return true;
          });
        return { section, titles: sectionTitles };
      })
      .filter((s) => s.titles.length > 0);
  }, [sections, titlesById, filterType]);

  // Search — title, description, tags + episode title/description
  const isSearching = effectiveSearch.trim().length >= 2;
  const searchResults = useMemo(() => {
    if (!isSearching) return [];
    const q = effectiveSearch.trim().toLowerCase();
    const matchedTitleIds = new Set<string>();
    Object.entries(episodesByTitle).forEach(([titleId, eps]) => {
      const hit = eps.some(
        (ep) =>
          ep.title?.toLowerCase().includes(q) ||
          ep.description?.toLowerCase().includes(q),
      );
      if (hit) matchedTitleIds.add(titleId);
    });
    return visibleTitles.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        t.description?.toLowerCase().includes(q) ||
        t.tags?.some((tag) => tag.toLowerCase().includes(q)) ||
        matchedTitleIds.has(t.id),
    );
  }, [visibleTitles, effectiveSearch, isSearching, episodesByTitle]);

  const isEmpty = !titlesLoading && visibleTitles.length === 0;

  const filterLabel = filterType === "modulos" ? t.browse.modulesTitle : filterType === "lives" ? t.browse.livesTitle : null;
  const filterSubtitle = filterType === "modulos"
    ? t.browse.modulesSubtitle
    : filterType === "lives"
    ? t.browse.livesSubtitle
    : null;

  if (titlesLoading || sectionsLoading) {
    return filterType ? <DomiflixFilteredPageSkeleton /> : <DomiflixPageSkeleton />;
  }

  return (
    <div className="min-h-screen bg-[#141414] pt-0 animate-fade-in">
      {!filterType && (
        <DomiflixHero
          title={featured ?? null}
          continueWatchingTitle={continueWatchingHero}
          watchlist={watchlist}
          progress={progress}
        />
      )}

      <div
        className="pb-16 relative z-10"
        style={{ marginTop: filterType ? "56px" : "-60px" }}
      >
        {filterLabel && (
          <div className="pt-10 pb-6 px-4 md:px-12">
            <div className="text-center mb-6">
              <h1 className="text-white text-2xl md:text-3xl font-bold mb-2">{filterLabel}</h1>
              {filterSubtitle && (
                <p className="text-white/40 text-sm md:text-base max-w-xl mx-auto">{filterSubtitle}</p>
              )}
            </div>

            <div className="flex justify-center">
              <div className="relative w-full max-w-md">
                <div className="flex items-center bg-[#1a1a1a] border border-white/30 rounded-md overflow-hidden">
                  <div className="flex items-center justify-center w-10 h-10 text-white/70 flex-shrink-0">
                    <Search className="w-4.5 h-4.5" />
                  </div>

                  <input
                    type="text"
                    placeholder={t.browse.searchInPlaceholder.replace('{{filter}}', (filterLabel ?? '').toLowerCase())}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="bg-transparent text-white text-sm placeholder-white/30 outline-none h-10 w-full pr-3"
                  />

                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery("")}
                      className="flex items-center justify-center w-10 h-10 text-white/50 hover:text-white transition-colors flex-shrink-0"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {filterLabel && isSearching && (
          <DomiflixSearchResults
            results={searchResults}
            query={effectiveSearch}
            episodeCounts={episodeCounts}
            episodesByTitle={episodesByTitle}
            episodeSeasonMap={episodeSeasonMap}
          />
        )}

        {isEmpty ? (
          <div className="flex flex-col items-center justify-center py-32 gap-4">
            <Clapperboard className="w-20 h-20 opacity-20 text-white" />
            <p className="text-xl font-semibold text-white/30">{t.browse.emptyContent}</p>
            <p className="text-sm text-white/20">{t.browse.emptyContentAdmin}</p>
          </div>
        ) : (
          <>
            {continueWatching.length > 0 && (
              <DomiflixCarousel
                label={t.browse.continueWatching}
                titles={continueWatching}
                progress={progress}
                watchlist={watchlist}
                episodeCounts={episodeCounts}
                variant="continue"
                episodesByTitle={episodesByTitle}
                episodeSeasonMap={episodeSeasonMap}
              />
            )}

            {myList.length > 0 && (
              <DomiflixCarousel
                label={t.browse.myList}
                titles={myList}
                progress={progress}
                watchlist={watchlist}
                episodeCounts={episodeCounts}
                episodesByTitle={episodesByTitle}
                episodeSeasonMap={episodeSeasonMap}
              />
            )}

            {/* Carrosséis configuráveis (gerenciados pelo admin) */}
            {sectionCarousels.map(({ section, titles: sectionTitles }) => (
              <DomiflixCarousel
                key={section.id}
                label={section.label}
                titles={sectionTitles}
                progress={progress}
                watchlist={watchlist}
                episodeCounts={episodeCounts}
                episodesByTitle={episodesByTitle}
                episodeSeasonMap={episodeSeasonMap}
                showProgress
              />
            ))}
          </>
        )}
      </div>
    </div>
  );
}
