import { useState, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Play,
  Plus,
  Check,
  Clock,
  ExternalLink,
  Calendar,
  Film,
  Tv,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useDomiflixTitleBySlug,
  useDomiflixTitle,
  useDomiflixProgress,
  useDomiflixWatchlist,
  useToggleWatchlist,
  DomiflixEpisode,
  DomiflixSeason,
} from "@/hooks/useDomiflix";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useAppLocaleContext } from "@/contexts/AppLocaleContext";
import { MESSAGES } from "@/lib/i18n/messages";

export default function DomiflixTitle() {
  const { titleSlug } = useParams<{ titleSlug: string }>();
  const navigate = useNavigate();
  const { locale } = useAppLocaleContext();
  const t = MESSAGES[locale].app.domiflix;

  const { data: resolvedId, isLoading: slugLoading } = useDomiflixTitleBySlug(titleSlug);
  const { data: titleData, isLoading: titleLoading } = useDomiflixTitle(resolvedId ?? undefined);
  const { data: progress = [] } = useDomiflixProgress();
  const { data: watchlist = [] } = useDomiflixWatchlist();
  const toggleWatchlist = useToggleWatchlist();

  const isLoading = slugLoading || titleLoading;
  const titleId = resolvedId ?? "";

  const [selectedSeasonId, setSelectedSeasonId] = useState<string | null>(null);

  const isInWatchlist = watchlist.some((w) => w.title_id === titleId);

  // Flat list of all episodes for numbering in watch URL
  const allEpisodesFlat: DomiflixEpisode[] = useMemo(() => {
    if (!titleData) return [];
    return titleData.type === "series"
      ? titleData.seasons.flatMap((s) => s.episodes)
      : titleData.episodes;
  }, [titleData]);

  function isWatched(episodeId: string) {
    return progress.some((p) => p.episode_id === episodeId && p.completed);
  }

  function getEpisodeProgress(episodeId: string): number {
    const p = progress.find((pr) => pr.episode_id === episodeId);
    if (!p) return 0;
    if (p.completed) return 100;
    if (p.duration_seconds > 0) return Math.min(100, (p.progress_seconds / p.duration_seconds) * 100);
    return 0;
  }

  // Latest progress for this title (most recently watched episode)
  const latestProgress = useMemo(() => {
    return progress
      .filter((p) => p.title_id === titleId)
      .sort((a, b) => new Date(b.watched_at).getTime() - new Date(a.watched_at).getTime())[0];
  }, [progress, titleId]);

  // Default season: season of latest watched episode, or season 1
  const defaultSeasonId = useMemo(() => {
    if (!titleData || titleData.type !== "series" || titleData.seasons.length === 0) return null;
    if (latestProgress) {
      const found = titleData.seasons.find((s) =>
        s.episodes.some((e) => e.id === latestProgress.episode_id)
      );
      if (found) return found.id;
    }
    return titleData.seasons[0].id;
  }, [titleData, latestProgress]);

  const activeSeasonId = selectedSeasonId ?? defaultSeasonId;

  const activeSeason: (DomiflixSeason & { episodes: DomiflixEpisode[] }) | undefined =
    titleData?.type === "series"
      ? titleData.seasons.find((s) => s.id === activeSeasonId) ?? titleData.seasons[0]
      : undefined;

  const episodesToShow: DomiflixEpisode[] =
    titleData?.type === "series"
      ? activeSeason?.episodes ?? []
      : titleData?.episodes ?? [];

  // Progress aggregates
  const totalEpisodes = allEpisodesFlat.length;
  const watchedEpisodes = useMemo(
    () => allEpisodesFlat.filter((e) => isWatched(e.id)).length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allEpisodesFlat, progress]
  );
  const titleProgressPct = totalEpisodes > 0 ? (watchedEpisodes / totalEpisodes) * 100 : 0;

  // Resume info for "Continuar" subtitle
  const resumeInfo = useMemo(() => {
    if (!latestProgress || !titleData) return null;
    const ep = allEpisodesFlat.find((e) => e.id === latestProgress.episode_id);
    if (!ep) return null;
    const season =
      titleData.type === "series"
        ? titleData.seasons.find((s) => s.episodes.some((e) => e.id === ep.id))
        : null;
    const episodeInSeason = season ? season.episodes.findIndex((e) => e.id === ep.id) + 1 : null;
    const min = Math.floor((latestProgress.progress_seconds || 0) / 60);
    const sec = Math.floor((latestProgress.progress_seconds || 0) % 60);
    return {
      label: season
        ? `T${season.season_number} · Ep. ${episodeInSeason}: ${ep.title}`
        : ep.title,
      timestamp: `${min}:${String(sec).padStart(2, "0")}`,
    };
  }, [latestProgress, titleData, allEpisodesFlat]);

  // Sempre priorizar banner (horizontal) para o hero
  const bgImage = titleData?.banner_url || titleData?.thumbnail_url;


  function getEpisodeNumber(ep: DomiflixEpisode): number {
    const idx = allEpisodesFlat.findIndex((e) => e.id === ep.id);
    return idx >= 0 ? idx + 1 : 1;
  }

  function handlePlay() {
    if (!titleSlug) return;
    // Resume from latest progress for this title (most recently watched episode)
    const titleProgress = progress
      .filter((p) => p.title_id === titleId)
      .sort((a, b) => new Date(b.watched_at).getTime() - new Date(a.watched_at).getTime());
    const latest = titleProgress[0];
    if (latest) {
      const idx = allEpisodesFlat.findIndex((e) => e.id === latest.episode_id);
      if (idx >= 0) {
        const startSec = Math.max(0, Math.floor(latest.progress_seconds || 0));
        navigate(`/domiflix/assistir/${titleSlug}/${idx + 1}/${startSec}`);
        return;
      }
    }
    const first = episodesToShow[0];
    if (first) navigate(`/domiflix/assistir/${titleSlug}/${getEpisodeNumber(first)}`);
  }

  function playEpisode(ep: DomiflixEpisode) {
    if (titleSlug) navigate(`/domiflix/assistir/${titleSlug}/${getEpisodeNumber(ep)}`);
  }

  // Título não encontrado
  if (!slugLoading && !resolvedId) {
    return (
      <div className="min-h-screen bg-[#141414] flex flex-col items-center justify-center text-white/40 pt-[68px]">
        <Tv className="w-20 h-20 mb-6 opacity-20" />
        <p className="text-xl font-semibold text-white/30">{t.title.notFound}</p>
        <button
          onClick={() => navigate("/domiflix")}
          className="mt-6 flex items-center gap-2 text-sm text-white/50 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> {t.title.backToHome}
        </button>
      </div>
    );
  }


  return (
    <div className="min-h-screen bg-[#141414] text-white">
      {/* ── Hero ── */}
      <div className="relative w-full min-h-[400px] sm:min-h-[340px] overflow-hidden" style={{ height: 'min(60vw, 62vh)' }}>
        {bgImage ? (
          <img
            src={bgImage}
            alt={titleData?.title ?? ""}
            className="absolute inset-0 w-full h-full object-cover object-top"
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-[#2a2a2a] to-[#141414] flex items-center justify-center">
            {titleData?.type === "movie" ? (
              <Film className="w-24 h-24 text-[#333]" />
            ) : (
              <Tv className="w-24 h-24 text-[#333]" />
            )}
          </div>
        )}

        <div className="absolute inset-0 bg-gradient-to-r from-black/85 via-black/35 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#141414] via-transparent to-transparent" />

        {/* Botão voltar */}
        <button
          onClick={() => navigate("/domiflix")}
          className="absolute top-20 left-6 sm:left-12 flex items-center gap-2 text-white/70 hover:text-white transition-colors bg-black/30 hover:bg-black/50 backdrop-blur-sm rounded-full px-4 py-2"
        >
          <ArrowLeft className="w-4 h-4" />
          <span className="text-sm">{t.title.back}</span>
        </button>

        {/* Conteúdo hero */}
        {isLoading ? (
          <div className="absolute bottom-[12%] left-8 sm:left-16 space-y-3">
            <Skeleton className="h-12 w-64 bg-[#333]" />
            <Skeleton className="h-4 w-96 bg-[#333]" />
            <Skeleton className="h-4 w-80 bg-[#333]" />
          </div>
        ) : titleData ? (
          <div className="absolute bottom-[12%] left-8 sm:left-16 max-w-2xl">
            <div className="flex items-center gap-2 mb-3">
              <span className="font-bold text-[11px] tracking-[0.2em] uppercase" style={{ color: "#E50914" }}>
                {titleData.type === "movie" ? t.title.typeLive : t.title.typeSeries}
              </span>
            </div>

            {titleData.logo_url ? (
              <img
                src={titleData.logo_url}
                alt={titleData.title}
                className="mb-4 max-w-[60%] sm:max-w-[460px] md:max-w-[560px] max-h-[110px] sm:max-h-[170px] md:max-h-[210px] object-contain object-left drop-shadow-[0_2px_8px_rgba(0,0,0,0.9)]"
              />
            ) : (
              <h1
                className="text-white font-bold mb-4 leading-none drop-shadow-[0_2px_8px_rgba(0,0,0,0.9)]"
                style={{ fontSize: "clamp(2rem, 4.5vw, 3.5rem)" }}
              >
                {titleData.title}
              </h1>
            )}

            {titleData.description && (
              <p className="text-[#e5e5e5]/80 text-sm md:text-base mb-6 line-clamp-3 leading-snug drop-shadow">
                {titleData.description}
              </p>
            )}

            <div className="flex items-center gap-3 flex-wrap">
              {titleData.type === "movie" && titleData.live_url ? (
                <button
                  onClick={() => window.open(titleData.live_url!, "_blank")}
                  className="flex items-center gap-2 px-7 py-2.5 rounded font-bold text-white text-sm md:text-base transition-all"
                  style={{ backgroundColor: "#E50914" }}
                  onMouseOver={(e) => (e.currentTarget.style.backgroundColor = "#C11118")}
                  onMouseOut={(e) => (e.currentTarget.style.backgroundColor = "#E50914")}
                >
                  <ExternalLink className="w-5 h-5" />
                  {t.title.enterLive}
                </button>
              ) : episodesToShow.length > 0 ? (
                <button
                  onClick={handlePlay}
                  className="flex items-center gap-2 px-7 py-2.5 rounded font-bold text-black bg-white hover:bg-white/85 transition-all text-sm md:text-base"
                >
                  <Play className="w-5 h-5 fill-black" />
                  {resumeInfo ? t.title.resume : t.title.watch}
                </button>
              ) : null}

              <button
                onClick={() => toggleWatchlist.mutate({ titleId, isInList: isInWatchlist })}
                className={cn(
                  "flex items-center gap-2 px-6 py-2.5 rounded font-semibold transition-all text-sm md:text-base backdrop-blur-sm border",
                  isInWatchlist
                    ? "bg-[#E50914] hover:bg-[#C11118] text-white border-[#E50914] shadow-[0_0_18px_rgba(229,9,20,0.35)]"
                    : "bg-[#6d6d6eb3] hover:bg-[#6d6d6e] text-white border-white/20"
                )}
                title={isInWatchlist ? t.title.removeFromList : t.title.addToList}
              >
                {isInWatchlist ? (
                  <><Check className="w-5 h-5" strokeWidth={3} /> {t.title.inMyList}</>
                ) : (
                  <><Plus className="w-5 h-5" /> {t.title.myList}</>
                )}
              </button>
            </div>

            {resumeInfo && (
              <p className="text-white/70 text-xs md:text-sm font-medium drop-shadow truncate max-w-[560px] mt-3">
                {resumeInfo.label} · {resumeInfo.timestamp}
              </p>
            )}

            {titleData.type === "movie" && titleData.live_scheduled_at && (
              <div className="flex items-center gap-2 mt-4 text-white/50 text-sm">
                <Calendar className="w-4 h-4" />
                <span>
                  {t.title.nextLive}{" "}
                  <span className="text-white font-medium">
                    {format(new Date(titleData.live_scheduled_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                  </span>
                </span>
              </div>
            )}
          </div>
        ) : null}
      </div>

      {/* ── Episódios / Temporadas ── */}
      <div className="px-6 sm:px-16 py-10">
        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-24 w-full bg-[#222] rounded" />
            ))}
          </div>
        ) : titleData ? (
          <>
            {titleData.type === "series" && titleData.seasons.length > 0 && (
              <>
                <div className="mb-6">
                  <div className="flex items-center justify-between gap-4 mb-3">
                    <h2 className="text-white text-2xl font-bold">{t.title.episodes}</h2>
                    <span className="text-white/60 text-sm font-medium shrink-0">
                      {t.title.watchedOf.replace('{{watched}}', String(watchedEpisodes)).replace('{{total}}', String(totalEpisodes))}
                    </span>
                  </div>
                  <div className="h-1.5 w-full bg-white/10 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[#E50914] rounded-full transition-all duration-500"
                      style={{ width: `${titleProgressPct}%` }}
                    />
                  </div>
                </div>

                <div className="flex flex-col md:flex-row gap-4 md:gap-8">
                  {/* Mobile: Select estilo Netflix */}
                  <div className="md:hidden">
                    <Select
                      value={activeSeasonId ?? undefined}
                      onValueChange={(v) => setSelectedSeasonId(v)}
                    >
                      <SelectTrigger className="w-full bg-[#1a1a1a] border-white/20 text-white h-11 font-semibold">
                        <SelectValue placeholder={t.title.selectSeason} />
                      </SelectTrigger>
                      <SelectContent className="bg-[#1a1a1a] border-white/20 text-white">
                        {titleData.seasons.map((s) => (
                          <SelectItem
                            key={s.id}
                            value={s.id}
                            className="text-white focus:bg-white/10 focus:text-white"
                          >
                            {t.title.season.replace('{{number}}', String(s.season_number))}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Desktop: Sidebar de temporadas */}
                  <aside className="hidden md:block md:w-56 shrink-0">
                    <div className="md:sticky md:top-24 flex md:flex-col gap-1">
                      {titleData.seasons.map((s) => {
                        const isActive = s.id === activeSeasonId;
                        return (
                          <button
                            key={s.id}
                            onClick={() => setSelectedSeasonId(s.id)}
                            className={cn(
                              "shrink-0 md:shrink text-left px-4 py-3 rounded-md transition-all border-l-2",
                              isActive
                                ? "bg-white/10 border-[#E50914] text-white"
                                : "border-transparent text-white/60 hover:text-white hover:bg-white/5"
                            )}
                          >
                            <div className="font-semibold text-sm">
                              {t.title.season.replace('{{number}}', String(s.season_number))}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </aside>

                  {/* Lista de episódios */}
                  <div className="flex-1 min-w-0">
                    <EpisodeList
                      episodes={episodesToShow}
                      isWatched={isWatched}
                      onPlay={playEpisode}
                      getProgress={getEpisodeProgress}
                      titleFallbackUrl={titleData.banner_url || titleData.thumbnail_url}
                    />
                  </div>
                </div>
              </>
            )}

            {titleData.type === "movie" && (
              <>
                {titleData.episodes.length > 0 ? (
                  <>
                    <h2 className="text-white text-2xl font-bold mb-6">{t.title.previousRecordings}</h2>
                    <EpisodeList
                      episodes={titleData.episodes}
                      isWatched={isWatched}
                      onPlay={playEpisode}
                      getProgress={getEpisodeProgress}
                      titleFallbackUrl={titleData.banner_url || titleData.thumbnail_url}
                    />
                  </>
                ) : (
                  <div className="text-center py-16 text-white/30">
                    <Film className="w-16 h-16 mx-auto mb-4 opacity-20" />
                    <p className="text-lg text-white/40">{t.title.noRecordings}</p>
                    {titleData.live_scheduled_at && (
                      <p className="text-sm mt-2 text-white/25">
                        {t.title.recordingAvailableAfterLive}
                      </p>
                    )}
                  </div>
                )}
              </>
            )}

            {titleData.type === "series" && episodesToShow.length === 0 && (
              <div className="text-center py-16 text-white/30">
                <Tv className="w-16 h-16 mx-auto mb-4 opacity-20" />
                <p className="text-lg text-white/40">{t.title.noEpisodesSeason}</p>
              </div>
            )}
          </>
        ) : (
          <div className="text-center py-16 text-white/30">
            <p>Título não encontrado</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Lista de episódios ────────────────────────────────────────────────────────

interface EpisodeListProps {
  episodes: DomiflixEpisode[];
  isWatched: (id: string) => boolean;
  onPlay: (ep: DomiflixEpisode) => void;
  getProgress: (id: string) => number;
  /** Imagem do título (banner/thumbnail) usada como fallback quando o
   *  episódio não tem thumbnail próprio. */
  titleFallbackUrl?: string | null;
}

function EpisodeList({ episodes, isWatched, onPlay, getProgress, titleFallbackUrl }: EpisodeListProps) {
  const { locale } = useAppLocaleContext();
  const t = MESSAGES[locale].app.domiflix;
  return (
    <div className="space-y-px w-full">
      {episodes.map((ep, idx) => (
        <div
          key={ep.id}
          className={cn(
            "flex items-start gap-3 sm:gap-4 px-2 sm:px-3 py-3 sm:py-4 rounded cursor-pointer group transition-colors w-full",
            "hover:bg-[#242424] border border-transparent hover:border-[#333]"
          )}
          onClick={() => onPlay(ep)}
        >
          <div className="shrink-0 w-5 sm:w-6 -ml-1 text-[#808080] text-lg sm:text-xl font-bold text-left mt-1 group-hover:hidden">
            {idx + 1}
          </div>
          <div className="shrink-0 w-5 sm:w-6 -ml-1 hidden group-hover:flex items-center justify-start mt-1">
            <Play className="w-5 h-5 text-white fill-white" />
          </div>

          <div className="shrink-0 w-24 sm:w-32 relative">
            {(() => {
              const src = ep.thumbnail_url || titleFallbackUrl;
              return src ? (
                <img
                  src={src}
                  alt={ep.title}
                  className="w-full aspect-video object-cover rounded bg-[#2a2a2a]"
                />
              ) : (
                <div className="w-full aspect-video bg-[#2a2a2a] rounded flex items-center justify-center">
                  <Play className="w-6 h-6 text-[#555]" />
                </div>
              );
            })()}
            {getProgress(ep.id) > 0 && (
              <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-[#4d4d4d] rounded-b">
                <div
                  className="h-full bg-[#E50914] rounded-b"
                  style={{ width: `${getProgress(ep.id)}%` }}
                />
              </div>
            )}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-white font-medium leading-tight break-words">{ep.title}</h3>
              {ep.duration_minutes ? (
                <span className="shrink-0 text-[#E50914] text-[11px] font-semibold flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {ep.duration_minutes}min
                </span>
              ) : null}
            </div>
            {ep.description && (
              <p className="text-[#a0a0a0] text-sm mt-1 break-words">{ep.description}</p>
            )}
            {ep.recorded_at && (
              <p className="text-[#555] text-xs mt-1">
                {format(new Date(ep.recorded_at), "dd/MM/yyyy", { locale: ptBR })}
              </p>
            )}
          </div>

          {(isWatched(ep.id) || getProgress(ep.id) >= 90) && (
            <div className="shrink-0 mt-1 flex items-center justify-center w-6 h-6 rounded-full bg-[#E50914]/15 ring-1 ring-[#E50914]/40">
              <Check className="w-3.5 h-3.5 text-[#E50914]" strokeWidth={3} aria-label={t.title.watched} />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
