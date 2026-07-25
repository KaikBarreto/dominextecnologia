// ─────────────────────────────────────────────────────────────────────────────
// EmployeeProfile — página dedicada do Perfil Comportamental (DISC) de UM
// funcionário. Rota: /funcionarios/perfil/:employeeId.
//
// Cabeçalho: foto/nome + selo do perfil ATUAL (código + nome, cor do fator
// primário) + botão voltar. Abaixo, 3 sub-abas (MobilePillTabs):
//
//   • Visão geral  → <DiscReport> do perfil atual (ou EmptyState + gerar link).
//   • Interações   → "Como se comporta com": combobox com busca dos OUTROS
//                    funcionários; quem não fez avaliação vem desabilitado. Ao
//                    escolher B, mostra Atritos/Sinergias/Melhor comunicação do
//                    par canônico relationshipKey(A.primary, B.primary).
//   • Histórico    → radar de evolução (camada por avaliação) + linha do tempo
//                    (abre o relatório daquela versão) + botão "Nova avaliação".
//
// Fronteira Supabase: useEmployees, useCompanyDiscProfiles, useEmployeeDisc,
// useEmployeeDiscHistory. Nenhum supabase.from direto aqui.
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
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
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
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
import { DiscEvolutionRadar } from '@/components/employees/disc/DiscEvolutionRadar';
import { useDiscMessages } from '@/components/employees/disc/useDiscMessages';

type SubTab = 'overview' | 'interactions' | 'history';

// ── Selo saturado de perfil (código + nome, cor do fator primário) ───────────
function ProfileBadge({ profileCode, size = 'md' }: { profileCode: string; size?: 'sm' | 'md' }) {
  const { t: discT } = useDiscMessages();
  const meta = resolveProfile(profileCode);
  const color = FACTOR_COLOR[meta.primary];
  const name = (discT.profiles as Record<string, { nome: string }>)[meta.code]?.nome ?? meta.code;
  return (
    <span
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

// ── Avatar + iniciais ─────────────────────────────────────────────────────────
function EmployeeAvatar({ employee, className }: { employee: Employee; className?: string }) {
  const initials = employee.name
    .split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
  return (
    <Avatar className={className}>
      <SignedAvatarImage src={employee.photo_url} alt={employee.name} />
      <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">{initials}</AvatarFallback>
    </Avatar>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// Aba INTERAÇÕES — "Como se comporta com"
// ══════════════════════════════════════════════════════════════════════════════
interface InteractionsTabProps {
  self: Employee;
  selfPrimary: DiscFactor | null;
  others: Employee[];
  profilesByEmployee: Record<string, { latestCompleted: DiscAssessment | null }>;
}

function InteractionsTab({ self, selfPrimary, others, profilesByEmployee }: InteractionsTabProps) {
  const { locale } = useAppLocaleContext();
  const { t: discT } = useDiscMessages();
  const p = MESSAGES[locale].app.employees.form.disc.profilePage;

  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // A página exige que o funcionário-alvo (A) tenha perfil concluído.
  if (!selfPrimary) {
    return <EmptyState icon={<MessageCircle className="h-12 w-12" />} title={p.interactionsNeedCurrent} />;
  }

  const selected = selectedId ? others.find((e) => e.id === selectedId) ?? null : null;
  const selectedPrimary = selected
    ? (profilesByEmployee[selected.id]?.latestCompleted?.primary_type as DiscFactor | undefined) ?? null
    : null;

  // Insights do par canônico A×B.
  const rel =
    selectedPrimary != null
      ? (discT.relationships as Record<
          string,
          { friction: string[]; synergy: string[]; communication: string }
        >)[relationshipKey(selfPrimary, selectedPrimary)]
      : null;

  return (
    <div className="space-y-5">
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
            // Filtro custom: casa pelo nome (value = id, então precisamos do map).
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
                  const hasProfile = !!profilesByEmployee[emp.id]?.latestCompleted?.primary_type;
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
                          <p className="truncate text-xs text-muted-foreground">{p.interactionsNoAssessment}</p>
                        )}
                      </div>
                      {selectedId === emp.id && <Check className="h-4 w-4 shrink-0 text-primary" />}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {/* Sem seleção → dica */}
      {!selected && (
        <EmptyState icon={<MessageCircle className="h-12 w-12" />} title={p.interactionsEmpty} size="compact" />
      )}

      {/* Análise da relação A × B */}
      {selected && selfPrimary && selectedPrimary && rel && (
        <div className="space-y-5">
          {/* Contexto: selo A · selo B */}
          <div className="flex flex-wrap items-center justify-center gap-3 rounded-2xl border border-border bg-card p-4">
            <div className="flex flex-col items-center gap-1.5">
              <EmployeeAvatar employee={self} className="h-10 w-10" />
              <span className="max-w-[7rem] truncate text-xs font-medium text-foreground">{self.name}</span>
              <ProfileBadge profileCode={resolveProfile(selfPrimary).code} size="sm" />
            </div>
            <span className="text-muted-foreground">·</span>
            <div className="flex flex-col items-center gap-1.5">
              <EmployeeAvatar employee={selected} className="h-10 w-10" />
              <span className="max-w-[7rem] truncate text-xs font-medium text-foreground">{selected.name}</span>
              <ProfileBadge profileCode={resolveProfile(selectedPrimary).code} size="sm" />
            </div>
          </div>

          {/* Atritos · Sinergias · Melhor comunicação */}
          <RelationshipBlock kind="friction" title={p.friction} items={rel.friction} />
          <RelationshipBlock kind="synergy" title={p.synergy} items={rel.synergy} />
          <RelationshipBlock kind="communication" title={p.communication} text={rel.communication} />
        </div>
      )}
    </div>
  );
}

// ── Bloco de insight da relação (mesmo estilo do relatório: ícone saturado) ───
const REL_STYLE = {
  friction: { icon: AlertTriangle, iconBg: 'bg-amber-500', accent: 'text-amber-600' },
  synergy: { icon: Sparkles, iconBg: 'bg-emerald-500', accent: 'text-emerald-600' },
  communication: { icon: MessageCircle, iconBg: 'bg-sky-500', accent: 'text-sky-600' },
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
        <span className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-full', style.iconBg)}>
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
function HistoryTab({
  employee,
  onGenerateLink,
  isGenerating,
}: {
  employee: Employee;
  onGenerateLink: () => void;
  isGenerating: boolean;
}) {
  const { locale, timezone } = useAppLocaleContext();
  const p = MESSAGES[locale].app.employees.form.disc.profilePage;
  const { history, isLoading } = useEmployeeDiscHistory(employee.id);

  // Versão aberta no modal (relatório daquela data).
  const [openVersion, setOpenVersion] = useState<DiscAssessment | null>(null);

  const evolutionLayers = useMemo(
    () =>
      history.map((a) => ({
        scores: a.scores as DiscScores,
        completedAt: a.completed_at,
      })),
    [history],
  );

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
      {/* Botão nova avaliação + explicação */}
      <div className="rounded-2xl border border-border bg-card p-4">
        <Button onClick={onGenerateLink} disabled={isGenerating} className="gap-2">
          {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
          {p.newAssessment}
        </Button>
        <p className="mt-2.5 text-xs leading-relaxed text-muted-foreground">{p.newAssessmentHint}</p>
      </div>

      {/* Radar de evolução — só com 2+ avaliações */}
      <div>
        <h3 className="mb-3 text-base font-semibold text-foreground">{p.evolutionTitle}</h3>
        {evolutionLayers.length >= 2 ? (
          <DiscEvolutionRadar
            layers={evolutionLayers}
            locale={locale}
            timezone={timezone}
            noDateLabel={p.evolutionNoDate}
          />
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
                    {a.completed_at ? formatDate(a.completed_at, locale, timezone) : p.evolutionNoDate}
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

      {/* Modal do relatório daquela versão (drawer no mobile) */}
      <ResponsiveModal
        open={!!openVersion}
        onOpenChange={(o) => !o && setOpenVersion(null)}
        title={
          openVersion?.completed_at
            ? p.reportOfDate.replace('{date}', formatDate(openVersion.completed_at, locale, timezone))
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
// Página
// ══════════════════════════════════════════════════════════════════════════════
export default function EmployeeProfile() {
  const { employeeId } = useParams<{ employeeId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { locale } = useAppLocaleContext();
  const p = MESSAGES[locale].app.employees.form.disc.profilePage;
  const tToasts = MESSAGES[locale].app.employees.toasts;

  const { employees, isLoading: employeesLoading } = useEmployees();
  const { profilesByEmployee, isLoading: profilesLoading } = useCompanyDiscProfiles();
  const { currentProfile, generateLink } = useEmployeeDisc(employeeId ?? null);

  const [tab, setTab] = useState<SubTab>('overview');
  const [generating, setGenerating] = useState(false);

  const employee = employees.find((e) => e.id === employeeId) ?? null;

  // Outros funcionários ativos (para as interações), sem o próprio.
  const others = useMemo(
    () => employees.filter((e) => e.id !== employeeId && e.is_active !== false),
    [employees, employeeId],
  );

  const selfPrimary = (currentProfile?.primary_type as DiscFactor | undefined) ?? null;

  const handleGenerate = () => {
    if (!employee) return;
    setGenerating(true);
    generateLink.mutate(employee.id, {
      onSuccess: async (row) => {
        const url = buildDiscPublicUrl(employee.name, row.public_short_code);
        try {
          await navigator.clipboard.writeText(url);
          toast({ title: tToasts.linkCopied, description: url, duration: 10000 });
        } catch {
          toast({ title: tToasts.pontoLinkGenerated, description: url, duration: 10000 });
        }
        setGenerating(false);
      },
      onError: () => setGenerating(false),
    });
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
        <Button variant="ghost" onClick={() => navigate('/funcionarios')}>
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
      {/* Cabeçalho: voltar (desktop) + avatar + nome + selo do perfil atual */}
      <div className="flex items-center gap-3 min-w-0">
        <Button
          variant="ghost"
          size="icon"
          className="shrink-0 hidden lg:flex"
          onClick={() => navigate('/funcionarios')}
          aria-label={p.back}
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <EmployeeAvatar employee={employee} className="h-12 w-12 sm:h-14 sm:w-14 shrink-0" />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl sm:text-2xl font-bold text-foreground">{employee.name}</h1>
          <div className="mt-1 flex items-center gap-2">
            {currentProfile?.profile_code ? (
              <ProfileBadge profileCode={currentProfile.profile_code} size="sm" />
            ) : (
              employee.position && (
                <span className="truncate text-sm text-muted-foreground">{employee.position}</span>
              )
            )}
          </div>
        </div>
      </div>

      {/* Sub-abas */}
      <MobilePillTabs tabs={tabs} activeTab={tab} onTabChange={(v) => setTab(v as SubTab)} />

      {/* Conteúdo */}
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
          selfPrimary={selfPrimary}
          others={others}
          profilesByEmployee={profilesByEmployee}
        />
      )}

      {tab === 'history' && (
        <HistoryTab employee={employee} onGenerateLink={handleGenerate} isGenerating={generating} />
      )}
    </div>
  );
}
