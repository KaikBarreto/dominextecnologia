import { useState, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Play, Plus, Check, Clock, ExternalLink, Film, Tv } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useDomiflixTitleBySlug, useDomiflixTitle, useDomiflixProgress,
  useDomiflixWatchlist, useToggleWatchlist, DomiflixEpisode,
} from "@/hooks/useDomiflix";
import { cn } from "@/lib/utils";

export default function DomiflixTitle() {
  const { titleSlug } = useParams<{ titleSlug: string }>();
  const navigate = useNavigate();

  const { data: resolvedId, isLoading: slugLoading } = useDomiflixTitleBySlug(titleSlug);
  const { data: titleData, isLoading: titleLoading } = useDomiflixTitle(resolvedId ?? undefined);
  const { data: progress = [] } = useDomiflixProgress();
  const { data: watchlist = [] } = useDomiflixWatchlist();
  const toggleWatchlist = useToggleWatchlist();

  const isLoading = slugLoading || titleLoading;
  const titleId = resolvedId ?? "";
  const [selectedSeasonId, setSelectedSeasonId] = useState<string | null>(null);
  const isInWatchlist = watchlist.some((w) => w.title_id === titleId);

  const allEpisodesFlat: DomiflixEpisode[] = useMemo(() => {
    if (!titleData) return [];
    return titleData.type === "series" ? titleData.seasons.flatMap((s) => s.episodes) : titleData.episodes;
  }, [titleData]);

  function isWatched(id: string) { return progress.some((p) => p.episode_id === id && p.completed); }
  function getEpProgress(id: string) {
    const p = progress.find((pr) => pr.episode_id === id);
    if (!p) return 0;
    if (p.completed) return 100;
    if (p.duration_seconds > 0) return Math.min(100, (p.progress_seconds / p.duration_seconds) * 100);
    return 0;
  }

  const activeSeasonId = selectedSeasonId ?? (titleData?.type === "series" && titleData.seasons[0]?.id) ?? null;
  const activeSeason = titleData?.type === "series" ? titleData.seasons.find((s) => s.id === activeSeasonId) : undefined;
  const episodesToShow = titleData?.type === "series" ? activeSeason?.episodes ?? [] : titleData?.episodes ?? [];

  function getEpNumber(ep: DomiflixEpisode) {
    const idx = allEpisodesFlat.findIndex((e) => e.id === ep.id);
    return idx >= 0 ? idx + 1 : 1;
  }

  function handlePlay() {
    if (!titleSlug) return;
    const titleProg = progress.filter((p) => p.title_id === titleId).sort((a, b) => new Date(b.watched_at).getTime() - new Date(a.watched_at).getTime());
    const latest = titleProg[0];
    if (latest) {
      const idx = allEpisodesFlat.findIndex((e) => e.id === latest.episode_id);
      if (idx >= 0) {
        navigate(`/domiflix/assistir/${titleSlug}/${idx + 1}/${Math.floor(latest.progress_seconds || 0)}`);
        return;
      }
    }
    const first = episodesToShow[0];
    if (first) navigate(`/domiflix/assistir/${titleSlug}/${getEpNumber(first)}`);
  }

  if (!slugLoading && !resolvedId) {
    return (
      <div className="min-h-screen bg-[#141414] flex flex-col items-center justify-center text-white/40 pt-[68px]">
        <Tv className="w-20 h-20 mb-6 opacity-20" />
        <p className="text-xl font-semibold text-white/30">Título não encontrado</p>
        <button onClick={() => navigate("/domiflix")} className="mt-6 flex items-center gap-2 text-sm text-white/50 hover:text-white">
          <ArrowLeft className="w-4 h-4" /> Voltar ao início
        </button>
      </div>
    );
  }

  const bgImage = titleData?.banner_url || titleData?.thumbnail_url;

  return (
    <div className="min-h-screen bg-[#141414] text-white">
      <div className="relative w-full overflow-hidden" style={{ height: 'min(60vw, 62vh)', minHeight: 400 }}>
        {bgImage ? (
          <img src={bgImage} alt={titleData?.title ?? ""} className="absolute inset-0 w-full h-full object-cover object-top" />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-[#2a2a2a] to-[#141414]" />
        )}
        <div className="absolute inset-0 bg-gradient-to-r from-black/85 via-black/35 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#141414] via-transparent to-transparent" />

        <button onClick={() => navigate("/domiflix")} className="absolute top-20 left-6 sm:left-12 flex items-center gap-2 text-white/70 hover:text-white bg-black/30 hover:bg-black/50 backdrop-blur-sm rounded-full px-4 py-2">
          <ArrowLeft className="w-4 h-4" /><span className="text-sm">Voltar</span>
        </button>

        {isLoading ? (
          <div className="absolute bottom-[12%] left-8 sm:left-16 space-y-3">
            <Skeleton className="h-12 w-64 bg-[#333]" />
            <Skeleton className="h-4 w-96 bg-[#333]" />
          </div>
        ) : titleData ? (
          <div className="absolute bottom-[12%] left-8 sm:left-16 max-w-2xl">
            <div className="flex items-center gap-2 mb-3">
              <span className="font-bold text-[11px] tracking-[0.2em] uppercase text-[#00C597]">
                {titleData.type === "movie" ? "Live" : "Série"}
              </span>
            </div>
            {titleData.logo_url ? (
              <img src={titleData.logo_url} alt={titleData.title} className="mb-4 max-w-[60%] sm:max-w-[460px] max-h-[170px] object-contain object-left" />
            ) : (
              <h1 className="text-white font-bold mb-4 leading-none" style={{ fontSize: "clamp(2rem, 4.5vw, 3.5rem)" }}>{titleData.title}</h1>
            )}
            {titleData.description && <p className="text-[#e5e5e5]/80 text-sm md:text-base mb-6 line-clamp-3">{titleData.description}</p>}

            <div className="flex items-center gap-3 flex-wrap">
              {titleData.type === "movie" && titleData.live_url ? (
                <button onClick={() => window.open(titleData.live_url!, "_blank")}
                  className="flex items-center gap-2 px-7 py-2.5 rounded font-bold text-black bg-[#00C597] hover:bg-[#00b287] text-sm md:text-base">
                  <ExternalLink className="w-5 h-5" /> Entrar na Live
                </button>
              ) : episodesToShow.length > 0 ? (
                <button onClick={handlePlay} className="flex items-center gap-2 px-7 py-2.5 rounded font-bold text-black bg-white hover:bg-white/85 text-sm md:text-base">
                  <Play className="w-5 h-5 fill-black" /> Assistir
                </button>
              ) : null}

              <button onClick={() => toggleWatchlist.mutate({ titleId, isInList: isInWatchlist })}
                className={cn("flex items-center gap-2 px-6 py-2.5 rounded font-semibold text-sm md:text-base border",
                  isInWatchlist ? "bg-[#00C597] hover:bg-[#00b287] text-black border-[#00C597]" : "bg-[#6d6d6eb3] hover:bg-[#6d6d6e] text-white border-white/20"
                )}>
                {isInWatchlist ? <><Check className="w-5 h-5" strokeWidth={3} /> Na minha lista</> : <><Plus className="w-5 h-5" /> Minha lista</>}
              </button>
            </div>
          </div>
        ) : null}
      </div>

      <div className="px-6 sm:px-16 py-10">
        {isLoading ? (
          <div className="space-y-4">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-24 w-full bg-[#222]" />)}</div>
        ) : titleData ? (
          <>
            {titleData.type === "series" && titleData.seasons.length > 0 && (
              <>
                <h2 className="text-white text-2xl font-bold mb-6">Episódios</h2>
                <div className="flex flex-col md:flex-row gap-4 md:gap-8">
                  <aside className="md:w-56 shrink-0">
                    <div className="md:sticky md:top-24 flex md:flex-col gap-1 overflow-x-auto md:overflow-visible">
                      {titleData.seasons.map((s) => {
                        const isActive = s.id === activeSeasonId;
                        return (
                          <button key={s.id} onClick={() => setSelectedSeasonId(s.id)}
                            className={cn("shrink-0 text-left px-4 py-3 rounded-md border-l-2",
                              isActive ? "bg-white/10 border-[#00C597] text-white" : "border-transparent text-white/60 hover:text-white hover:bg-white/5"
                            )}>
                            <div className="font-semibold text-sm">Temporada {s.season_number}</div>
                          </button>
                        );
                      })}
                    </div>
                  </aside>
                  <div className="flex-1 min-w-0">
                    <EpisodeList episodes={episodesToShow} isWatched={isWatched} getProgress={getEpProgress}
                      onPlay={(ep) => titleSlug && navigate(`/domiflix/assistir/${titleSlug}/${getEpNumber(ep)}`)} />
                  </div>
                </div>
              </>
            )}

            {titleData.type === "movie" && titleData.episodes.length > 0 && (
              <>
                <h2 className="text-white text-2xl font-bold mb-6">Gravações anteriores</h2>
                <EpisodeList episodes={titleData.episodes} isWatched={isWatched} getProgress={getEpProgress}
                  onPlay={(ep) => titleSlug && navigate(`/domiflix/assistir/${titleSlug}/${getEpNumber(ep)}`)} />
              </>
            )}

            {titleData.type === "movie" && titleData.episodes.length === 0 && (
              <div className="text-center py-16 text-white/30">
                <Film className="w-16 h-16 mx-auto mb-4 opacity-20" />
                <p className="text-lg text-white/40">Nenhuma gravação disponível ainda</p>
              </div>
            )}
          </>
        ) : null}
      </div>
    </div>
  );
}

function EpisodeList({ episodes, isWatched, onPlay, getProgress }: {
  episodes: DomiflixEpisode[]; isWatched: (id: string) => boolean;
  onPlay: (ep: DomiflixEpisode) => void; getProgress: (id: string) => number;
}) {
  return (
    <div className="space-y-px">
      {episodes.map((ep, idx) => (
        <div key={ep.id} onClick={() => onPlay(ep)}
          className="flex items-start gap-3 sm:gap-4 px-2 sm:px-3 py-3 sm:py-4 rounded cursor-pointer group hover:bg-[#242424] border border-transparent hover:border-[#333]">
          <div className="shrink-0 w-6 text-[#808080] text-lg font-bold mt-1 group-hover:hidden">{idx + 1}</div>
          <div className="shrink-0 w-6 hidden group-hover:flex items-center mt-1"><Play className="w-5 h-5 text-white fill-white" /></div>
          <div className="shrink-0 w-24 sm:w-32 relative">
            {ep.thumbnail_url ? (
              <img src={ep.thumbnail_url} alt={ep.title} className="w-full aspect-video object-cover rounded bg-[#2a2a2a]" />
            ) : (
              <div className="w-full aspect-video bg-[#2a2a2a] rounded flex items-center justify-center"><Play className="w-6 h-6 text-[#555]" /></div>
            )}
            {getProgress(ep.id) > 0 && (
              <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-[#4d4d4d] rounded-b">
                <div className="h-full bg-[#00C597] rounded-b" style={{ width: `${getProgress(ep.id)}%` }} />
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-white font-medium leading-tight">{ep.title}</h3>
              {ep.duration_minutes ? (
                <span className="text-[#00C597] text-[11px] font-semibold flex items-center gap-1">
                  <Clock className="w-3 h-3" />{ep.duration_minutes}min
                </span>
              ) : null}
            </div>
            {ep.description && <p className="text-[#a0a0a0] text-sm mt-1">{ep.description}</p>}
          </div>
          {(isWatched(ep.id) || getProgress(ep.id) >= 90) && (
            <div className="shrink-0 mt-1 flex items-center justify-center w-6 h-6 rounded-full bg-[#00C597]/15 ring-1 ring-[#00C597]/40">
              <Check className="w-3.5 h-3.5 text-[#00C597]" strokeWidth={3} />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
