import { useQuery } from "@tanstack/react-query";
import { format, parseISO, formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { AlertCircle, BookOpen, CalendarClock, CheckCircle2, ClipboardList, Clock3, UserRound, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { adminKpiClass } from "@/components/admin/adminKpiStyles";

type UserProgress = { user_id: string; nome: string | null; email: string | null; aulas_total: number; aulas_iniciadas: number; aulas_concluidas: number; percentual_concluido: number; ultima_aula: string | null; ultima_atividade: string | null; estado_lembrete: string };
type NextTask = { id: string; title: string; due_date: string | null; assigned_to: string | null; responsible_name: string | null };

const stateLabel: Record<string, string> = { concluida: "Concluiu", nao_iniciada: "Não começou", parada_7d: "Parado há 7+ dias", parada_3d: "Parado há 3+ dias", em_dia: "Em dia" };

export function CompanyTutorialSuccessTab({ companyId }: { companyId: string }) {
  const { data: users = [], isLoading, isError } = useQuery({
    queryKey: ["admin-company-domiflix-users", companyId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("cs_domiflix_usuarios" as any, { p_company_id: companyId });
      if (error) throw error;
      return (data ?? []) as unknown as UserProgress[];
    },
  });
  const { data: nextTask, isError: isTaskError, isLoading: isTaskLoading, refetch: refetchTask } = useQuery({
    queryKey: ["admin-company-next-success-task", companyId],
    queryFn: async (): Promise<NextTask | null> => {
      const { data: task, error } = await (supabase as any).from("admin_tasks").select("id, title, due_date, assigned_to").eq("company_id", companyId).neq("status", "resolvido").order("due_date", { ascending: true, nullsFirst: false }).limit(1).maybeSingle();
      if (error) throw error;
      if (!task) return null;
      const { data: profile, error: profileError } = task.assigned_to ? await supabase.from("profiles").select("full_name").eq("id", task.assigned_to).maybeSingle() : { data: null, error: null };
      if (profileError) throw profileError;
      return { ...task, responsible_name: profile?.full_name ?? null } as NextTask;
    },
    staleTime: 60_000,
  });
  if (isLoading) return <div className="py-16 text-center text-sm text-muted-foreground">Carregando progresso dos tutoriais...</div>;
  if (isError) return <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-5 text-sm text-destructive">Não foi possível carregar o progresso da DomiFlix.</div>;
  const completed = users.filter((user) => user.estado_lembrete === "concluida").length;
  const stalled = users.filter((user) => user.estado_lembrete === "parada_7d" || user.estado_lembrete === "nao_iniciada").length;
  const average = users.length ? Math.round(users.reduce((sum, user) => sum + Number(user.percentual_concluido || 0), 0) / users.length) : 0;
  return <div className="space-y-5">
    <div className="grid gap-3 sm:grid-cols-3"><Card className={adminKpiClass("blue")}><CardContent className="flex items-center gap-3 p-4"><Users className="h-5 w-5" /><div><p className="text-2xl font-semibold">{users.length}</p><p className="text-xs text-white/75">usuários acompanhados</p></div></CardContent></Card><Card className={adminKpiClass("emerald")}><CardContent className="flex items-center gap-3 p-4"><CheckCircle2 className="h-5 w-5" /><div><p className="text-2xl font-semibold">{completed}</p><p className="text-xs text-white/75">concluíram a trilha</p></div></CardContent></Card><Card className={adminKpiClass("rose")}><CardContent className="flex items-center gap-3 p-4"><AlertCircle className="h-5 w-5" /><div><p className="text-2xl font-semibold">{stalled}</p><p className="text-xs text-white/75">pedem acompanhamento</p></div></CardContent></Card></div>
    <Card><CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-base"><ClipboardList className="h-4 w-4" />Próxima ação de sucesso</CardTitle></CardHeader><CardContent>{isTaskLoading ? <p role="status" className="text-sm text-muted-foreground">Carregando próxima ação...</p> : isTaskError ? <div role="alert" className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm text-destructive">Não foi possível carregar a próxima tarefa.</p><Button variant="outline" size="sm" onClick={() => void refetchTask()}>Tentar novamente</Button></div> : nextTask ? <div className="grid gap-2 text-sm sm:grid-cols-[minmax(0,1fr)_auto_auto]"><p className="font-medium">{nextTask.title}</p><span className="inline-flex items-center gap-1 text-muted-foreground"><UserRound className="h-3.5 w-3.5" />{nextTask.responsible_name || "Sem responsável"}</span><span className="inline-flex items-center gap-1 text-muted-foreground"><CalendarClock className="h-3.5 w-3.5" />{nextTask.due_date ? format(parseISO(nextTask.due_date), "dd/MM/yyyy", { locale: ptBR }) : "Sem prazo"}</span></div> : <p className="text-sm text-muted-foreground">Nenhuma tarefa aberta vinculada a esta empresa.</p>}</CardContent></Card>
    <Card><CardHeader className="pb-3"><div className="flex items-end justify-between gap-3"><div><CardTitle className="text-base">Tutoriais do sistema</CardTitle><p className="mt-1 text-sm text-muted-foreground">Progresso individual da trilha de onboarding.</p></div><span className="text-2xl font-semibold">{average}%</span></div><Progress value={average} className="mt-3 h-1.5" /></CardHeader><CardContent className="p-0">{users.length === 0 ? <div className="border-t p-8 text-center"><BookOpen className="mx-auto h-7 w-7 text-muted-foreground" /><p className="mt-3 font-medium">Nenhum usuário para acompanhar</p><p className="mt-1 text-sm text-muted-foreground">O progresso aparecerá quando a empresa tiver usuários ativos.</p></div> : <div className="divide-y border-t">{users.map((user) => <div key={user.user_id} className="grid min-w-0 gap-3 p-4 sm:grid-cols-[minmax(180px,1fr)_minmax(180px,.8fr)_auto] sm:items-center"><div className="min-w-0"><p className="truncate font-medium">{user.nome || "Sem nome"}</p><p className="truncate text-xs text-muted-foreground">{user.email}</p></div><div className="min-w-0"><div className="mb-1.5 flex justify-between text-xs"><span>{user.aulas_concluidas} de {user.aulas_total} aulas</span><span className="font-semibold">{Number(user.percentual_concluido || 0)}%</span></div><Progress value={Number(user.percentual_concluido || 0)} className="h-1.5" />{user.ultima_aula && <p className="mt-1.5 max-w-full truncate text-xs text-muted-foreground" title={user.ultima_aula}>Última: {user.ultima_aula}</p>}</div><div className="min-w-0 sm:text-right"><Badge variant="secondary" className={user.estado_lembrete === "parada_7d" || user.estado_lembrete === "nao_iniciada" ? "text-red-700" : user.estado_lembrete === "concluida" ? "text-emerald-700" : "text-amber-700"}>{stateLabel[user.estado_lembrete] || user.estado_lembrete}</Badge><p className="mt-1.5 flex items-center gap-1 text-xs text-muted-foreground sm:justify-end"><Clock3 className="h-3 w-3" />{user.ultima_atividade ? formatDistanceToNow(new Date(user.ultima_atividade), { addSuffix: true, locale: ptBR }) : "sem atividade"}</p></div></div>)}</div>}</CardContent></Card>
  </div>;
}
