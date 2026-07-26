// ─────────────────────────────────────────────────────────────────────────────
// EmployeeProfileDetail — detalhe in-place do Perfil Comportamental (DISC) de
// UM funcionário. Renderiza DENTRO da aba "Perfil Comportamental" de Employees,
// mantendo o sub-sidebar lateral visível. NÃO usa rota própria.
//
// Props:
//   employeeId  — ID do funcionário a exibir.
//   onBack      — callback que retorna para o grid de cards.
//
// Cabeçalho: botão Voltar + avatar/nome + selo saturado do perfil atual.
// 3 sub-abas (MobilePillTabs): Visão geral / Interações / Histórico.
//
// Fronteira Supabase: useEmployees, useCompanyDiscProfiles, useEmployeeDisc,
// useEmployeeDiscHistory. Nenhum supabase.from direto aqui.
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo, useState } from 'react';
import {
  ArrowLeft,
  Brain,
  Check,
  ChevronsUpDown,
  Clock,
  FileText,
  Link2,
  Loader2,
  MessageCircle,
  AlertTriangle,
  Sparkles,
} from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { SignedAvatarImage } from '@/components/ui/SignedAvatarImage';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { MobilePillTabs } from '@/components/mobile/MobilePillTabs';
import { EmptyState } from '@/components/mobile/EmptyState';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';
import { formatDate } from '@/lib/format';
import { cn } from '@/lib/utils';
import { FACTOR_COLOR, resolveProfile } from '@/lib/disc/profiles';
import { relationshipKey } from '@/lib/disc/relationships';
import type { DiscFactor } from '@/lib/disc/questions';
import type { DiscScores } from '@/lib/disc/scoring';
import { useEmployees, type Employee } from '@/hooks/useEmployees';
import {
  useCompanyDiscProfiles,
  useEmployeeDisc,
  useEmployeeDiscHistory,
  buildDiscPublicUrl,
  type DiscAssessment,
} from '@/hooks/useEmployeeDisc';
import { DiscReport } from '@/components/employees/disc/DiscReport';
import { DiscCompareLineChart } from '@/components/employees/disc/DiscCompareLineChart';
import { DiscCompareRadar } from '@/components/employees/disc/DiscCompareRadar';
import { DiscLineChart } from '@/components/employees/disc/DiscLineChart';
import { DiscRadar } from '@/components/employees/disc/DiscRadar';
import { useDiscMessages } from '@/components/employees/disc/useDiscMessages';
import { describeEvolution } from '@/lib/disc/evolution';
import { DiscGenerateLinkModal } from '@/components/employees/disc/DiscGenerateLinkModal';

type SubTab = 'overview' | 'interactions' | 'history';

// ── Selo saturado de perfil (código + nome, cor do fator primário) ────────────
function ProfileBadge({
  profileCode,
  size = 'md',
}: {
  profileCode: string;
  size?: 'sm' | 'md';
}) {
  const { t: discT } = useDiscMessages();
  const meta = resolveProfile(profileCode);
  const color = FACTOR_COLOR[meta.primary];
  const name =
    (discT.profiles as Record<string, { nome: string }>)[meta.code]?.nome ?? meta.code;
  // Title usa as LETRAS CRUAS do profileCode (não o resolveProfile que canonicaliza/faz fallback).
  // Assim "CI" → "Conforme-Influente", "SD" → "Estável-Dominante", puro "C" → "Conforme".
  const p = profileCode[0] as DiscFactor;
  const s = profileCode[1] as DiscFactor | undefined;
  const personPair = discT.factors[p]
    ? s && discT.factors[s]
      ? `${discT.factors[p].person}-${discT.factors[s].person}`
      : discT.factors[p].person
    : name;
  return (
    <span
      title={personPair}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full font-bold text-white',
        size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3 py-1.5 text-sm',
      )}
      style={{ backgroundColor: color }}
    >
      <span className="font-black tracking-wide">{profileCode}</span>
      <span className="opacity-90">{name}</span>
    </span>
  );
}

// ── Avatar + iniciais ──────────────────────────────────────────────────────────
function EmployeeAvatar({
  employee,
  className,
}: {
  employee: Employee;
  className?: string;
}) {
  const initials = employee.name
    .split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
  return (
    <Avatar className={className}>
      <SignedAvatarImage src={employee.photo_url} alt={employee.name} />
      <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
        {initials}
      </AvatarFallback>
    </Avatar>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// Aba INTERAÇÕES — "Como se comporta com"
// ══════════════════════════════════════════════════════════════════════════════
interface InteractionsTabProps {
  self: Employee;
  selfProfileCode: string | null;
  selfPrimary: DiscFactor | null;
  others: Employee[];
  profilesByEmployee: Record<string, { latestCompleted: DiscAssessment | null }>;
}

function InteractionsTab({
  self,
  selfProfileCode,
  selfPrimary,
  others,
  profilesByEmployee,
}: InteractionsTabProps) {
  const { locale } = useAppLocaleContext();
  const { t: discT } = useDiscMessages();
  const p = MESSAGES[locale].app.employees.form.disc.profilePage;
  const c = MESSAGES[locale].app.employees.form.disc.overview.compare;

  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // A aba exige que o funcionário-alvo (A) tenha perfil concluído.
  if (!selfPrimary) {
    return (
      <EmptyState icon={<MessageCircle className="h-12 w-12" />} title={p.interactionsNeedCurrent} />
    );
  }

  // Scores de A (self) — garantidos pq selfPrimary passou o guard acima.
  const selfScores = profilesByEmployee[self.id]?.latestCompleted?.scores as DiscScores | undefined;

  const selected = selectedId ? others.find((e) => e.id === selectedId) ?? null : null;
  const selectedAssessment = selected
    ? profilesByEmployee[selected.id]?.latestCompleted ?? null
    : null;
  const selectedPrimary =
    (selectedAssessment?.primary_type as DiscFactor | undefined) ?? null;
  const selectedProfileCode = selectedAssessment?.profile_code ?? null;

  // Insights do par canônico A x B (calculados pelos primários).
  const rel =
    selectedPrimary != null
      ? (discT.relationships as Record<
          string,
          { friction: string[]; synergy: string[]; communication: string; dynamic: string }
        >)[relationshipKey(selfPrimary, selectedPrimary)]
      : null;

  return (
    <div className="space-y-5">
      {/* Cabeçalho: título+subtítulo+select à esquerda; card dos 2 funcionários à direita (desktop).
          No mobile empilha normalmente. */}
      <div className="lg:flex lg:items-center lg:justify-between lg:gap-6">
        <div className="space-y-3 lg:flex-1 lg:min-w-0">
          <div>
            <h3 className="text-base font-semibold text-foreground">{p.interactionsTitle}</h3>
            <p className="mt-0.5 text-sm text-muted-foreground">{p.interactionsSubtitle}</p>
          </div>

          {/* Combobox com busca — funcionário sem avaliação vem desabilitado */}
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                role="combobox"
                aria-expanded={open}
                className="w-full justify-between sm:max-w-md"
              >
                {selected ? (
                  <span className="flex items-center gap-2 min-w-0">
                    <EmployeeAvatar employee={selected} className="h-6 w-6 shrink-0" />
                    <span className="truncate">{selected.name}</span>
                  </span>
                ) : (
                  <span className="text-muted-foreground">{p.interactionsSelectPlaceholder}</span>
                )}
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
              <Command
                filter={(value, search) => {
                  const emp = others.find((e) => e.id === value);
                  if (!emp) return 0;
                  return emp.name.toLowerCase().includes(search.toLowerCase()) ? 1 : 0;
                }}
              >
                <CommandInput placeholder={p.interactionsSearchPlaceholder} />
                <CommandList>
                  <CommandEmpty>{p.interactionsNoResults}</CommandEmpty>
                  <CommandGroup>
                    {others.map((emp) => {
                      const hasProfile =
                        !!profilesByEmployee[emp.id]?.latestCompleted?.primary_type;
                      return (
                        <CommandItem
                          key={emp.id}
                          value={emp.id}
                          disabled={!hasProfile}
                          onSelect={(v) => {
                            setSelectedId(v);
                            setOpen(false);
                          }}
                          className="gap-2"
                        >
                          <EmployeeAvatar employee={emp} className="h-7 w-7 shrink-0" />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">{emp.name}</p>
                            {!hasProfile && (
                              <p className="truncate text-xs text-muted-foreground">
                                {p.interactionsNoAssessment}
                              </p>
                            )}
                          </div>
                          {selectedId === emp.id && (
                            <Check className="h-4 w-4 shrink-0 text-primary" />
                          )}
                        </CommandItem>
                      );
                    })}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </div>

        {/* Card dos 2 funcionários — à direita no desktop, centralizado verticalmente.
            No mobile ocupa a largura toda abaixo do select. Só aparece com seleção. */}
        {selected && selfPrimary && selectedPrimary && rel && (
          <div className="mt-4 lg:mt-0 lg:shrink-0 flex flex-wrap items-center justify-center gap-3 rounded-2xl border border-border bg-card p-4">
            <div className="flex flex-col items-center gap-1.5">
              <EmployeeAvatar employee={self} className="h-10 w-10" />
              <span className="max-w-[7rem] truncate text-xs font-medium text-foreground">
                {self.name}
              </span>
              {selfProfileCode ? (
                <ProfileBadge profileCode={selfProfileCode} size="sm" />
              ) : (
                <ProfileBadge profileCode={selfPrimary} size="sm" />
              )}
            </div>
            <span className="text-muted-foreground">·</span>
            <div className="flex flex-col items-center gap-1.5">
              <EmployeeAvatar employee={selected} className="h-10 w-10" />
              <span className="max-w-[7rem] truncate text-xs font-medium text-foreground">
                {selected.name}
              </span>
              {selectedProfileCode ? (
                <ProfileBadge profileCode={selectedProfileCode} size="sm" />
              ) : (
                <ProfileBadge profileCode={selectedPrimary} size="sm" />
              )}
            </div>
          </div>
        )}
      </div>

      {/* Sem seleção → dica */}
      {!selected && (
        <EmptyState
          icon={<MessageCircle className="h-12 w-12" />}
          title={p.interactionsEmpty}
          size="compact"
        />
      )}

      {/* Análise da relação A x B: (1) gráficos, (2) dinâmica, (3) pontos */}
      {selected && selfPrimary && selectedPrimary && rel && (
        <div className="space-y-5">
          {/* Gráfico DISC cruzado + Radar — empilhados no mobile, lado a lado no desktop */}
          {selfScores && selectedAssessment?.scores && (
            <div className="lg:flex lg:items-stretch lg:justify-between lg:gap-6">
              {/* DISC cruzado — SVG custom escala sozinho */}
              <div className="lg:flex-1 lg:max-w-[420px] min-w-0 lg:flex lg:flex-col lg:h-[440px]">
                <h3 className="mb-3 text-lg font-bold text-foreground text-center shrink-0">
                  {c.discChartTitle}
                </h3>
                <div className="lg:flex-1 lg:flex min-w-0">
                  <DiscCompareLineChart
                    scoresA={selfScores}
                    scoresB={selectedAssessment.scores as DiscScores}
                    nameA={self.name}
                    nameB={selected.name}
                    colorA="#2563EB"
                    colorB="#F59E0B"
                    codeA={selfProfileCode ?? undefined}
                    codeB={selectedProfileCode ?? undefined}
                    locale={locale}
                    className="w-full lg:h-full"
                  />
                </div>
              </div>

              {/* Radar cruzado — largura fixa para o recharts medir certo e renderizar grande */}
              <div className="lg:w-[540px] lg:shrink-0 lg:flex lg:flex-col lg:h-[440px]">
                <h3 className="mb-2 text-lg font-bold text-foreground text-center shrink-0">
                  {c.radarTitle}
                </h3>
                <div className="lg:flex-1 lg:flex">
                  <DiscCompareRadar
                    scoresA={selfScores}
                    scoresB={selectedAssessment.scores as DiscScores}
                    nameA={self.name}
                    nameB={selected.name}
                    colorA="#2563EB"
                    colorB="#F59E0B"
                    codeA={selfProfileCode ?? undefined}
                    codeB={selectedProfileCode ?? undefined}
                    locale={locale}
                    className="w-full lg:h-full"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Parágrafo de dinâmica do par — em destaque, largura de leitura, antes dos pontos */}
          {rel.dynamic && (
            <p className="w-full rounded-2xl border border-border bg-card p-4 text-sm leading-relaxed text-foreground">
              {rel.dynamic}
            </p>
          )}

          {/* Atritos · Sinergias · Melhor comunicação */}
          <RelationshipBlock kind="friction" title={p.friction} items={rel.friction} />
          <RelationshipBlock kind="synergy" title={p.synergy} items={rel.synergy} />
          <RelationshipBlock
            kind="communication"
            title={p.communication}
            text={rel.communication}
          />
        </div>
      )}
    </div>
  );
}

// ── Bloco de insight da relação ────────────────────────────────────────────────
const REL_STYLE = {
  friction: {
    icon: AlertTriangle,
    iconBg: 'bg-amber-500',
    accent: 'text-amber-600',
  },
  synergy: {
    icon: Sparkles,
    iconBg: 'bg-emerald-500',
    accent: 'text-emerald-600',
  },
  communication: {
    icon: MessageCircle,
    iconBg: 'bg-sky-500',
    accent: 'text-sky-600',
  },
} as const;

function RelationshipBlock({
  kind,
  title,
  items,
  text,
}: {
  kind: keyof typeof REL_STYLE;
  title: string;
  items?: string[];
  text?: string;
}) {
  const style = REL_STYLE[kind];
  const Icon = style.icon;
  return (
    <div className="p-1">
      <div className="mb-3 flex items-center gap-2.5">
        <span
          className={cn(
            'flex h-7 w-7 shrink-0 items-center justify-center rounded-full',
            style.iconBg,
          )}
        >
          <Icon className="h-4 w-4 text-white" strokeWidth={2.5} />
        </span>
        <h5 className={cn('text-sm font-bold', style.accent)}>{title}</h5>
      </div>
      {items ? (
        <ul className="space-y-2 pl-1">
          {items.map((item, i) => (
            <li key={i} className="flex gap-2 text-sm leading-relaxed text-foreground">
              <span className={cn('mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full', style.iconBg)} />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="pl-1 text-sm leading-relaxed text-foreground">{text}</p>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// Aba HISTÓRICO — evolução + linha do tempo
// ══════════════════════════════════════════════════════════════════════════════
// Cores por SÉRIE na evolução — anterior (azul) x atual (laranja). SEMPRE
// distintas, mesmo se as duas avaliações forem do mesmo dia.
const EVOLUTION_COLOR_PREV = '#2563EB'; // azul — avaliação anterior
const EVOLUTION_COLOR_CURR = '#F59E0B'; // laranja — avaliação atual

function HistoryTab({
  employee,
}: {
  employee: Employee;
}) {
  const { locale, timezone } = useAppLocaleContext();
  const { t: discT } = useDiscMessages();
  const p = MESSAGES[locale].app.employees.form.disc.profilePage;
  const { history: fullHistory, isLoading } = useEmployeeDiscHistory(employee.id);

  const [openVersion, setOpenVersion] = useState<DiscAssessment | null>(null);

  // Acumula no máximo os 3 perfis mais recentes (não-destrutivo: só limita a
  // exibição). `fullHistory` já vem desc por completed_at.
  const history = useMemo(() => fullHistory.slice(0, 3), [fullHistory]);

  // As 2 avaliações mais recentes: atual (última) e anterior (penúltima).
  const current = history[0] ?? null;
  const previous = history[1] ?? null;

  const dateLabel = (a: DiscAssessment | null) =>
    a?.completed_at ? formatDate(a.completed_at, locale, timezone) : p.evolutionNoDate;

  // Parágrafo dinâmico de evolução (regras puras + fragmentos i18n).
  const evolutionText = useMemo(() => {
    if (!current?.scores || !previous?.scores) return null;
    const profileName = (code: string) => {
      const meta = resolveProfile(code);
      return (
        (discT.profiles as Record<string, { nome: string }>)[meta.code]?.nome ?? meta.code
      );
    };
    return describeEvolution(
      previous.scores as DiscScores,
      current.scores as DiscScores,
      previous.profile_code,
      current.profile_code,
      p.evolution,
      (f) => discT.factors[f].name,
      profileName,
    );
  }, [current, previous, p.evolution, discT]);

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-64 w-full rounded-2xl" />
        <Skeleton className="h-16 w-full rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Dica sobre nova avaliação (o botão fica no cabeçalho da tela) */}
      <p className="text-xs leading-relaxed text-muted-foreground rounded-2xl border border-dashed border-border p-3">
        {p.newAssessmentHint}
      </p>

      {/* Evolução do perfil — cruzados (anterior x atual) lado a lado */}
      <div>
        <h3 className="mb-3 text-base font-semibold text-foreground">{p.evolutionTitle}</h3>

        {current?.scores && previous?.scores ? (
          <div className="space-y-5">
            {/* DISC cruzado + Radar cruzado — empilhados no mobile, lado a lado no desktop */}
            <div className="lg:flex lg:items-stretch lg:justify-between lg:gap-6">
              {/* DISC cruzado — SVG custom escala sozinho */}
              <div className="lg:flex-1 lg:max-w-[420px] min-w-0 lg:flex lg:flex-col lg:h-[440px]">
                <h4 className="mb-3 text-lg font-bold text-foreground text-center shrink-0">
                  {p.evolutionDiscChartTitle}
                </h4>
                <div className="lg:flex-1 lg:flex min-w-0">
                  <DiscCompareLineChart
                    scoresA={previous.scores as DiscScores}
                    scoresB={current.scores as DiscScores}
                    nameA={dateLabel(previous)}
                    nameB={dateLabel(current)}
                    colorA={EVOLUTION_COLOR_PREV}
                    colorB={EVOLUTION_COLOR_CURR}
                    codeA={previous.profile_code ?? undefined}
                    codeB={current.profile_code ?? undefined}
                    locale={locale}
                    className="w-full lg:h-full"
                  />
                </div>
              </div>

              {/* Radar cruzado — largura fixa para o recharts medir certo e renderizar grande */}
              <div className="lg:w-[540px] lg:shrink-0 lg:flex lg:flex-col lg:h-[440px]">
                <h4 className="mb-2 text-lg font-bold text-foreground text-center shrink-0">
                  {p.evolutionRadarTitle}
                </h4>
                <div className="lg:flex-1 lg:flex">
                  <DiscCompareRadar
                    scoresA={previous.scores as DiscScores}
                    scoresB={current.scores as DiscScores}
                    nameA={dateLabel(previous)}
                    nameB={dateLabel(current)}
                    colorA={EVOLUTION_COLOR_PREV}
                    colorB={EVOLUTION_COLOR_CURR}
                    codeA={previous.profile_code ?? undefined}
                    codeB={current.profile_code ?? undefined}
                    locale={locale}
                    className="w-full lg:h-full"
                  />
                </div>
              </div>
            </div>

            {/* Parágrafo dinâmico do que mudou entre anterior e atual */}
            {evolutionText && (
              <p className="rounded-2xl border border-border bg-card p-4 text-sm leading-relaxed text-foreground">
                {evolutionText}
              </p>
            )}
          </div>
        ) : current?.scores ? (
          // Só 1 avaliação: mostra o perfil único + dica de fazer nova.
          <div className="space-y-5">
            <div className="lg:flex lg:items-stretch lg:justify-between lg:gap-6">
              <div className="lg:flex-1 lg:max-w-[420px] min-w-0 lg:flex lg:flex-col lg:h-[440px]">
                <h4 className="mb-3 text-lg font-bold text-foreground text-center shrink-0">
                  {p.evolutionDiscChartTitle}
                </h4>
                <div className="lg:flex-1 lg:flex min-w-0">
                  <DiscLineChart
                    scores={current.scores as DiscScores}
                    locale={locale}
                    className="w-full lg:h-full"
                  />
                </div>
              </div>
              <div className="lg:w-[540px] lg:shrink-0 lg:flex lg:flex-col lg:h-[440px]">
                <h4 className="mb-2 text-lg font-bold text-foreground text-center shrink-0">
                  {p.evolutionRadarTitle}
                </h4>
                <div className="lg:flex-1 lg:flex">
                  <DiscRadar
                    scores={current.scores as DiscScores}
                    locale={locale}
                    className="w-full lg:h-full"
                  />
                </div>
              </div>
            </div>
            <p className="rounded-2xl border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
              {p.evolutionSingleHint}
            </p>
          </div>
        ) : (
          <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            {p.evolutionEmpty}
          </p>
        )}
      </div>

      {/* Linha do tempo */}
      <div>
        <h3 className="mb-3 text-base font-semibold text-foreground">{p.timelineTitle}</h3>
        {history.length === 0 ? (
          <EmptyState
            icon={<Clock className="h-12 w-12" />}
            title={p.historyEmptyTitle}
            description={p.historyEmptyDescription}
            size="compact"
          />
        ) : (
          <ul className="overflow-hidden rounded-2xl border border-border bg-card">
            {history.map((a, i) => (
              <li
                key={a.id}
                className={cn('flex items-center gap-3 p-3.5', i > 0 && 'border-t border-border')}
              >
                <div className="min-w-0 flex-1">
                  {a.profile_code && <ProfileBadge profileCode={a.profile_code} size="sm" />}
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    {a.completed_at
                      ? formatDate(a.completed_at, locale, timezone)
                      : p.evolutionNoDate}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="shrink-0 gap-1.5"
                  onClick={() => setOpenVersion(a)}
                >
                  <FileText className="h-3.5 w-3.5" />
                  {p.viewFromDate}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Modal do relatório daquela versão */}
      <ResponsiveModal
        open={!!openVersion}
        onOpenChange={(o) => !o && setOpenVersion(null)}
        title={
          openVersion?.completed_at
            ? p.reportOfDate.replace(
                '{date}',
                formatDate(openVersion.completed_at, locale, timezone),
              )
            : p.historyTitle
        }
      >
        {openVersion?.scores && openVersion.profile_code && (
          <DiscReport
            scores={openVersion.scores as DiscScores}
            profileCode={openVersion.profile_code}
            variant="full"
          />
        )}
      </ResponsiveModal>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// Componente principal — in-place, sem rota própria
// ══════════════════════════════════════════════════════════════════════════════
export interface EmployeeProfileDetailProps {
  employeeId: string;
  onBack: () => void;
  /** Lista de todos os funcionários ativos (passada pelo EmployeeDiscOverview). */
  allEmployees?: Employee[];
  /** Mapa de perfis por funcionário (passado pelo EmployeeDiscOverview). */
  profilesByEmployeeExternal?: Record<string, { latestCompleted: DiscAssessment | null }>;
  /** Callback para trocar o funcionário exibido in-place. */
  onChangeEmployee?: (id: string) => void;
}

export function EmployeeProfileDetail({
  employeeId,
  onBack,
  allEmployees: allEmployeesProp,
  profilesByEmployeeExternal,
  onChangeEmployee,
}: EmployeeProfileDetailProps) {
  const { toast } = useToast();
  const { locale } = useAppLocaleContext();
  const p = MESSAGES[locale].app.employees.form.disc.profilePage;
  const tToasts = MESSAGES[locale].app.employees.toasts;

  const { employees: employeesFromHook, isLoading: employeesHookLoading } = useEmployees();
  const { profilesByEmployee: profilesByEmployeeFromHook, isLoading: profilesHookLoading } = useCompanyDiscProfiles();
  const { currentProfile, generateLink } = useEmployeeDisc(employeeId);

  // Prefer props passed by the parent (avoids double fetch when parent already has data).
  // If the parent passed data, we skip loading state for those slices.
  const employees = allEmployeesProp ?? employeesFromHook;
  const profilesByEmployee = profilesByEmployeeExternal ?? profilesByEmployeeFromHook;
  const employeesLoading = allEmployeesProp ? false : employeesHookLoading;
  const profilesLoading = profilesByEmployeeExternal ? false : profilesHookLoading;

  const [tab, setTab] = useState<SubTab>('overview');
  const [generating, setGenerating] = useState(false);
  const [switchOpen, setSwitchOpen] = useState(false);
  const [generateModalOpen, setGenerateModalOpen] = useState(false);

  const employee = employees.find((e) => e.id === employeeId) ?? null;

  const others = useMemo(
    () => employees.filter((e) => e.id !== employeeId && e.is_active !== false),
    [employees, employeeId],
  );

  const selfPrimary = (currentProfile?.primary_type as DiscFactor | undefined) ?? null;
  const selfProfileCode = currentProfile?.profile_code ?? null;

  // Abre o modal de configuração (toggle show_result) antes de gerar o link.
  const handleGenerate = () => {
    if (!employee) return;
    setGenerateModalOpen(true);
  };

  // Chamado quando o gestor confirma no modal de gerar link.
  const handleGenerateConfirm = (showResult: boolean) => {
    if (!employee) return;
    setGenerating(true);
    generateLink.mutate(
      { employeeId: employee.id, showResult },
      {
        onSuccess: async (row) => {
          const url = buildDiscPublicUrl(employee.name, row.public_short_code);
          setGenerateModalOpen(false);
          try {
            await navigator.clipboard.writeText(url);
            toast({ title: tToasts.linkCopied, description: url, duration: 10000 });
          } catch {
            toast({ title: tToasts.pontoLinkGenerated, description: url, duration: 10000 });
          }
          setGenerating(false);
        },
        onError: () => {
          setGenerating(false);
        },
      },
    );
  };

  if (employeesLoading || profilesLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-16 w-full rounded-2xl" />
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    );
  }

  if (!employee) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeft className="mr-2 h-4 w-4" /> {p.back}
        </Button>
        <p className="text-muted-foreground">{p.notFound}</p>
      </div>
    );
  }

  const tabs = [
    { value: 'overview', label: p.tabs.overview },
    { value: 'interactions', label: p.tabs.interactions },
    { value: 'history', label: p.tabs.history },
  ];

  return (
    <div className="space-y-6">
      {/* Cabeçalho: botão Voltar + avatar + nome (combobox de troca) + selo do perfil atual + botão Nova Avaliação */}
      <div className="flex items-center justify-between gap-3 min-w-0">
        <Button
          variant="ghost"
          size="icon"
          className="shrink-0"
          onClick={onBack}
          aria-label={p.back}
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <EmployeeAvatar employee={employee} className="h-12 w-12 sm:h-14 sm:w-14 shrink-0" />
        <div className="min-w-0 flex-1">
          {/* Nome como gatilho de combobox — só mostra chevron quando há outros funcionários */}
          {onChangeEmployee && others.length > 0 ? (
            <Popover open={switchOpen} onOpenChange={setSwitchOpen}>
              <PopoverTrigger asChild>
                <button
                  className="group flex items-center gap-1.5 min-w-0 max-w-full text-left focus:outline-none"
                  aria-label={p.switchSearchPlaceholder}
                >
                  <span className="truncate text-xl sm:text-2xl font-bold text-foreground group-hover:text-primary transition-colors">
                    {employee.name}
                  </span>
                  <ChevronsUpDown className="h-5 w-5 shrink-0 text-muted-foreground group-hover:text-primary transition-colors" />
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-72 p-0" align="start" side="bottom">
                <Command
                  filter={(value, search) => {
                    const emp = employees.find((e) => e.id === value);
                    if (!emp) return 0;
                    return emp.name.toLowerCase().includes(search.toLowerCase()) ? 1 : 0;
                  }}
                >
                  <CommandInput placeholder={p.switchSearchPlaceholder} />
                  <CommandList>
                    <CommandEmpty>{p.switchNoResults}</CommandEmpty>
                    <CommandGroup>
                      {employees
                        .filter((e) => e.is_active !== false)
                        .map((emp) => {
                          const isCurrent = emp.id === employeeId;
                          const empProfile = profilesByEmployee[emp.id]?.latestCompleted;
                          const empProfileCode = empProfile?.profile_code ?? null;
                          const empInitials = emp.name
                            .split(' ')
                            .map((n) => n[0])
                            .slice(0, 2)
                            .join('')
                            .toUpperCase();
                          return (
                            <CommandItem
                              key={emp.id}
                              value={emp.id}
                              onSelect={(v) => {
                                setSwitchOpen(false);
                                if (v !== employeeId) onChangeEmployee(v);
                              }}
                              className="gap-2.5 py-2"
                            >
                              <Avatar className="h-7 w-7 shrink-0">
                                <SignedAvatarImage src={emp.photo_url} alt={emp.name} />
                                <AvatarFallback className="bg-primary/10 text-primary text-[10px] font-semibold">
                                  {empInitials}
                                </AvatarFallback>
                              </Avatar>
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-medium">{emp.name}</p>
                                {empProfileCode && (
                                  <p className="truncate text-xs text-muted-foreground">
                                    {empProfileCode}
                                  </p>
                                )}
                              </div>
                              {isCurrent && (
                                <Check className="h-4 w-4 shrink-0 text-primary" />
                              )}
                            </CommandItem>
                          );
                        })}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          ) : (
            <h2 className="truncate text-xl sm:text-2xl font-bold text-foreground">
              {employee.name}
            </h2>
          )}
          <div className="mt-1 flex items-center gap-2">
            {selfProfileCode ? (
              <ProfileBadge profileCode={selfProfileCode} size="sm" />
            ) : (
              employee.position && (
                <span className="truncate text-sm text-muted-foreground">
                  {employee.position}
                </span>
              )
            )}
          </div>
        </div>

        {/* Botão Nova Avaliação — visível em todas as subabas, canto direito do cabeçalho */}
        <Button
          onClick={handleGenerate}
          disabled={generating}
          size="sm"
          className="shrink-0 gap-1.5 hidden sm:inline-flex"
        >
          {generating ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Link2 className="h-4 w-4" />
          )}
          {p.newAssessment}
        </Button>
        {/* Mobile: só ícone para não quebrar o header */}
        <Button
          onClick={handleGenerate}
          disabled={generating}
          size="icon"
          className="shrink-0 sm:hidden"
          aria-label={p.newAssessment}
        >
          {generating ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Link2 className="h-4 w-4" />
          )}
        </Button>
      </div>

      {/* Sub-abas */}
      <MobilePillTabs
        tabs={tabs}
        activeTab={tab}
        onTabChange={(v) => setTab(v as SubTab)}
      />

      {/* Conteúdo da aba ativa */}
      {tab === 'overview' && (
        <>
          {currentProfile?.scores && currentProfile.profile_code ? (
            <DiscReport
              scores={currentProfile.scores as DiscScores}
              profileCode={currentProfile.profile_code}
              variant="full"
              hideHeader
            />
          ) : (
            <EmptyState
              icon={<Brain className="h-12 w-12" />}
              title={p.overviewEmptyTitle}
              description={p.overviewEmptyDescription}
              action={{ label: p.generateTestLink, onClick: handleGenerate }}
            />
          )}
        </>
      )}

      {tab === 'interactions' && (
        <InteractionsTab
          self={employee}
          selfProfileCode={selfProfileCode}
          selfPrimary={selfPrimary}
          others={others}
          profilesByEmployee={profilesByEmployee}
        />
      )}

      {tab === 'history' && (
        <HistoryTab
          employee={employee}
        />
      )}

      {/* Modal de confirmação antes de gerar o link (toggle show_result por avaliação) */}
      <DiscGenerateLinkModal
        open={generateModalOpen}
        onOpenChange={setGenerateModalOpen}
        onConfirm={handleGenerateConfirm}
        isGenerating={generating}
      />
    </div>
  );
}
