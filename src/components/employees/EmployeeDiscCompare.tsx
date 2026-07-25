// ─────────────────────────────────────────────────────────────────────────────
// EmployeeDiscCompare — comparação de DOIS funcionários no Perfil Comportamental.
//
// Renderiza IN-PLACE dentro da aba "Perfil Comportamental" (acionada pelo botão
// "Comparar" do EmployeeDiscOverview). O gestor escolhe A e B (ambos com
// avaliação concluída) e vê:
//   • selos de perfil lado a lado (A · B);
//   • Interações do par canônico (Atritos / Sinergias / Melhor comunicação);
//   • Gráfico DISC cruzado (2 séries, cores por pessoa + legenda);
//   • Radar de competências cruzado (2 polígonos sobrepostos + legenda).
//
// Fronteira Supabase: recebe employees + profilesByEmployee por prop (o pai já
// carregou via useCompanyDiscProfiles). Nenhum supabase.from aqui.
//
// Cores das 2 PESSOAS (distintas das cores de fator dos selos):
//   A = azul (#2563EB), B = laranja (#F59E0B). Usadas nos gráficos e legendas.
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  ChevronsUpDown,
  GitCompareArrows,
  MessageCircle,
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
import { EmptyState } from '@/components/mobile/EmptyState';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';
import { cn } from '@/lib/utils';
import { FACTOR_COLOR, resolveProfile } from '@/lib/disc/profiles';
import { relationshipKey } from '@/lib/disc/relationships';
import type { DiscFactor } from '@/lib/disc/questions';
import type { DiscScores } from '@/lib/disc/scoring';
import type { Employee } from '@/hooks/useEmployees';
import type { DiscAssessment } from '@/hooks/useEmployeeDisc';
import { DiscCompareLineChart } from '@/components/employees/disc/DiscCompareLineChart';
import { DiscCompareRadar } from '@/components/employees/disc/DiscCompareRadar';
import { useDiscMessages } from '@/components/employees/disc/useDiscMessages';

// Cores por PESSOA (A / B) — distintas das cores de fator dos selos de perfil.
const PERSON_COLOR_A = '#2563EB'; // azul
const PERSON_COLOR_B = '#F59E0B'; // laranja

export interface EmployeeDiscCompareProps {
  onBack: () => void;
  employees: Employee[];
  profilesByEmployee: Record<string, { latestCompleted: DiscAssessment | null }>;
}

// ── Avatar + iniciais ────────────────────────────────────────────────────────
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
      <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
        {initials}
      </AvatarFallback>
    </Avatar>
  );
}

// ── Selo saturado de perfil ──────────────────────────────────────────────────
function ProfileBadge({ profileCode, size = 'sm' }: { profileCode: string; size?: 'sm' | 'md' }) {
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

// ── Combobox de seleção de funcionário (com avaliação concluída) ──────────────
function EmployeePicker({
  label,
  employees,
  profilesByEmployee,
  selectedId,
  onSelect,
  placeholder,
  searchPlaceholder,
  noResults,
  noAssessment,
}: {
  label: string;
  employees: Employee[];
  profilesByEmployee: Record<string, { latestCompleted: DiscAssessment | null }>;
  selectedId: string | null;
  onSelect: (id: string) => void;
  placeholder: string;
  searchPlaceholder: string;
  noResults: string;
  noAssessment: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = selectedId ? employees.find((e) => e.id === selectedId) ?? null : null;

  return (
    <div className="space-y-1.5">
      <label className="text-xs font-semibold text-muted-foreground">{label}</label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between"
          >
            {selected ? (
              <span className="flex items-center gap-2 min-w-0">
                <EmployeeAvatar employee={selected} className="h-6 w-6 shrink-0" />
                <span className="truncate">{selected.name}</span>
              </span>
            ) : (
              <span className="text-muted-foreground">{placeholder}</span>
            )}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
          <Command
            filter={(value, search) => {
              const emp = employees.find((e) => e.id === value);
              if (!emp) return 0;
              return emp.name.toLowerCase().includes(search.toLowerCase()) ? 1 : 0;
            }}
          >
            <CommandInput placeholder={searchPlaceholder} />
            <CommandList>
              <CommandEmpty>{noResults}</CommandEmpty>
              <CommandGroup>
                {employees.map((emp) => {
                  const hasProfile = !!profilesByEmployee[emp.id]?.latestCompleted?.primary_type;
                  return (
                    <CommandItem
                      key={emp.id}
                      value={emp.id}
                      disabled={!hasProfile}
                      onSelect={(v) => {
                        onSelect(v);
                        setOpen(false);
                      }}
                      className="gap-2"
                    >
                      <EmployeeAvatar employee={emp} className="h-7 w-7 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{emp.name}</p>
                        {!hasProfile && (
                          <p className="truncate text-xs text-muted-foreground">{noAssessment}</p>
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
    </div>
  );
}

// ── Bloco de insight da relação (Atritos / Sinergias / Comunicação) ───────────
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

// ── Componente principal ─────────────────────────────────────────────────────
export function EmployeeDiscCompare({
  onBack,
  employees,
  profilesByEmployee,
}: EmployeeDiscCompareProps) {
  const { locale } = useAppLocaleContext();
  const { t: discT } = useDiscMessages();
  const c = MESSAGES[locale].app.employees.form.disc.overview.compare;

  const [idA, setIdA] = useState<string | null>(null);
  const [idB, setIdB] = useState<string | null>(null);

  const empA = idA ? employees.find((e) => e.id === idA) ?? null : null;
  const empB = idB ? employees.find((e) => e.id === idB) ?? null : null;

  const assessA = empA ? profilesByEmployee[empA.id]?.latestCompleted ?? null : null;
  const assessB = empB ? profilesByEmployee[empB.id]?.latestCompleted ?? null : null;

  const primaryA = (assessA?.primary_type as DiscFactor | undefined) ?? null;
  const primaryB = (assessB?.primary_type as DiscFactor | undefined) ?? null;

  const bothSelected = !!empA && !!empB;
  const samePerson = bothSelected && idA === idB;
  const ready =
    bothSelected && !samePerson && !!assessA?.scores && !!assessB?.scores && !!primaryA && !!primaryB;

  const rel =
    ready && primaryA && primaryB
      ? (discT.relationships as Record<
          string,
          { friction: string[]; synergy: string[]; communication: string }
        >)[relationshipKey(primaryA, primaryB)]
      : null;

  return (
    <div className="space-y-6">
      {/* Cabeçalho: Voltar + título */}
      <div className="flex items-center gap-3 min-w-0">
        <Button
          variant="ghost"
          size="icon"
          className="shrink-0"
          onClick={onBack}
          aria-label={c.back}
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="min-w-0">
          <h2 className="truncate text-xl sm:text-2xl font-bold text-foreground">{c.title}</h2>
          <p className="mt-0.5 truncate text-sm text-muted-foreground">{c.subtitle}</p>
        </div>
      </div>

      {/* Dois selects com busca */}
      <div className="grid gap-3 sm:grid-cols-2">
        <EmployeePicker
          label={c.selectFirst}
          employees={employees}
          profilesByEmployee={profilesByEmployee}
          selectedId={idA}
          onSelect={setIdA}
          placeholder={c.selectPlaceholder}
          searchPlaceholder={c.searchPlaceholder}
          noResults={c.noResults}
          noAssessment={c.noAssessment}
        />
        <EmployeePicker
          label={c.selectSecond}
          employees={employees}
          profilesByEmployee={profilesByEmployee}
          selectedId={idB}
          onSelect={setIdB}
          placeholder={c.selectPlaceholder}
          searchPlaceholder={c.searchPlaceholder}
          noResults={c.noResults}
          noAssessment={c.noAssessment}
        />
      </div>

      {/* Mesma pessoa nos dois lados */}
      {samePerson && (
        <p className="rounded-2xl border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
          {c.samePersonHint}
        </p>
      )}

      {/* Empty state enquanto não escolheu os 2 */}
      {!bothSelected && (
        <EmptyState
          icon={<GitCompareArrows className="h-12 w-12" />}
          title={c.emptyTitle}
          description={c.emptyDescription}
          size="compact"
        />
      )}

      {/* Comparação */}
      {ready && empA && empB && assessA?.scores && assessB?.scores && rel && (
        <div className="space-y-6">
          {/* Selos lado a lado A · B */}
          <div className="flex flex-wrap items-center justify-center gap-3 rounded-2xl border border-border bg-card p-4">
            <div className="flex flex-col items-center gap-1.5">
              <EmployeeAvatar employee={empA} className="h-10 w-10" />
              <span className="max-w-[7rem] truncate text-xs font-medium text-foreground">
                {empA.name}
              </span>
              {assessA.profile_code && <ProfileBadge profileCode={assessA.profile_code} size="sm" />}
            </div>
            <span className="text-muted-foreground">·</span>
            <div className="flex flex-col items-center gap-1.5">
              <EmployeeAvatar employee={empB} className="h-10 w-10" />
              <span className="max-w-[7rem] truncate text-xs font-medium text-foreground">
                {empB.name}
              </span>
              {assessB.profile_code && <ProfileBadge profileCode={assessB.profile_code} size="sm" />}
            </div>
          </div>

          {/* Interações */}
          <div className="space-y-5">
            <RelationshipBlock kind="friction" title={c.friction} items={rel.friction} />
            <RelationshipBlock kind="synergy" title={c.synergy} items={rel.synergy} />
            <RelationshipBlock
              kind="communication"
              title={c.communication}
              text={rel.communication}
            />
          </div>

          {/* Gráfico DISC cruzado + Radar — empilhados no mobile, lado a lado no desktop */}
          <div className="lg:flex lg:items-stretch lg:justify-between lg:gap-6">
            {/* DISC cruzado — SVG custom escala sozinho */}
            <div className="lg:flex-1 lg:max-w-[420px] min-w-0 lg:flex lg:flex-col lg:h-[440px]">
              <h3 className="mb-3 text-lg font-bold text-foreground text-center shrink-0">{c.discChartTitle}</h3>
              <div className="lg:flex-1 lg:flex min-w-0">
                <DiscCompareLineChart
                  scoresA={assessA.scores as DiscScores}
                  scoresB={assessB.scores as DiscScores}
                  nameA={empA.name}
                  nameB={empB.name}
                  colorA={PERSON_COLOR_A}
                  colorB={PERSON_COLOR_B}
                  locale={locale}
                  className="w-full lg:h-full"
                />
              </div>
            </div>

            {/* Radar cruzado — largura fixa para o recharts medir certo e renderizar grande */}
            <div className="lg:w-[540px] lg:shrink-0 lg:flex lg:flex-col lg:h-[440px]">
              <h3 className="mb-2 text-lg font-bold text-foreground text-center shrink-0">{c.radarTitle}</h3>
              <div className="lg:flex-1 lg:flex">
                <DiscCompareRadar
                  scoresA={assessA.scores as DiscScores}
                  scoresB={assessB.scores as DiscScores}
                  nameA={empA.name}
                  nameB={empB.name}
                  colorA={PERSON_COLOR_A}
                  colorB={PERSON_COLOR_B}
                  locale={locale}
                  className="w-full lg:h-full"
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
