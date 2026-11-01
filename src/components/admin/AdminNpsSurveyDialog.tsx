import { useEffect, useMemo, useRef, useState } from 'react';
import { Building2, Filter, Globe2, Link2 } from 'lucide-react';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { DatePicker, toIsoDate } from '@/components/ui/DatePicker';
import { LabeledSwitch } from '@/components/ui/labeled-switch';
import { NoticeBanner } from '@/components/ui/NoticeBanner';
import { AdminCompanyMultiSelect } from '@/components/admin/AdminCompanyMultiSelect';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAdminAudienceCompanies, useDominexGoogleReviewUrl } from '@/hooks/useAdminAudienceCompanies';
import type { AdminNpsSurvey, AdminNpsSurveyInput } from '@/hooks/useAdminNpsSurveys';
import {
  buildAudienceSnapshot,
  filterAudienceCompanies,
  uniqueSorted,
  type AdminNpsAudienceFilters,
} from '@/lib/adminNps';
import { cn } from '@/lib/utils';

type AudienceMode = 'all' | 'specific_companies' | 'filters';

const DEFAULT_ENJOYMENT = 'Você está gostando de usar a Dominex?';
const DEFAULT_RECOMMENDATION = 'De 0 a 10, o quanto você indicaria a Dominex?';
const DEFAULT_FEEDBACK = 'Quer contar o que podemos melhorar?';
const ALL_VALUE = '__all__';

function startOfDayIso(date: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 0, 0, 0).toISOString();
}

function endOfDayIso(date: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 23, 59, 59).toISOString();
}

function isoToDate(value: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : toIsoDate(date);
}

function inferMode(survey: AdminNpsSurvey | null): AudienceMode {
  if (!survey || survey.target_audience === 'all') return 'all';
  return survey.audience_snapshot?.modo === 'filtros' ? 'filters' : 'specific_companies';
}

function snapshotFilter(value: unknown): string {
  const normalized = typeof value === 'string' ? value : '';
  return normalized === 'todos' ? '' : normalized;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  survey: AdminNpsSurvey | null;
  onSubmit: (input: AdminNpsSurveyInput & { id?: string }) => Promise<void>;
  isSaving: boolean;
}

export function AdminNpsSurveyDialog({ open, onOpenChange, survey, onSubmit, isSaving }: Props) {
  const [tab, setTab] = useState('conteudo');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [enjoymentQuestion, setEnjoymentQuestion] = useState(DEFAULT_ENJOYMENT);
  const [recommendationQuestion, setRecommendationQuestion] = useState(DEFAULT_RECOMMENDATION);
  const [feedbackPrompt, setFeedbackPrompt] = useState(DEFAULT_FEEDBACK);
  const [audienceMode, setAudienceMode] = useState<AudienceMode>('all');
  const [companyIds, setCompanyIds] = useState<string[]>([]);
  const [filters, setFilters] = useState<AdminNpsAudienceFilters>({ status: '', plan: '', segment: '' });
  const [active, setActive] = useState<'yes' | 'no'>('yes');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [googleUrl, setGoogleUrl] = useState('');
  const [googleMinScore, setGoogleMinScore] = useState('9');
  const canonicalApplied = useRef(false);

  const { data: companies = [], isLoading: companiesLoading } = useAdminAudienceCompanies();
  const { data: canonicalGoogleUrl, isLoading: googleLoading } = useDominexGoogleReviewUrl();

  useEffect(() => {
    if (!open) return;
    canonicalApplied.current = false;
    setTab('conteudo');
    setTitle(survey?.title ?? 'Satisfação com a Dominex');
    setDescription(survey?.description ?? 'Ajude a Dominex a melhorar sua experiência no sistema.');
    setEnjoymentQuestion(survey?.enjoyment_question ?? DEFAULT_ENJOYMENT);
    setRecommendationQuestion(survey?.recommendation_question ?? DEFAULT_RECOMMENDATION);
    setFeedbackPrompt(survey?.feedback_prompt ?? DEFAULT_FEEDBACK);
    setAudienceMode(inferMode(survey));
    setCompanyIds(survey?.target_company_ids ?? []);
    setFilters({
      status: snapshotFilter(survey?.audience_snapshot?.status),
      plan: snapshotFilter(survey?.audience_snapshot?.plano),
      segment: snapshotFilter(survey?.audience_snapshot?.segmento),
    });
    setActive(survey?.is_active === false ? 'no' : 'yes');
    setStartsAt(isoToDate(survey?.starts_at ?? null));
    setEndsAt(isoToDate(survey?.ends_at ?? null));
    setGoogleUrl(survey?.google_review_url ?? '');
    setGoogleMinScore(String(survey?.google_review_min_score ?? 9));
  }, [open, survey]);

  useEffect(() => {
    if (!open || survey || !canonicalGoogleUrl || canonicalApplied.current) return;
    canonicalApplied.current = true;
    setGoogleUrl((current) => current || canonicalGoogleUrl);
  }, [canonicalGoogleUrl, open, survey]);

  const options = useMemo(() => ({
    statuses: uniqueSorted(companies.map((company) => company.subscription_status)),
    plans: uniqueSorted(companies.map((company) => company.subscription_plan)),
    segments: uniqueSorted(companies.map((company) => company.segment)),
  }), [companies]);

  const filteredCompanies = useMemo(
    () => filterAudienceCompanies(companies, filters),
    [companies, filters],
  );

  const resolvedCompanyIds = audienceMode === 'filters'
    ? filteredCompanies.map((company) => company.id)
    : companyIds;

  const error = useMemo(() => {
    if (!title.trim()) return 'Dê um título à pesquisa.';
    if (!enjoymentQuestion.trim() || !recommendationQuestion.trim()) return 'Preencha as duas perguntas da pesquisa.';
    if (audienceMode !== 'all' && resolvedCompanyIds.length === 0) return 'Esse público não contém nenhuma empresa.';
    if (googleUrl.trim() && !/^https?:\/\//i.test(googleUrl.trim())) return 'O link do Google precisa começar com http:// ou https://';
    if (startsAt && endsAt && startsAt > endsAt) return 'A data final é anterior à data inicial.';
    return null;
  }, [title, enjoymentQuestion, recommendationQuestion, audienceMode, resolvedCompanyIds.length, googleUrl, startsAt, endsAt]);

  const submit = async () => {
    if (error) return;
    const targetAudience = audienceMode === 'all' ? 'all' : 'specific_companies';
    const audienceSnapshot = audienceMode === 'filters'
      ? buildAudienceSnapshot(filters, resolvedCompanyIds.length)
      : { modo: audienceMode, empresas_materializadas: targetAudience === 'all' ? companies.length : companyIds.length };

    await onSubmit({
      ...(survey ? { id: survey.id } : {}),
      title: title.trim(),
      description: description.trim() || null,
      enjoyment_question: enjoymentQuestion.trim(),
      recommendation_question: recommendationQuestion.trim(),
      feedback_prompt: feedbackPrompt.trim() || null,
      trigger: 'login',
      is_active: active === 'yes',
      starts_at: startsAt ? startOfDayIso(startsAt) : null,
      ends_at: endsAt ? endOfDayIso(endsAt) : null,
      target_audience: targetAudience,
      target_company_ids: targetAudience === 'all' ? [] : resolvedCompanyIds,
      audience_snapshot: audienceSnapshot,
      google_review_url: googleUrl.trim() || null,
      google_review_min_score: googleUrl.trim() ? Number(googleMinScore) : null,
    });
  };

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      title={survey ? 'Editar pesquisa NPS' : 'Nova pesquisa NPS'}
      description="A pesquisa aparece após o login e permanece pendente até a pessoa responder."
      className="sm:max-w-[720px]"
      footer={(
        <div className="space-y-2">
          {error && <p className="text-xs text-destructive">{error}</p>}
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button className="flex-1" onClick={submit} disabled={Boolean(error) || isSaving}>
              {isSaving ? 'Salvando...' : survey ? 'Salvar pesquisa' : 'Publicar pesquisa'}
            </Button>
          </div>
        </div>
      )}
    >
      <Tabs value={tab} onValueChange={setTab}>
        <div className="overflow-x-auto">
          <TabsList variant="underline" className="w-max">
            <TabsTrigger variant="underline" value="conteudo">Conteúdo</TabsTrigger>
            <TabsTrigger variant="underline" value="publico">Público</TabsTrigger>
            <TabsTrigger variant="underline" value="programacao">Programação</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="conteudo" className="space-y-4 pt-4">
          <div className="space-y-2">
            <Label htmlFor="nps-title">Título interno</Label>
            <Input id="nps-title" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={120} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="nps-description">Apresentação</Label>
            <Textarea id="nps-description" value={description} onChange={(event) => setDescription(event.target.value)} rows={3} maxLength={320} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="nps-enjoyment">Pergunta de satisfação</Label>
            <Input id="nps-enjoyment" value={enjoymentQuestion} onChange={(event) => setEnjoymentQuestion(event.target.value)} maxLength={180} />
            <p className="text-xs text-muted-foreground">Resposta Sim ou Não.</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="nps-recommendation">Pergunta de recomendação</Label>
            <Input id="nps-recommendation" value={recommendationQuestion} onChange={(event) => setRecommendationQuestion(event.target.value)} maxLength={180} />
            <p className="text-xs text-muted-foreground">Escala NPS obrigatória de 0 a 10.</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="nps-feedback">Comentário opcional</Label>
            <Input id="nps-feedback" value={feedbackPrompt} onChange={(event) => setFeedbackPrompt(event.target.value)} maxLength={180} />
          </div>
        </TabsContent>

        <TabsContent value="publico" className="space-y-5 pt-4">
          <div className="grid gap-2 sm:grid-cols-3">
            {([
              { value: 'all' as const, label: 'Base toda', icon: Globe2 },
              { value: 'specific_companies' as const, label: 'Empresas', icon: Building2 },
              { value: 'filters' as const, label: 'Filtros', icon: Filter },
            ]).map((option) => {
              const Icon = option.icon;
              return (
                <button
                  type="button"
                  key={option.value}
                  onClick={() => setAudienceMode(option.value)}
                  className={cn(
                    'flex min-h-11 items-center gap-2 rounded-md border px-3 py-2 text-left text-sm font-medium',
                    audienceMode === option.value ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-muted',
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {option.label}
                </button>
              );
            })}
          </div>

          {audienceMode === 'specific_companies' && (
            <div className="space-y-2">
              <Label>Empresas que receberão</Label>
              <AdminCompanyMultiSelect value={companyIds} onChange={setCompanyIds} />
            </div>
          )}

          {audienceMode === 'filters' && (
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-3">
                <FilterSelect label="Status" value={filters.status} options={options.statuses} onChange={(status) => setFilters((current) => ({ ...current, status }))} />
                <FilterSelect label="Plano" value={filters.plan} options={options.plans} onChange={(plan) => setFilters((current) => ({ ...current, plan }))} />
                <FilterSelect label="Segmento" value={filters.segment} options={options.segments} onChange={(segment) => setFilters((current) => ({ ...current, segment }))} />
              </div>
              <NoticeBanner variant={resolvedCompanyIds.length ? 'info' : 'warning'}>
                {companiesLoading
                  ? 'Calculando o público...'
                  : `${resolvedCompanyIds.length} ${resolvedCompanyIds.length === 1 ? 'empresa receberá' : 'empresas receberão'} esta pesquisa. O recorte será salvo ao publicar.`}
              </NoticeBanner>
            </div>
          )}

          {audienceMode === 'all' && (
            <NoticeBanner variant="warning" title="Pesquisa para toda a base">
              Todos os usuários elegíveis poderão responder uma vez. Revise as perguntas e a programação antes de publicar.
            </NoticeBanner>
          )}
        </TabsContent>

        <TabsContent value="programacao" className="space-y-5 pt-4">
          <div className="flex flex-col items-start gap-2">
            <Label>Situação</Label>
            <LabeledSwitch<'yes' | 'no'>
              value={active}
              onChange={setActive}
              off={{ value: 'no', label: 'Pausada' }}
              on={{ value: 'yes', label: 'Ativa' }}
              aria-label="Situação da pesquisa"
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Começa em</Label>
              <DatePicker value={startsAt} onValueChange={setStartsAt} clearable placeholder="Imediatamente" ariaLabel="Data de início" />
            </div>
            <div className="space-y-2">
              <Label>Termina em</Label>
              <DatePicker value={endsAt} onValueChange={setEndsAt} clearable placeholder="Sem prazo" ariaLabel="Data final" />
            </div>
          </div>

          <div className="space-y-3 border-t pt-4">
            <div>
              <h3 className="flex items-center gap-2 text-sm font-semibold"><Link2 className="h-4 w-4" /> Avaliação da Dominex no Google</h3>
              <p className="text-xs text-muted-foreground">Depois da resposta, convide promotores para deixar uma avaliação pública.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="nps-google-url">Link de avaliação</Label>
              <Input id="nps-google-url" value={googleUrl} onChange={(event) => setGoogleUrl(event.target.value)} placeholder={googleLoading ? 'Buscando link configurado...' : 'https://...'} />
              {!googleLoading && !canonicalGoogleUrl && !survey && (
                <p className="text-xs text-warning">A conta interna da Dominex ainda não tem link do Google configurado. Cole o link aqui para ativar o convite.</p>
              )}
              {canonicalGoogleUrl && googleUrl === canonicalGoogleUrl && (
                <p className="text-xs text-muted-foreground">Link preenchido a partir da configuração de NPS da conta interna Dominex.</p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Convidar a partir da nota</Label>
              <Select value={googleMinScore} onValueChange={setGoogleMinScore} disabled={!googleUrl.trim()}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 11 }, (_, score) => (
                    <SelectItem key={score} value={String(score)}>{score}{score === 9 ? ' — promotores' : ''}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </ResponsiveModal>
  );
}

function FilterSelect({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (value: string) => void }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Select value={value || ALL_VALUE} onValueChange={(next) => onChange(next === ALL_VALUE ? '' : next)}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL_VALUE}>Todos</SelectItem>
          {options.map((option) => <SelectItem key={option} value={option}>{option}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}
