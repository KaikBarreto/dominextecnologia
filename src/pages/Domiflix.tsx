import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  ArrowRight,
  BookOpen,
  Check,
  Clock3,
  LockKeyhole,
  Play,
  Search,
} from "lucide-react";
import {
  useDomiflixLearningStatus,
  type DomiflixTrackLesson,
} from "@/hooks/useDomiflix";
import { DomiflixPageSkeleton } from "@/components/domiflix/DomiflixSkeletons";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { OVERLAY_PRIORITY } from "@/contexts/OverlayCoordinatorContext";
import { slugify } from "@/lib/slugify";
import { cn } from "@/lib/utils";
import { DomiflixModuleBadge } from "@/components/domiflix/DomiflixModuleBadge";

type ModuleGroup = {
  id: string;
  title: string;
  description: string | null;
  cover: string | null;
  group: "core" | "plan";
  includedInPlan: boolean;
  lessons: DomiflixTrackLesson[];
};

export default function Tutoriais() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const pathSlug = searchParams.get("trilha") || "tutoriais-do-sistema";
  const {
    data: status,
    isLoading,
    isError,
  } = useDomiflixLearningStatus(true, pathSlug);
  const [query, setQuery] = useState("");
  const [futureLesson, setFutureLesson] = useState<DomiflixTrackLesson | null>(
    null,
  );

  const modules = useMemo<ModuleGroup[]>(() => {
    if (!status) return [];
    const byModule = new Map<string, ModuleGroup>();
    status.track.forEach((lesson) => {
      const current = byModule.get(lesson.titleId);
      if (current) current.lessons.push(lesson);
      else
        byModule.set(lesson.titleId, {
          id: lesson.titleId,
          title: lesson.moduleTitle,
          description: lesson.moduleDescription,
          cover: lesson.thumbnailUrl || lesson.bannerUrl,
          group: lesson.group,
          includedInPlan: lesson.includedInPlan,
          lessons: [lesson],
        });
    });
    return [...byModule.values()];
  }, [status]);

  const firstIncompleteSequence =
    status?.track.find((lesson) => !lesson.completed && (lesson.group === "core" || lesson.includedInPlan))?.sequence ??
    Number.POSITIVE_INFINITY;
  const normalizedQuery = query.trim().toLocaleLowerCase("pt-BR");
  const visibleModules =
    normalizedQuery.length < 2
      ? modules
      : modules
          .map((module) => ({
            ...module,
            lessons: module.lessons.filter(
              (lesson) =>
                module.title
                  .toLocaleLowerCase("pt-BR")
                  .includes(normalizedQuery) ||
                lesson.lessonTitle
                  .toLocaleLowerCase("pt-BR")
                  .includes(normalizedQuery) ||
                lesson.lessonDescription
                  ?.toLocaleLowerCase("pt-BR")
                  .includes(normalizedQuery),
            ),
          }))
          .filter((module) => module.lessons.length > 0);

  function watchUrl(lesson: DomiflixTrackLesson) {
    const module = modules.find((item) => item.id === lesson.titleId);
    const lessonNumber = Math.max(
      1,
      (module?.lessons.findIndex(
        (item) => item.episodeId === lesson.episodeId,
      ) ?? 0) + 1,
    );
    const start = Math.max(0, Math.floor(lesson.progressSeconds));
    return `/domiflix/assistir/${slugify(lesson.moduleTitle)}/${lessonNumber}${start ? `/${start}` : ""}?trilha=${encodeURIComponent(pathSlug)}`;
  }

  function openLesson(lesson: DomiflixTrackLesson) {
    const isFuture =
      !lesson.completed && lesson.sequence > firstIncompleteSequence;
    if (isFuture) setFutureLesson(lesson);
    else navigate(watchUrl(lesson));
  }

  if (isLoading) return <DomiflixPageSkeleton />;

  if (isError || !status) {
    return (
      <main className="min-h-screen bg-[#141414] px-5 pt-28 text-white">
        <div className="mx-auto max-w-3xl border-l-2 border-red-600 pl-5">
          <h1 className="text-2xl font-semibold">
            Não foi possível carregar sua trilha
          </h1>
          <p className="mt-2 text-sm text-stone-400">
            Tente novamente em instantes. Seu progresso já salvo não foi
            perdido.
          </p>
        </div>
      </main>
    );
  }

  const next =
    status.track.find(
      (lesson) => lesson.sequence === firstIncompleteSequence,
    ) ?? null;
  const pageTitle = status.path.isOnboarding
    ? "Aprenda a usar a Dominex"
    : status.path.title;

  return (
    <main className="min-h-screen bg-[#141414] pb-24 pt-20 text-stone-100">
      <div className="sm:hidden">
        <header className="px-4 pb-5 pt-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-red-500">
            Olá, {status.user.firstName} · continue sua trilha
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white">
            {pageTitle}
          </h1>
          <p className="mt-2 line-clamp-2 text-sm leading-5 text-stone-400">
            {status.path.description ||
              "Aprenda na ordem certa, aula por aula."}
          </p>
          {status.paths.length > 1 && (
            <nav
              aria-label="Cursos disponíveis"
              className="-mx-4 mt-4 flex snap-x gap-2 overflow-x-auto px-4 pb-1"
            >
              {status.paths.map((path) => (
                <button
                  key={path.id}
                  onClick={() =>
                    setSearchParams(
                      path.slug === "tutoriais-do-sistema"
                        ? {}
                        : { trilha: path.slug },
                    )
                  }
                  className={cn(
                    "relative min-w-[76vw] snap-center overflow-hidden rounded-sm border bg-[#1c1c1c] text-left",
                    path.slug === status.path.slug
                      ? "border-red-600"
                      : "border-white/10",
                  )}
                >
                  <div className="aspect-[2.4/1] bg-stone-900">
                    {path.coverUrl ? (
                      <img
                        src={path.coverUrl}
                        alt=""
                        className="h-full w-full object-cover opacity-75"
                      />
                    ) : (
                      <div className="h-full bg-gradient-to-br from-stone-700 to-stone-950" />
                    )}
                  </div>
                  <div className="p-3">
                    <span className="block text-sm font-semibold text-white">
                      {path.title}
                    </span>
                    <span className="mt-1 line-clamp-1 block text-xs text-stone-400">
                      {path.description || "Curso disponível"}
                    </span>
                  </div>
                </button>
              ))}
            </nav>
          )}
          {status.progress.coreTotal > 0 && <div className="mt-5 rounded-sm bg-white/[0.045] p-4">
            <div className="flex items-end justify-between">
              <div>
                <p className="text-xs text-stone-500">Trilha do seu plano</p>
                <p className="mt-1 text-lg font-semibold">
                  {status.progress.trackCompleted} de {status.progress.trackTotal}{" "}
                  aulas
                </p>
              </div>
              <span className="text-2xl font-semibold text-red-400">
                {status.progress.trackPercent}%
              </span>
            </div>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-red-600"
                style={{ width: `${status.progress.trackPercent}%` }}
              />
            </div>
            <p className="mt-2 text-xs text-stone-500">Formação básica: {status.progress.coreCompleted} de {status.progress.coreTotal} · {status.progress.corePercent}%</p>
            {next && (
              <Button
                onClick={() => openLesson(next)}
                className="mt-4 h-12 w-full justify-between rounded-sm bg-red-600 px-4 font-semibold text-white hover:bg-red-500"
              >
                <span>
                  {next.progressSeconds > 0
                    ? "Continuar de onde parei"
                    : "Começar pelos tutoriais"}
                </span>
                <ArrowRight className="h-4 w-4" />
              </Button>
            )}
          </div>}
        </header>
        <section className="border-t border-white/10 px-4 pt-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-stone-500">
                Sequência recomendada
              </p>
              <h2 className="mt-1 text-lg font-semibold">Aulas da trilha</h2>
            </div>
            <span className="text-xs text-stone-500">
              {status.track.length} aulas
            </span>
          </div>
          {modules.length === 0 ? (
            <div className="mt-5 rounded-sm border border-dashed border-white/15 bg-white/[0.025] p-6 text-center">
              <BookOpen className="mx-auto h-7 w-7 text-stone-600" />
              <p className="mt-3 font-medium">
                Esta trilha está sendo preparada
              </p>
              <p className="mt-1 text-sm leading-5 text-stone-500">
                Assim que as primeiras aulas forem publicadas, elas aparecerão
                aqui na ordem certa.
              </p>
            </div>
          ) : (
            <div className="mt-4 space-y-6">
              {modules.map((module, moduleIndex) => (
                <article key={module.id}>
                  <div className="flex gap-3">
                    <div className="h-16 w-24 shrink-0 overflow-hidden rounded-sm bg-stone-900">
                      {module.cover ? (
                        <img
                          src={module.cover}
                          alt=""
                          className="h-full w-full object-cover opacity-80"
                        />
                      ) : (
                        <div className="grid h-full place-items-center">
                          <BookOpen className="h-5 w-5 text-stone-700" />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-red-400">
                        Módulo {moduleIndex + 1}
                      </p>
                      <h3 className="mt-1 line-clamp-2 text-sm font-semibold">
                        {module.title}
                      </h3>
                    </div>
                  </div>
                  <ol className="mt-3 overflow-hidden rounded-sm bg-white/[0.025]">
                    {module.lessons.map((lesson, lessonIndex) => {
                      const current =
                        lesson.sequence === firstIncompleteSequence;
                      const future =
                        !lesson.completed &&
                        lesson.sequence > firstIncompleteSequence;
                      return (
                        <li
                          key={lesson.episodeId}
                          className="border-b border-white/[0.07] last:border-0"
                        >
                          <button
                            onClick={() => openLesson(lesson)}
                            className={cn(
                              "flex min-h-14 w-full items-center gap-3 px-3 py-2.5 text-left",
                              current && "bg-white/[0.055]",
                            )}
                          >
                            <span
                              className={cn(
                                "grid h-7 w-7 shrink-0 place-items-center rounded-sm bg-white/[0.06] text-xs text-stone-500",
                                lesson.completed && "text-emerald-400",
                                current && "bg-red-600 text-white",
                              )}
                            >
                              {lesson.completed ? (
                                <Check className="h-3.5 w-3.5" />
                              ) : current ? (
                                <Play className="h-3.5 w-3.5 fill-current" />
                              ) : future ? (
                                <LockKeyhole className="h-3 w-3" />
                              ) : (
                                lessonIndex + 1
                              )}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span
                                className={cn(
                                  "line-clamp-2 text-sm font-medium",
                                  future ? "text-stone-500" : "text-stone-200",
                                )}
                              >
                                {lesson.lessonTitle}
                              </span>
                              <span className="mt-0.5 block text-[11px] text-stone-600">
                                {current
                                  ? "Próxima recomendada"
                                  : lesson.completed
                                    ? "Concluída"
                                    : future
                                      ? "Consulta livre"
                                      : "Em andamento"}
                              </span>
                            </span>
                            <ArrowRight className="h-4 w-4 shrink-0 text-stone-700" />
                          </button>
                        </li>
                      );
                    })}
                  </ol>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
      <div className="mx-auto hidden max-w-6xl px-4 sm:block sm:px-6 lg:px-8">
        <header className="border-b border-white/10 pb-8 pt-6">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-red-500">
                Olá, {status.user.firstName} · continue sua trilha
              </p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
                {pageTitle}
              </h1>
              <p className="mt-3 text-sm leading-6 text-stone-400 sm:text-base">
                {status.path.description ||
                  "Aprenda na ordem certa e acompanhe seu progresso aula por aula."}
              </p>
            </div>
            {next && (
              <Button
                onClick={() => openLesson(next)}
                className="h-11 justify-between rounded-sm bg-red-600 px-5 font-semibold text-white hover:bg-red-500 lg:min-w-56"
              >
                <span>
                  {next.progressSeconds > 0
                    ? "Continuar trilha"
                    : "Começar trilha"}
                </span>
                <ArrowRight className="h-4 w-4" />
              </Button>
            )}
          </div>

          {status.paths.length > 1 && (
            <nav
              aria-label="Cursos disponíveis"
              className="mt-7 -mx-4 flex snap-x gap-2 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-0"
            >
              {status.paths.map((path) => (
                <button
                  key={path.id}
                  onClick={() =>
                    setSearchParams(
                      path.slug === "tutoriais-do-sistema"
                        ? {}
                        : { trilha: path.slug },
                    )
                  }
                  className={cn(
                    "grid min-w-[78vw] snap-center grid-cols-[88px_1fr] overflow-hidden rounded-sm border bg-[#1b1b1b] text-left sm:min-w-0",
                    path.slug === status.path.slug
                      ? "border-red-600/70"
                      : "border-white/10 hover:border-white/25",
                  )}
                >
                  <span className="block h-full min-h-16 bg-stone-900">
                    {path.coverUrl ? (
                      <img
                        src={path.coverUrl}
                        alt=""
                        className="h-full w-full object-cover opacity-80"
                      />
                    ) : (
                      <span className="block h-full bg-gradient-to-br from-stone-700 to-stone-950" />
                    )}
                  </span>
                  <span className="block p-3">
                    <span className="block text-xs font-semibold text-white">
                      {path.title}
                    </span>
                    <span className="mt-1 line-clamp-2 block text-xs leading-4 text-stone-400">
                      {path.description || "Curso disponível"}
                    </span>
                  </span>
                </button>
              ))}
            </nav>
          )}

          {status.progress.coreTotal > 0 && <div className="mt-8 grid gap-5 sm:grid-cols-[1fr_auto] sm:items-end">
            <div>
              <div className="mb-2 flex items-center justify-between text-xs">
                <span className="inline-flex rounded-sm bg-red-600 px-2 py-1 font-semibold text-white">
                  Trilha do seu plano
                </span>
                <span className="font-semibold text-red-400">
                  {status.progress.trackPercent}%
                </span>
              </div>
              <div
                className="h-1.5 overflow-hidden rounded-full bg-white/10"
                role="progressbar"
                aria-valuenow={status.progress.trackPercent}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <div
                  className="h-full rounded-full bg-red-600 transition-[width]"
                  style={{ width: `${status.progress.trackPercent}%` }}
                />
              </div>
              <p className="mt-2 text-xs text-stone-500">
                {status.progress.trackCompleted} de {status.progress.trackTotal} aulas concluídas · Formação básica {status.progress.corePercent}%
              </p>
            </div>
            <div className="relative sm:w-72">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-500" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Buscar aula"
                className="h-10 border-white/10 bg-white/[0.04] pl-9 text-white placeholder:text-stone-600 focus-visible:ring-red-600"
              />
            </div>
          </div>}
        </header>

        {visibleModules.length === 0 ? (
          <div className="py-24 text-center">
            <BookOpen className="mx-auto h-9 w-9 text-stone-700" />
            <p className="mt-4 font-medium text-stone-300">
              {modules.length === 0
                ? "Esta trilha está sendo preparada"
                : "Nenhuma aula encontrada"}
            </p>
            <p className="mt-1 text-sm text-stone-500">
              {modules.length === 0
                ? "As aulas aparecerão aqui assim que forem publicadas."
                : "Tente buscar por outro termo."}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-white/10">
            {visibleModules.map((module, moduleIndex) => {
              const completed = module.lessons.filter(
                (lesson) => lesson.completed,
              ).length;
              return (
                <section
                  key={module.id}
                  className="py-9"
                  aria-labelledby={`module-${module.id}`}
                >
                  <div className="grid gap-6 md:grid-cols-[220px_1fr]">
                    <div>
                      <div className="aspect-video overflow-hidden rounded-sm bg-stone-900">
                        {module.cover ? (
                          <img
                            src={module.cover}
                            alt=""
                            className="h-full w-full object-cover opacity-80"
                          />
                        ) : (
                          <div className="flex h-full items-center justify-center">
                            <BookOpen className="h-8 w-8 text-stone-700" />
                          </div>
                        )}
                      </div>
                      <div className="mt-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide">
                        <DomiflixModuleBadge group={module.group} includedInPlan={module.includedInPlan} />
                        <span className="text-stone-600">
                          {completed}/{module.lessons.length}
                        </span>
                      </div>
                    </div>

                    <div className="min-w-0">
                      <p className="text-xs text-stone-600">
                        Módulo {moduleIndex + 1}
                      </p>
                      <h2
                        id={`module-${module.id}`}
                        className="mt-1 text-xl font-semibold tracking-tight"
                      >
                        {module.title}
                      </h2>
                      {module.description && (
                        <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-500">
                          {module.description}
                        </p>
                      )}
                      <ol className="mt-5 border-t border-white/10">
                        {module.lessons.map((lesson, lessonIndex) => {
                          const current =
                            lesson.sequence === firstIncompleteSequence;
                          const future =
                            !lesson.completed &&
                            lesson.sequence > firstIncompleteSequence;
                          return (
                            <li key={lesson.episodeId}>
                              <button
                                onClick={() => openLesson(lesson)}
                                className={cn(
                                  "group flex w-full items-center gap-3 border-b border-white/[0.07] px-1 py-3 text-left transition-colors hover:bg-white/[0.035]",
                                  current && "bg-white/[0.045]",
                                )}
                              >
                                <span
                                  className={cn(
                                    "flex h-7 w-7 shrink-0 items-center justify-center rounded-sm bg-white/[0.06] text-xs font-medium text-stone-500",
                                    lesson.completed && "text-emerald-400",
                                    current && "bg-red-600 text-white",
                                  )}
                                >
                                  {lesson.completed ? (
                                    <Check className="h-3.5 w-3.5" />
                                  ) : current ? (
                                    <Play className="h-3.5 w-3.5 fill-current" />
                                  ) : future ? (
                                    <LockKeyhole className="h-3 w-3" />
                                  ) : (
                                    lessonIndex + 1
                                  )}
                                </span>
                                <span className="min-w-0 flex-1">
                                  <span
                                    className={cn(
                                      "block truncate text-sm font-medium",
                                      future
                                        ? "text-stone-500"
                                        : "text-stone-200",
                                      current && "text-white",
                                    )}
                                  >
                                    {lesson.lessonTitle}
                                  </span>
                                  <span className="mt-0.5 block truncate text-xs text-stone-600">
                                    {current
                                      ? "Próxima aula recomendada"
                                      : lesson.completed
                                        ? "Concluída"
                                        : future
                                          ? "Disponível para consulta"
                                          : "Em andamento"}
                                  </span>
                                </span>
                                {lesson.durationMinutes && (
                                  <span className="hidden items-center gap-1 text-xs text-stone-600 sm:flex">
                                    <Clock3 className="h-3.5 w-3.5" />
                                    {lesson.durationMinutes} min
                                  </span>
                                )}
                                <ArrowRight className="h-4 w-4 text-stone-700 transition-transform group-hover:translate-x-0.5 group-hover:text-stone-300" />
                              </button>
                            </li>
                          );
                        })}
                      </ol>
                    </div>
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </div>

      <ResponsiveDialog
        open={!!futureLesson}
        onOpenChange={(open) => !open && setFutureLesson(null)}
        title="Consultar fora da ordem?"
        description="Sua próxima aula recomendada continuará marcada na trilha."
        overlayId="domiflix-future-lesson"
        overlayPriority={OVERLAY_PRIORITY.userAction}
        footer={
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => setFutureLesson(null)}
            >
              Voltar à trilha
            </Button>
            <Button
              className="flex-1 bg-red-600 text-white hover:bg-red-500"
              onClick={() => futureLesson && navigate(watchUrl(futureLesson))}
            >
              Consultar esta aula
            </Button>
          </div>
        }
      >
        <p className="text-sm text-muted-foreground">
          Você pode abrir “{futureLesson?.lessonTitle}” agora para resolver uma
          dúvida pontual sem alterar a sequência recomendada.
        </p>
      </ResponsiveDialog>
    </main>
  );
}
