import { useMemo } from "react";
import { ArrowLeft, BookOpen, Check, ChevronRight, Play } from "lucide-react";
import { useNavigate } from "react-router-dom";
import type { DomiflixLearningStatus, DomiflixTrackLesson } from "@/hooks/useDomiflix";
import { cn } from "@/lib/utils";
import { DomiflixModuleBadge } from "@/components/domiflix/DomiflixModuleBadge";
import domiflixLogo from "@/assets/domiflix-logo-horizontal-branco.png";

export function DomiflixTrackPanel({
  status,
  currentEpisodeId,
  onSelect,
}: {
  status: DomiflixLearningStatus | undefined;
  currentEpisodeId: string;
  onSelect: (lesson: DomiflixTrackLesson) => void;
}) {
  const navigate = useNavigate();
  const groups = useMemo(() => {
    const result: { id: string; title: string; cover: string | null; group: "core" | "plan"; includedInPlan: boolean; lessons: DomiflixTrackLesson[] }[] = [];
    status?.track.forEach((lesson) => {
      const current = result.find((item) => item.id === lesson.titleId);
      if (current) current.lessons.push(lesson);
      else result.push({ id: lesson.titleId, title: lesson.moduleTitle, cover: lesson.thumbnailUrl || lesson.bannerUrl, group: lesson.group, includedInPlan: lesson.includedInPlan, lessons: [lesson] });
    });
    return result;
  }, [status]);

  if (!status) return <div className="p-5 text-sm text-stone-500">Carregando trilha…</div>;

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#181818] text-stone-100">
      <div className="shrink-0 border-b border-white/10 px-5 py-5">
        <div className="mb-5 flex items-center justify-between gap-3">
          <img src={domiflixLogo} alt="DomiFlix" className="h-6 w-auto object-contain" />
          <button onClick={() => navigate("/dashboard")} className="inline-flex min-h-11 items-center gap-1.5 rounded-sm border border-white/15 px-3 text-xs font-semibold text-white hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"><ArrowLeft className="h-3.5 w-3.5" />Voltar ao sistema</button>
        </div>
        <button onClick={() => navigate(`/domiflix?trilha=${encodeURIComponent(status.path.slug)}`)} className="mb-4 inline-flex min-h-11 items-center gap-1.5 rounded-sm text-xs font-semibold text-stone-300 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"><ArrowLeft className="h-3.5 w-3.5" />Voltar para todos os módulos</button>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-red-500">Sua trilha</p>
        <div className="mt-2 flex items-center justify-between text-sm">
          <span className="rounded-sm bg-red-600 px-2 py-1 text-xs font-semibold text-white">Trilha do seu plano</span>
          <span className="font-semibold text-red-400">{status.progress.trackPercent}%</span>
        </div>
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/10">
          <div className="h-full rounded-full bg-red-600" style={{ width: `${status.progress.trackPercent}%` }} />
        </div>
        <p className="mt-2 text-xs text-stone-400">Formação básica {status.progress.corePercent}%</p>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {groups.map((module, moduleIndex) => (
          <div key={module.id}>
            {moduleIndex > 0 && module.group === "plan" && !module.includedInPlan && groups[moduleIndex - 1].includedInPlan && <div className="border-b border-white/10 bg-black/20 px-5 py-4"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-red-400">Conheça outros módulos</p><p className="mt-1 text-[11px] leading-4 text-stone-500">Você pode assistir e contratar direto pela aula.</p></div>}
          <section className="border-b border-white/10 py-4">
            <div className="flex gap-3 px-5 pb-3">
              <div className="h-[72px] w-14 shrink-0 overflow-hidden rounded-sm bg-white/[0.05]">{module.cover ? <img src={module.cover} alt="" className="h-full w-full object-cover" /> : <div className="grid h-full place-items-center"><BookOpen className="h-4 w-4 text-stone-600" /></div>}</div>
              <div className="min-w-0 pt-0.5"><DomiflixModuleBadge group={module.group} includedInPlan={module.includedInPlan} /><h2 className="mt-1.5 line-clamp-2 text-sm font-semibold">{module.title}</h2></div>
            </div>
            <ol>
              {module.lessons.map((lesson, index) => {
                const active = lesson.episodeId === currentEpisodeId;
                return (
                  <li key={lesson.episodeId}>
                    <button
                      onClick={() => onSelect(lesson)}
                      aria-current={active ? "step" : undefined}
                      className={cn(
                        "group flex min-h-11 w-full items-center gap-3 px-5 py-2.5 text-left hover:bg-white/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white",
                        active && "border-l-2 border-red-600 bg-white/[0.06] pl-[18px]",
                      )}
                    >
                      <span className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded-sm bg-white/[0.06] text-[11px] text-stone-500", lesson.completed && "text-emerald-400", active && "bg-red-600 text-white")}>
                        {lesson.completed ? <Check className="h-3 w-3" /> : active ? <Play className="h-3 w-3 fill-current" /> : index + 1}
                      </span>
                      <span className={cn("min-w-0 flex-1 truncate text-xs font-medium", active ? "text-white" : "text-stone-400")}>{lesson.lessonTitle}</span>
                      <ChevronRight className="h-3.5 w-3.5 text-stone-700 group-hover:text-stone-400" />
                    </button>
                  </li>
                );
              })}
            </ol>
          </section>
          </div>
        ))}
      </div>
    </div>
  );
}
