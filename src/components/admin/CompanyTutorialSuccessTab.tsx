import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { AlertCircle, BookOpen, CheckCircle2, Clock3, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

type UserProgress = { user_id: string; nome: string | null; email: string | null; aulas_total: number; aulas_iniciadas: number; aulas_concluidas: number; percentual_concluido: number; ultima_aula: string | null; ultima_atividade: string | null; estado_lembrete: string };

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
  if (isLoading) return <div className="py-16 text-center text-sm text-muted-foreground">Carregando progresso dos tutoriais...</div>;
  if (isError) return <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-5 text-sm text-destructive">Não foi possível carregar o progresso da DomiFlix.</div>;
  const completed = users.filter((user) => user.estado_lembrete === "concluida").length;
  const stalled = users.filter((user) => user.estado_lembrete === "parada_7d" || user.estado_lembrete === "nao_iniciada").length;
  const average = users.length ? Math.round(users.reduce((sum, user) => sum + Number(user.percentual_concluido || 0), 0) / users.length) : 0;
  return <div className="space-y-5">
    <div className="grid gap-3 sm:grid-cols-3"><Card><CardContent className="flex items-center gap-3 p-4"><Users className="h-5 w-5 text-muted-foreground" /><div><p className="text-2xl font-semibold">{users.length}</p><p className="text-xs text-muted-foreground">usuários acompanhados</p></div></CardContent></Card><Card><CardContent className="flex items-center gap-3 p-4"><CheckCircle2 className="h-5 w-5 text-emerald-600" /><div><p className="text-2xl font-semibold">{completed}</p><p className="text-xs text-muted-foreground">concluíram a trilha</p></div></CardContent></Card><Card><CardContent className="flex items-center gap-3 p-4"><AlertCircle className="h-5 w-5 text-red-600" /><div><p className="text-2xl font-semibold">{stalled}</p><p className="text-xs text-muted-foreground">pedem acompanhamento</p></div></CardContent></Card></div>
    <Card><CardHeader className="pb-3"><div className="flex items-end justify-between gap-3"><div><CardTitle className="text-base">Tutoriais do sistema</CardTitle><p className="mt-1 text-sm text-muted-foreground">Progresso individual da trilha de onboarding.</p></div><span className="text-2xl font-semibold">{average}%</span></div><Progress value={average} className="mt-3 h-1.5" /></CardHeader><CardContent className="p-0">{users.length === 0 ? <div className="border-t p-8 text-center"><BookOpen className="mx-auto h-7 w-7 text-muted-foreground" /><p className="mt-3 font-medium">Nenhum usuário para acompanhar</p><p className="mt-1 text-sm text-muted-foreground">O progresso aparecerá quando a empresa tiver usuários ativos.</p></div> : <div className="divide-y border-t">{users.map((user) => <div key={user.user_id} className="grid min-w-0 gap-3 p-4 sm:grid-cols-[minmax(180px,1fr)_minmax(180px,.8fr)_auto] sm:items-center"><div className="min-w-0"><p className="truncate font-medium">{user.nome || "Sem nome"}</p><p className="truncate text-xs text-muted-foreground">{user.email}</p></div><div className="min-w-0"><div className="mb-1.5 flex justify-between text-xs"><span>{user.aulas_concluidas} de {user.aulas_total} aulas</span><span className="font-semibold">{Number(user.percentual_concluido || 0)}%</span></div><Progress value={Number(user.percentual_concluido || 0)} className="h-1.5" />{user.ultima_aula && <p className="mt-1.5 max-w-full truncate text-xs text-muted-foreground" title={user.ultima_aula}>Última: {user.ultima_aula}</p>}</div><div className="min-w-0 sm:text-right"><Badge variant="secondary" className={user.estado_lembrete === "parada_7d" || user.estado_lembrete === "nao_iniciada" ? "text-red-700" : user.estado_lembrete === "concluida" ? "text-emerald-700" : "text-amber-700"}>{stateLabel[user.estado_lembrete] || user.estado_lembrete}</Badge><p className="mt-1.5 flex items-center gap-1 text-xs text-muted-foreground sm:justify-end"><Clock3 className="h-3 w-3" />{user.ultima_atividade ? formatDistanceToNow(new Date(user.ultima_atividade), { addSuffix: true, locale: ptBR }) : "sem atividade"}</p></div></div>)}</div>}</CardContent></Card>
  </div>;
}
