import { useMemo, useState } from 'react';
import {
  ArrowLeft, BarChart3, ClipboardList, MessageSquareText, Pencil, Plus, Power,
  RefreshCw, Search, ThumbsDown, ThumbsUp, Trash2, Users,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { NoticeBanner } from '@/components/ui/NoticeBanner';
import { RowActionsMenu } from '@/components/ui/RowActionsMenu';
import { EmptyState } from '@/components/mobile/EmptyState';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { AdminNpsSurveyDialog } from '@/components/admin/AdminNpsSurveyDialog';
import {
  useAdminNpsResponses, useAdminNpsSurveys,
  type AdminNpsSurvey, type AdminNpsSurveyInput, type AdminNpsResponse,
} from '@/hooks/useAdminNpsSurveys';
import { adminNpsClassification, getAdminNpsMetrics } from '@/lib/adminNps';
import { fuzzyIncludes } from '@/lib/utils';
import { cn } from '@/lib/utils';

type ClassificationFilter = 'all' | 'promoter' | 'passive' | 'detractor';

function formatDate(value: string | null, withTime = false): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('pt-BR', withTime
    ? { dateStyle: 'short', timeStyle: 'short' }
    : { dateStyle: 'short' });
}

function surveyStatus(survey: AdminNpsSurvey): { label: string; className: string } {
  if (!survey.is_active) return { label: 'Pausada', className: 'bg-muted text-foreground hover:bg-muted' };
  const now = Date.now();
  if (survey.starts_at && new Date(survey.starts_at).getTime() > now) return { label: 'Programada', className: 'bg-info text-info-foreground hover:bg-info' };
  if (survey.ends_at && new Date(survey.ends_at).getTime() < now) return { label: 'Encerrada', className: 'bg-muted text-foreground hover:bg-muted' };
  return { label: 'Ativa', className: 'bg-success text-success-foreground hover:bg-success' };
}

export function AdminNpsTab() {
  const {
    surveys, isLoading, isError, refetch, createSurvey, updateSurvey,
    toggleSurvey, deleteSurvey, isSaving, isMutating,
  } = useAdminNpsSurveys();
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<AdminNpsSurvey | null>(null);
  const [editing, setEditing] = useState<AdminNpsSurvey | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [toDelete, setToDelete] = useState<AdminNpsSurvey | null>(null);

  const filtered = useMemo(() => surveys.filter((survey) => (
    !search.trim() || fuzzyIncludes(`${survey.title} ${survey.description ?? ''}`, search)
  )), [surveys, search]);

  const submit = async (input: AdminNpsSurveyInput & { id?: string }) => {
    try {
      if (input.id) {
        await updateSurvey(input as AdminNpsSurveyInput & { id: string });
        setSelected((current) => current?.id === input.id ? { ...current, ...input } : current);
      } else await createSurvey(input);
      setFormOpen(false);
    } catch {
      // Toast do hook; mantém o formulário e o rascunho abertos.
    }
  };

  return (
    <div className="space-y-4">
      <div
        className={cn(
          'flex-wrap items-start justify-between gap-3',
          selected ? 'hidden lg:flex' : 'flex',
        )}
      >
        <div>
          <h2 className="text-lg font-semibold">Pesquisas NPS</h2>
          <p className="text-sm text-muted-foreground">Satisfação, recomendação, comentários e convite para avaliar a Dominex no Google.</p>
        </div>
        <Button onClick={() => { setEditing(null); setFormOpen(true); }} className="gap-2"><Plus className="h-4 w-4" /> Nova pesquisa</Button>
      </div>

      {isError ? (
        <NoticeBanner variant="neutral" title="Não foi possível carregar as pesquisas" action={(
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => void refetch()}><RefreshCw className="h-3.5 w-3.5" /> Tentar novamente</Button>
        )}>Confira sua conexão e tente outra vez.</NoticeBanner>
      ) : (
        <div className={cn('grid min-h-[30rem] gap-4', selected ? 'lg:grid-cols-[22rem_minmax(0,1fr)]' : '')}>
          <section className={cn('space-y-3', selected && 'hidden lg:block')} aria-label="Lista de pesquisas NPS">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar pesquisa..." className="pl-9" />
            </div>
            <Card>
              <CardContent className="p-0">
                {isLoading && <p className="p-6 text-sm text-muted-foreground">Carregando pesquisas...</p>}
                {!isLoading && surveys.length === 0 && (
                  <EmptyState icon={<ClipboardList className="h-12 w-12" />} title="Nenhuma pesquisa criada" description="Publique a primeira pesquisa de satisfação da base Dominex." action={{ label: 'Nova pesquisa', onClick: () => setFormOpen(true) }} />
                )}
                {!isLoading && surveys.length > 0 && filtered.length === 0 && <p className="p-6 text-center text-sm text-muted-foreground">Nenhuma pesquisa corresponde à busca.</p>}
                <div className="divide-y">
                  {filtered.map((survey) => {
                    const status = surveyStatus(survey);
                    const chosen = selected?.id === survey.id;
                    return (
                      <div key={survey.id} className={cn('flex items-start gap-2 p-3 transition-colors', chosen && 'bg-muted/60')}>
                        <button type="button" onClick={() => setSelected(survey)} className="min-w-0 flex-1 space-y-1.5 text-left">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge className={status.className}>{status.label}</Badge>
                            <span className="break-words font-medium">{survey.title}</span>
                          </div>
                          <p className="line-clamp-2 text-sm text-muted-foreground">{survey.description || 'Sem apresentação.'}</p>
                          <p className="text-xs text-muted-foreground">
                            {survey.target_audience === 'all' ? 'Base toda' : `${survey.target_company_ids.length} empresas`}
                            {' · '}{survey.starts_at ? formatDate(survey.starts_at) : 'imediata'} até {survey.ends_at ? formatDate(survey.ends_at) : 'sem prazo'}
                          </p>
                        </button>
                        <RowActionsMenu actions={[
                          { label: 'Ver relatório', icon: BarChart3, onClick: () => setSelected(survey) },
                          { label: 'Editar', icon: Pencil, variant: 'edit', onClick: () => { setEditing(survey); setFormOpen(true); } },
                          { label: survey.is_active ? 'Pausar' : 'Ativar', icon: Power, onClick: () => void toggleSurvey({ id: survey.id, isActive: !survey.is_active }) },
                          { label: 'Excluir', icon: Trash2, variant: 'delete', onClick: () => setToDelete(survey) },
                        ]} />
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
            <p className="text-xs text-muted-foreground">Mostrando {filtered.length} de {surveys.length} pesquisas</p>
          </section>

          <section className={cn(!selected && 'hidden lg:block')} aria-label="Relatório da pesquisa selecionada">
            {selected ? (
              <AdminNpsReport survey={selected} onBack={() => setSelected(null)} />
            ) : (
              <div className="grid min-h-[30rem] place-items-center rounded-lg border border-dashed p-6 text-center">
                <div className="max-w-sm">
                  <BarChart3 className="mx-auto h-10 w-10 text-muted-foreground" />
                  <h3 className="mt-3 font-semibold">Selecione uma pesquisa</h3>
                  <p className="mt-1 text-sm text-muted-foreground">O relatório de satisfação, NPS e comentários aparecerá aqui.</p>
                </div>
              </div>
            )}
          </section>
        </div>
      )}

      <AdminNpsSurveyDialog open={formOpen} onOpenChange={setFormOpen} survey={editing} onSubmit={submit} isSaving={isSaving} />
      <AlertDialog open={Boolean(toDelete)} onOpenChange={(open) => !open && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir pesquisa e respostas</AlertDialogTitle>
            <AlertDialogDescription>A pesquisa “{toDelete?.title}” e todas as respostas vinculadas serão excluídas permanentemente.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={isMutating}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async (event) => {
                event.preventDefault();
                if (!toDelete) return;
                try {
                  await deleteSurvey(toDelete.id);
                  if (selected?.id === toDelete.id) setSelected(null);
                  setToDelete(null);
                } catch { /* toast do hook */ }
              }}
            >Excluir pesquisa</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function AdminNpsReport({ survey, onBack }: { survey: AdminNpsSurvey; onBack: () => void }) {
  const { data: responses = [], isLoading, isError, refetch } = useAdminNpsResponses(survey.id);
  const [search, setSearch] = useState('');
  const [classification, setClassification] = useState<ClassificationFilter>('all');
  const metrics = useMemo(() => getAdminNpsMetrics(responses), [responses]);
  const filtered = useMemo(() => responses.filter((response) => {
    const matchesSearch = !search.trim() || fuzzyIncludes(`${response.user_name} ${response.user_email ?? ''} ${response.company_name}`, search);
    const matchesClass = classification === 'all' || adminNpsClassification(response.score) === classification;
    return matchesSearch && matchesClass;
  }), [responses, search, classification]);
  const feedback = responses.filter((response) => Boolean(response.feedback?.trim()));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2">
          <Button variant="outline" size="icon" className="shrink-0 lg:hidden" onClick={onBack} aria-label="Voltar para pesquisas"><ArrowLeft className="h-4 w-4" /></Button>
          <div className="min-w-0">
            <h3 className="break-words text-lg font-semibold">Relatório: {survey.title}</h3>
            <p className="text-sm text-muted-foreground">{survey.description || 'Pesquisa de satisfação da base Dominex.'}</p>
          </div>
        </div>
        <Badge className={surveyStatus(survey).className}>{surveyStatus(survey).label}</Badge>
      </div>

      {isError && <NoticeBanner variant="neutral" title="Não foi possível carregar as respostas" action={<Button size="sm" variant="outline" onClick={() => void refetch()}>Tentar novamente</Button>}>Nenhum dado parcial foi usado.</NoticeBanner>}
      {isLoading && <p className="py-8 text-center text-sm text-muted-foreground">Carregando respostas...</p>}

      {!isLoading && !isError && (
        <>
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <MetricCard label="Respostas" value={metrics.total} icon={ClipboardList} />
            <MetricCard label="Usuários únicos" value={responses.length} icon={Users} />
            <MetricCard label="NPS" value={metrics.total ? metrics.nps : '—'} icon={BarChart3} />
            <MetricCard label="Gostando" value={metrics.total ? `${metrics.enjoyingPercent}%` : '—'} icon={ThumbsUp} />
          </div>

          {responses.length === 0 ? (
            <div className="rounded-lg border border-dashed p-8 text-center">
              <MessageSquareText className="mx-auto h-10 w-10 text-muted-foreground" />
              <h4 className="mt-3 font-semibold">Ainda não há respostas</h4>
              <p className="mt-1 text-sm text-muted-foreground">Quando usuários elegíveis responderem após o login, o relatório será preenchido.</p>
            </div>
          ) : (
            <>
              <Card>
                <CardContent className="grid gap-6 p-4 xl:grid-cols-2">
                  <Distribution title="Recomendação NPS" items={[
                    { label: 'Promotores (9–10)', count: metrics.promoters, className: 'bg-success' },
                    { label: 'Passivos (7–8)', count: metrics.passives, className: 'bg-warning' },
                    { label: 'Detratores (0–6)', count: metrics.detractors, className: 'bg-destructive' },
                  ]} total={metrics.total} />
                  <Distribution title="Está gostando da Dominex?" items={[
                    { label: 'Sim', count: metrics.enjoyingYes, className: 'bg-success' },
                    { label: 'Não', count: metrics.enjoyingNo, className: 'bg-destructive' },
                  ]} total={metrics.total} />
                </CardContent>
              </Card>

              {feedback.length > 0 && (
                <section className="space-y-2">
                  <h4 className="flex items-center gap-2 font-semibold"><MessageSquareText className="h-4 w-4 text-info" /> Sugestões de melhoria <Badge className="bg-info text-info-foreground hover:bg-info">{feedback.length}</Badge></h4>
                  <Card><CardContent className="max-h-72 divide-y overflow-y-auto p-0">
                    {feedback.map((response) => <FeedbackRow key={response.id} response={response} />)}
                  </CardContent></Card>
                </section>
              )}

              <section className="space-y-3">
                <h4 className="font-semibold">Respostas detalhadas</h4>
                <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_12rem]">
                  <div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar nome, email ou empresa..." className="pl-9" /></div>
                  <Select value={classification} onValueChange={(value) => setClassification(value as ClassificationFilter)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todas as notas</SelectItem>
                      <SelectItem value="promoter">Promotores</SelectItem>
                      <SelectItem value="passive">Passivos</SelectItem>
                      <SelectItem value="detractor">Detratores</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <p className="text-xs text-muted-foreground">Mostrando {filtered.length} de {responses.length} respostas</p>
                <Card><CardContent className="divide-y p-0">
                  {filtered.length === 0 && <p className="p-6 text-center text-sm text-muted-foreground">Nenhuma resposta corresponde aos filtros.</p>}
                  {filtered.map((response) => <ResponseRow key={response.id} response={response} />)}
                </CardContent></Card>
              </section>
            </>
          )}
        </>
      )}
    </div>
  );
}

function MetricCard({ label, value, icon: Icon }: { label: string; value: string | number; icon: typeof Users }) {
  return <Card><CardContent className="p-4"><div className="flex items-center gap-2 text-sm text-muted-foreground"><Icon className="h-4 w-4" /> {label}</div><p className="mt-2 text-2xl font-bold tabular-nums">{value}</p></CardContent></Card>;
}

function Distribution({ title, items, total }: { title: string; items: { label: string; count: number; className: string }[]; total: number }) {
  return <div className="space-y-3"><h4 className="font-semibold">{title}</h4>{items.map((item) => { const percent = total ? Math.round((item.count / total) * 100) : 0; return <div key={item.label} className="space-y-1"><div className="flex justify-between gap-3 text-sm"><span>{item.label}</span><span className="shrink-0 font-medium tabular-nums">{item.count} · {percent}%</span></div><div className="h-2 overflow-hidden rounded-full bg-muted"><div className={cn('h-full rounded-full', item.className)} style={{ width: `${percent}%` }} /></div></div>; })}</div>;
}

function classificationBadge(score: number) {
  const type = adminNpsClassification(score);
  if (type === 'promoter') return 'bg-success text-success-foreground hover:bg-success';
  if (type === 'passive') return 'bg-warning text-warning-foreground hover:bg-warning';
  return 'bg-destructive text-destructive-foreground hover:bg-destructive';
}

function FeedbackRow({ response }: { response: AdminNpsResponse }) {
  return <div className="space-y-2 p-3 sm:p-4"><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="font-medium">{response.user_name}</p><p className="text-xs text-muted-foreground">{response.company_name}</p></div><Badge className={classificationBadge(response.score)}>Nota {response.score}</Badge></div><blockquote className="rounded-md bg-muted px-3 py-2 text-sm italic">“{response.feedback}”</blockquote></div>;
}

function ResponseRow({ response }: { response: AdminNpsResponse }) {
  return <div className="space-y-2 p-3 sm:p-4"><div className="flex flex-wrap items-start justify-between gap-2"><div className="min-w-0"><p className="break-words font-medium">{response.user_name}</p><p className="break-words text-xs text-muted-foreground">{response.company_name}{response.user_email ? ` · ${response.user_email}` : ''}</p></div><div className="flex shrink-0 items-center gap-2"><Badge className={classificationBadge(response.score)}>{response.score}</Badge><span className="text-xs text-muted-foreground">{formatDate(response.responded_at, true)}</span></div></div><div className="flex flex-wrap items-center gap-3 text-sm"><span className={response.is_enjoying ? 'text-success' : 'text-destructive'}>{response.is_enjoying ? <><ThumbsUp className="mr-1 inline h-4 w-4" /> Está gostando</> : <><ThumbsDown className="mr-1 inline h-4 w-4" /> Não está gostando</>}</span>{response.feedback && <span className="text-muted-foreground">Comentário enviado</span>}</div></div>;
}
