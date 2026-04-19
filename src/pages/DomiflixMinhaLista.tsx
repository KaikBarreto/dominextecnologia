import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Bookmark, Play, Tv, Film } from "lucide-react";
import {
  useDomiflixTitles, useDomiflixWatchlist, useDomiflixEpisodeCounts,
  useDomiflixProgress, useToggleWatchlist,
} from "@/hooks/useDomiflix";
import { slugify } from "@/lib/slugify";
import { Skeleton } from "@/components/ui/skeleton";

export default function DomiflixMinhaLista() {
  const navigate = useNavigate();
  const { data: titles = [], isLoading: tl } = useDomiflixTitles();
  const { data: watchlist = [], isLoading: wl } = useDomiflixWatchlist();
  const { data: episodeCounts = {} } = useDomiflixEpisodeCounts();
  const { data: progress = [] } = useDomiflixProgress();
  const toggleWatchlist = useToggleWatchlist();

  const isLoading = tl || wl;

  const myTitles = useMemo(() => {
    const order = new Map(watchlist.map((w, i) => [w.title_id, i]));
    return titles.filter((t) => order.has(t.id)).sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  }, [titles, watchlist]);

  return (
    <div className="min-h-screen bg-[#141414] text-white pt-[80px] md:pt-[96px] pb-16">
      <div className="px-4 md:px-12">
        <div className="flex items-center gap-3 mb-2">
          <Bookmark className="w-7 h-7 text-[#e50914]" />
          <h1 className="text-2xl md:text-3xl font-bold">Minha Lista</h1>
        </div>
        <p className="text-white/50 text-sm md:text-base mb-8">Títulos que você salvou para assistir depois</p>

        {isLoading ? (
          <div className="space-y-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-[140px] w-full bg-[#222]" />)}</div>
        ) : myTitles.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 gap-4">
            <Bookmark className="w-20 h-20 text-white/15" />
            <p className="text-xl font-semibold text-white/40">Sua lista está vazia</p>
            <button onClick={() => navigate("/domiflix")} className="mt-4 px-6 py-2.5 rounded font-semibold text-white bg-[#6d6d6eb3] hover:bg-[#6d6d6e] text-sm border border-white/20">
              Explorar conteúdo
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {myTitles.map((title) => {
              const bgImage = title.banner_url || title.thumbnail_url;
              const epCount = episodeCounts[title.id] ?? 0;
              const hasProgress = progress.some((p) => p.title_id === title.id);
              return (
                <div key={title.id} onClick={() => navigate(`/domiflix/${slugify(title.title)}`)}
                  className="flex gap-4 rounded-lg overflow-hidden bg-[#1a1a1a] hover:bg-[#252525] cursor-pointer group">
                  <div className="relative w-[220px] sm:w-[280px] flex-shrink-0 aspect-video overflow-hidden">
                    {bgImage ? (
                      <img src={bgImage} alt={title.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                    ) : (
                      <div className="w-full h-full bg-[#2a2a2a] flex items-center justify-center">
                        {title.type === "series" ? <Tv className="w-10 h-10 text-[#444]" /> : <Film className="w-10 h-10 text-[#444]" />}
                      </div>
                    )}
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <div className="w-12 h-12 rounded-full bg-white/95 flex items-center justify-center"><Play className="w-5 h-5 text-black fill-black" /></div>
                    </div>
                  </div>
                  <div className="flex-1 min-w-0 py-3 pr-4 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className="font-bold text-[10px] tracking-[0.18em] uppercase text-[#e50914]">{title.type === "series" ? "Módulo" : "Live"}</span>
                        {epCount > 0 && <span className="text-white/40 text-xs">• {epCount} {epCount === 1 ? "episódio" : "episódios"}</span>}
                        {hasProgress && <span className="text-white/50 text-xs">• Em andamento</span>}
                      </div>
                      <h3 className="text-white font-bold text-base sm:text-lg leading-tight line-clamp-1">{title.title}</h3>
                      {title.description && <p className="text-white/55 text-sm mt-1.5 line-clamp-2">{title.description}</p>}
                    </div>
                    <div className="flex items-center gap-2 mt-3">
                      <button onClick={(e) => { e.stopPropagation(); navigate(`/domiflix/${slugify(title.title)}`); }}
                        className="text-xs sm:text-sm font-semibold text-black bg-white hover:bg-white/85 px-4 py-1.5 rounded">
                        Ver detalhes
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); toggleWatchlist.mutate({ titleId: title.id, isInList: true }); }}
                        className="text-xs sm:text-sm text-white/70 hover:text-white border border-white/20 hover:border-white/40 px-4 py-1.5 rounded">
                        Remover
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
