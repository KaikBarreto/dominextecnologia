import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BookOpen, CheckCircle2, ChevronLeft, ChevronRight, Circle, Clock3, Search, UserRound } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { ResponsiveModal as LearningDialog } from "@/components/ui/ResponsiveModal";
import learningLogo from "@/assets/domiflix-logo-horizontal-preto.png";
import learningLogoDark from "@/assets/domiflix-logo-horizontal-branco.png";

type LearningStatus = "not_started" | "in_progress" | "completed";
type Lesson = {
  id: string; title: string; description: string | null; module_title: string;
  cover_url: string | null; season_title: string | null; path_title: string | null;
  completed: boolean; status: LearningStatus; progress_seconds: number; duration_seconds: number;
  estimated_minutes: number | null; last_watched_at: string | null; required_for_user: boolean;
};
type Catalogue = {
  users: { id: string; name: string; email: string | null; active: boolean }[];
  selectedUserId: string | null;
  paths: { id: string; title: string }[];
  modules: { id: string; title: string }[];
  summary: Record<LearningStatus | "all", number>;
  total: number; rows: Lesson[];
};
const STATUS = {
  not_started: { label: "Não iniciado", color: "bg-slate-600 text-white", icon: Circle },
  in_progress: { label: "Em andamento", color: "bg-blue-600 text-white", icon: Clock3 },
  completed: { label: "Concluído", color: "bg-emerald-600 text-white", icon: CheckCircle2 },
};
const PAGE_SIZE = 12;
function time(seconds: number) {
  const value = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(value / 3600);
  return `${hours ? `${hours}:` : ""}${hours ? String(Math.floor(value / 60) % 60).padStart(2, "0") : Math.floor(value / 60)}:${String(value % 60).padStart(2, "0")}`;
}
function percentage(lesson: Lesson) {
  if (lesson.completed) return 100;
  return lesson.duration_seconds > 0 ? Math.min(99, Math.round(lesson.progress_seconds / lesson.duration_seconds * 100)) : null;
}
function lastViewed(value: string | null) {
  if (!value) return "Sem visualização registrada";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Data não disponível" : date.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}
function Cover({ lesson, className }: { lesson: Lesson; className?: string }) {
  const [failed, setFailed] = useState(false);
  return <div className={cn("relative aspect-video overflow-hidden bg-zinc-900", className)}>
    {lesson.cover_url && !failed ? <img src={lesson.cover_url} alt="" loading="lazy" onError={() => setFailed(true)} className="h-full w-full object-cover object-top" /> : <div className="flex h-full flex-col items-center justify-center gap-3 p-5 text-center text-white"><BookOpen className="h-7 w-7 text-white/60" /><span className="line-clamp-2 text-sm font-semibold">{lesson.module_title}</span></div>}
  </div>;
}
function Status({ lesson }: { lesson: Lesson }) {
  const { label, color, icon: Icon } = STATUS[lesson.status];
  return <span className={cn("inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium", color)}><Icon className="h-3.5 w-3.5" />{label}</span>;
}

export function CompanyLearningCatalog({ companyId }: { companyId: string }) {
  const catalogueRef = useRef<HTMLElement>(null);
  const [userSearch, setUserSearch] = useState("");
  const [userId, setUserId] = useState<string | null>(null);
  const [pathId, setPathId] = useState("all");
  const [moduleId, setModuleId] = useState("all");
  const [status, setStatus] = useState<LearningStatus | "all">("all");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [detail, setDetail] = useState<Lesson | null>(null);
  useEffect(() => {
    const timer = setTimeout(() => { setDebouncedSearch(search.trim()); setPage(1); }, 300);
    return () => clearTimeout(timer);
  }, [search]);
  const query = useQuery({
    queryKey: ["admin-company-learning-catalog", companyId, userId, pathId, moduleId, debouncedSearch, status, page],
    enabled: !!companyId,
    staleTime: 60_000,
    placeholderData: (previous, previousQuery) => previousQuery?.queryKey[1] === companyId ? previous : undefined,
    queryFn: async (): Promise<Catalogue> => {
      const { data, error } = await supabase.rpc("admin_company_learning_catalog" as any, {
        p_company_id: companyId, p_user_id: userId,
        p_path_id: pathId === "all" ? null : pathId,
        p_title_id: moduleId === "all" ? null : moduleId,
        p_search: debouncedSearch, p_status: status, p_page: page, p_page_size: PAGE_SIZE,
      });
      if (error) throw error;
      return data as unknown as Catalogue;
    },
  });
  const data = query.data;
  const selectedUser = data?.users.find(user => user.id === (userId ?? data.selectedUserId));
  const pages = Math.max(1, Math.ceil((data?.total ?? 0) / PAGE_SIZE));
  const clearFilters = () => { setSearch(""); setDebouncedSearch(""); setPathId("all"); setModuleId("all"); setStatus("all"); setPage(1); };

  const changePage = (nextPage: number) => { setPage(nextPage); catalogueRef.current?.scrollIntoView({ block: "start", behavior: "instant" }); };

  return <section ref={catalogueRef} className="min-w-0 scroll-mt-24 space-y-3" aria-label="Catálogo de aprendizado por usuário">
    <div className="flex items-center gap-3 border-b pb-3">
      <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2">
        <img src={learningLogo} alt="DomiFlix" className="h-5 w-auto max-w-[160px] object-contain object-left dark:hidden" />
        <img src={learningLogoDark} alt="DomiFlix" className="hidden h-5 w-auto max-w-[160px] object-contain object-left dark:block" />
        <h3 className="text-sm font-semibold">O que cada pessoa assistiu</h3>
      </div>
    </div>
    <div className="grid min-w-0 gap-4 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-5">
      <aside className="hidden min-w-0 space-y-3 lg:block lg:border-r lg:pr-4" aria-label="Usuários da empresa">
        <div className="flex items-center justify-between"><h4 className="text-sm font-semibold">Usuários</h4><span className="text-xs text-muted-foreground">{data?.users.length ?? "—"}</span></div>
        <Input aria-label="Buscar usuário" placeholder="Buscar usuário..." value={userSearch} onChange={event => setUserSearch(event.target.value)} className="h-9" />
        <div className="max-h-[65vh] space-y-1 overflow-y-auto">
          {data?.users.filter(user => `${user.name} ${user.email || ""}`.toLocaleLowerCase("pt-BR").includes(userSearch.toLocaleLowerCase("pt-BR"))).map(user => <button key={user.id} type="button" aria-pressed={user.id === (userId ?? data.selectedUserId)} onClick={() => { setUserId(user.id); setPage(1); setDetail(null); }} className={cn("w-full rounded-lg px-3 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", user.id === (userId ?? data.selectedUserId) ? "bg-primary text-primary-foreground" : "hover:bg-muted")}>
            <span className="block break-words text-sm font-medium">{user.name}</span>
            {user.email && <span className="mt-0.5 block truncate text-xs opacity-70" title={user.email}>{user.email}</span>}
            {!user.active && <span className="mt-1 block text-xs opacity-70">Inativo</span>}
          </button>)}
          {query.isLoading && !data && <Skeleton className="h-28 w-full" />}
          {data && !data.users.some(user => `${user.name} ${user.email || ""}`.toLocaleLowerCase("pt-BR").includes(userSearch.toLocaleLowerCase("pt-BR"))) && <p className="py-3 text-xs text-muted-foreground">Nenhum usuário encontrado.</p>}
        </div>
      </aside>
      <div className="min-w-0 space-y-3">
      <div className="w-full space-y-2 lg:hidden">
        <Label htmlFor={`learning-user-${companyId}`}>Usuário da empresa</Label>
        <Select value={userId ?? data?.selectedUserId ?? ""} onValueChange={value => { setUserId(value); setPage(1); setDetail(null); }} disabled={!data?.users.length}>
          <SelectTrigger id={`learning-user-${companyId}`} className="w-full [&>span]:truncate"><SelectValue placeholder={query.isLoading ? "Carregando usuários..." : "Nenhum usuário"} /></SelectTrigger>
          <SelectContent>{data?.users.map(user => <SelectItem key={user.id} value={user.id}>{user.name}{!user.active ? " (inativo)" : ""}{data.users.filter(other => other.name === user.name).length > 1 && user.email ? ` · ${user.email}` : ""}</SelectItem>)}</SelectContent>
        </Select>
      </div>

    {query.isError ? <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-5"><p className="text-sm">Não foi possível carregar o catálogo e o progresso.</p><Button variant="outline" onClick={() => void query.refetch()}>Tentar novamente</Button></div> : <>
      <Tabs value={pathId} onValueChange={value => { setPathId(value); setModuleId("all"); setPage(1); }}>
        <TabsList variant="underline" className="max-w-full" aria-label="Trilhas do catálogo">
          <TabsTrigger value="all" variant="underline">Todo o conteúdo</TabsTrigger>
          {data?.paths.map(path => <TabsTrigger key={path.id} value={path.id} variant="underline">{path.title}</TabsTrigger>)}
        </TabsList>
      </Tabs>
      <div className="grid min-w-0 gap-2 sm:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_180px_160px]">
        <div className="relative min-w-0 sm:col-span-2 xl:col-span-1"><Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input aria-label="Buscar conteúdo" placeholder="Buscar aula ou módulo..." value={search} maxLength={200} onChange={event => setSearch(event.target.value)} className="pl-9" /></div>
        <Select value={moduleId} onValueChange={value => { setModuleId(value); setPage(1); }}><SelectTrigger aria-label="Filtrar módulo" className="min-w-0 [&>span]:truncate"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Todos os módulos</SelectItem>{data?.modules.map(module => <SelectItem key={module.id} value={module.id}>{module.title}</SelectItem>)}</SelectContent></Select>
        <Select value={status} onValueChange={value => { setStatus(value as LearningStatus | "all"); setPage(1); }}><SelectTrigger aria-label="Filtrar visualização"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Todos os status</SelectItem>{Object.entries(STATUS).map(([key, state]) => <SelectItem key={key} value={key}>{state.label}</SelectItem>)}</SelectContent></Select>
      </div>
      {data && !query.isPlaceholderData && selectedUser && <div className="flex flex-wrap items-center justify-between gap-x-5 gap-y-2 text-sm">
        <p className="flex min-w-0 items-center gap-2"><UserRound className="h-4 w-4 shrink-0 text-muted-foreground" /><span className="break-words font-medium">{selectedUser.name}</span></p>
        <p className="text-xs text-muted-foreground"><strong className="text-foreground">{data.summary.completed}</strong> concluídos · <strong className="text-foreground">{data.summary.in_progress}</strong> em andamento · <strong className="text-foreground">{data.summary.not_started}</strong> não iniciados</p>
      </div>}
      {query.isLoading || query.isPlaceholderData ? <div role="status" aria-label="Carregando catálogo" className="space-y-2">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-24 rounded-lg" />)}</div> : !selectedUser ? <div className="rounded-xl border border-dashed px-6 py-12 text-center"><UserRound className="mx-auto mb-3 h-7 w-7 text-muted-foreground" /><p className="font-medium">Nenhum usuário nesta empresa</p><p className="mt-1 text-sm text-muted-foreground">O acompanhamento ficará disponível quando houver um usuário vinculado.</p></div> : !data?.rows.length ? <div className="rounded-xl border border-dashed px-6 py-12 text-center"><Search className="mx-auto mb-3 h-7 w-7 text-muted-foreground" /><p className="font-medium">Nenhuma aula neste filtro</p><p className="mt-1 text-sm text-muted-foreground">Busque outro conteúdo ou ajuste os filtros de visualização.</p><Button variant="outline" className="mt-4" onClick={clearFilters}>Limpar filtros</Button></div> : <>
        <div className="space-y-2">
          {data.rows.map(lesson => {
            const percent = percentage(lesson);
            return <button key={lesson.id} type="button" onClick={() => setDetail(lesson)} aria-label={`Ver detalhes: ${lesson.title}`} className="group grid w-full min-w-0 grid-cols-[72px_minmax(0,1fr)] items-center gap-x-3 gap-y-2 border-b py-3 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:grid-cols-[96px_minmax(0,1fr)_150px]">
              <Cover lesson={lesson} className="w-full rounded-md" />
              <div className="min-w-0 space-y-1.5">
                <p className="text-xs text-muted-foreground">{lesson.module_title}{lesson.season_title ? ` · ${lesson.season_title}` : ""}</p>
                <h4 className="text-sm font-semibold leading-snug">{lesson.title}</h4>
                <Status lesson={lesson} />
              </div>
              <div className="col-start-2 min-w-0 space-y-1.5 sm:col-start-auto">
                <div className="flex flex-wrap justify-between gap-1 text-xs tabular-nums"><span>{lesson.status === "not_started" ? "Não iniciado" : lesson.completed && lesson.progress_seconds <= 1 ? "Sem posição salva" : `${time(lesson.progress_seconds)}${lesson.duration_seconds > 0 ? ` / ${time(lesson.duration_seconds)}` : " registrados"}`}</span>{percent !== null && <span className="font-semibold">{percent}%</span>}</div>
                <Progress value={percent ?? 0} aria-label={`Conclusão de ${lesson.title}`} aria-valuenow={percent ?? 0} className="h-1 bg-zinc-200 dark:bg-zinc-700" />
                <p className="text-[11px] text-muted-foreground">{lesson.last_watched_at ? lastViewed(lesson.last_watched_at) : "Sem visualização"}</p>
              </div>
            </button>;
          })}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4"><p className="text-xs text-muted-foreground">{(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, data.total)} de {data.total} aulas</p><div className="flex items-center gap-2"><Button size="sm" variant="outline" aria-label="Página anterior do catálogo" disabled={page <= 1} onClick={() => changePage(page - 1)}><ChevronLeft className="h-4 w-4" /></Button><span className="text-xs tabular-nums">{page} / {pages}</span><Button size="sm" variant="outline" aria-label="Próxima página do catálogo" disabled={page >= pages} onClick={() => changePage(page + 1)}><ChevronRight className="h-4 w-4" /></Button></div></div>
      </>}
    </>}
    <p className="text-xs leading-relaxed text-muted-foreground">O catálogo inclui todas as aulas publicadas, inclusive conteúdos opcionais. O progresso mostra a posição salva pelo player; abrir uma aula sem reproduzir não conta como início.</p>
      </div>
    </div>
    <LearningDialog open={!!detail} onOpenChange={open => !open && setDetail(null)} title={detail?.title || "Detalhes da aula"} description={detail?.module_title} className="sm:max-w-2xl" footer={<div className="flex justify-end"><Button variant="outline" className="w-full sm:w-auto" onClick={() => setDetail(null)}>Fechar</Button></div>}>
      {detail && <div className="space-y-4 pb-2"><Cover lesson={detail} className="rounded-lg" /><div className="flex flex-wrap items-center justify-between gap-2"><Status lesson={detail} /><p className="text-sm font-medium">{selectedUser?.name}</p></div>{detail.description && <p className="whitespace-pre-line text-sm text-muted-foreground">{detail.description}</p>}<dl className="grid gap-4 text-sm sm:grid-cols-2"><div><dt className="text-muted-foreground">Posição registrada</dt><dd className="mt-1 font-semibold tabular-nums">{detail.status === "not_started" ? "Não iniciado" : detail.completed && detail.progress_seconds <= 1 ? "Indisponível neste registro" : time(detail.progress_seconds)}</dd></div><div><dt className="text-muted-foreground">Duração</dt><dd className="mt-1 font-semibold tabular-nums">{detail.duration_seconds > 0 ? time(detail.duration_seconds) : detail.estimated_minutes ? `Aprox. ${detail.estimated_minutes} min` : "Não informada"}</dd></div><div><dt className="text-muted-foreground">Último registro</dt><dd className="mt-1 font-medium">{lastViewed(detail.last_watched_at)}</dd></div><div><dt className="text-muted-foreground">Na trilha deste usuário</dt><dd className="mt-1 font-medium">{detail.required_for_user ? "Obrigatória no onboarding" : "Conteúdo complementar"}</dd></div></dl><Progress value={percentage(detail) ?? 0} aria-label="Conclusão da aula" aria-valuenow={percentage(detail) ?? 0} className="h-2 bg-zinc-200 dark:bg-zinc-700" /></div>}
    </LearningDialog>
  </section>;
}
