// ─────────────────────────────────────────────────────────────────────────────
// EmployeeDiscOverview — grid de perfis DISC de todos os funcionários ativos.
//
// Mostra um card por funcionário (ativo). Cada card tem 3 estados:
//   1. Perfil concluído → badge saturado com código+nome na cor do fator primário
//      + mini-barra dos 4 fatores. Clicar abre DiscReport completo no modal/drawer.
//   2. Link pendente    → chip âmbar "Aguardando resposta".
//   3. Sem teste        → chip neutro "Sem teste" + ação "Gerar link" (copia imediato).
//
// Fronteira Supabase: useCompanyDiscProfiles (hook). Componente não toca supabase.
// Mobile-first: cards em lista (1 col) no mobile, grid 2-3 col no desktop.
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react';
import { Brain, ChevronRight, Clock, Copy, GitCompareArrows, Link2, Loader2 } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { SignedAvatarImage } from '@/components/ui/SignedAvatarImage';
import { EmptyState } from '@/components/mobile/EmptyState';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useToast } from '@/hooks/use-toast';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';
import { formatDate } from '@/lib/format';
import { FACTOR_COLOR, resolveProfile } from '@/lib/disc/profiles';
import { useCompanyDiscProfiles, buildDiscPublicUrl, type DiscAssessment } from '@/hooks/useEmployeeDisc';
import { useDiscMessages } from '@/components/employees/disc/useDiscMessages';
import { EmployeeProfileDetail } from '@/components/employees/EmployeeProfileDetail';
import { EmployeeDiscCompare } from '@/components/employees/EmployeeDiscCompare';
import type { Employee } from '@/hooks/useEmployees';
import type { DiscScores } from '@/lib/disc/scoring';
import type { DiscFactor } from '@/lib/disc/questions';

interface EmployeeDiscOverviewProps {
  employees: Employee[];
}

// ── Mini-barra dos 4 fatores ────────────────────────────────────────────────
function DiscMiniBar({ scores }: { scores: DiscScores }) {
  const { locale } = useAppLocaleContext();
  const discFactors = MESSAGES[locale].app.discProfile.factors;
  const tOverview = MESSAGES[locale].app.employees.form.disc.overview;
  const FACTORS: DiscFactor[] = ['D', 'I', 'S', 'C'];

  return (
    <TooltipProvider>
      <div className="flex gap-1 mt-2">
        {FACTORS.map((f) => {
          const pct = Math.round(scores[f] ?? 0);
          const factorName = discFactors[f].name;
          const tooltipLabel = tOverview.factorScore
            .replace('{name}', factorName)
            .replace('{score}', String(pct));
          return (
            <Tooltip key={f}>
              <TooltipTrigger asChild>
                <div className="flex-1 flex flex-col items-center gap-0.5 cursor-default">
                  <div className="w-full rounded-full bg-muted h-1.5 overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${pct}%`, backgroundColor: FACTOR_COLOR[f] }}
                    />
                  </div>
                  <span className="text-[9px] font-bold text-muted-foreground">{f}</span>
                </div>
              </TooltipTrigger>
              <TooltipContent side="top" className="text-xs">
                {tooltipLabel}
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </TooltipProvider>
  );
}

// ── Card de um funcionário ──────────────────────────────────────────────────
interface EmployeeDiscCardProps {
  employee: Employee;
  latestCompleted: DiscAssessment | null;
  latestPending: DiscAssessment | null;
  onSelect: (employeeId: string) => void;
  onGenerateLink: (employeeId: string) => void;
  isGenerating: boolean;
}

function EmployeeDiscCard({
  employee,
  latestCompleted,
  latestPending,
  onSelect,
  onGenerateLink,
  isGenerating,
}: EmployeeDiscCardProps) {
  const { locale, timezone } = useAppLocaleContext();
  const t = MESSAGES[locale].app.employees.form.disc.overview;
  const { t: discT } = useDiscMessages();
  const { toast } = useToast();

  const handleCopyPendingLink = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!latestPending?.public_short_code) return;
    const url = buildDiscPublicUrl(employee.name, latestPending.public_short_code);
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // fallback silencioso — url aparece no toast de qualquer forma
    }
    toast({ title: t.linkCopied, description: url, duration: 6000 });
  };

  const initials = employee.name
    .split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const hasProfile = !!latestCompleted?.profile_code && !!latestCompleted?.scores;
  const hasPending = !!latestPending;

  // Resolve cor e nome do perfil quando há resultado
  const meta = hasProfile ? resolveProfile(latestCompleted!.profile_code!) : null;
  const profileColor = meta ? FACTOR_COLOR[meta.primary] : undefined;

  return (
    <div
      role="button"
      tabIndex={0}
      className="group rounded-2xl border border-border bg-card p-4 flex flex-col gap-3 shadow-sm cursor-pointer hover:border-primary/40 hover:bg-muted/40 transition-colors"
      onClick={() => onSelect(employee.id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect(employee.id);
        }
      }}
    >
      {/* Avatar + nome + cargo */}
      <div className="flex items-center gap-3">
        <Avatar className="h-10 w-10 shrink-0">
          <SignedAvatarImage src={employee.photo_url} alt={employee.name} />
          <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
            {initials}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground truncate">{employee.name}</p>
          {employee.position && (
            <p className="text-xs text-muted-foreground truncate">{employee.position}</p>
          )}
        </div>
      </div>

      {/* Estado do perfil */}
      {hasProfile && meta && (
        <>
          {/* Badge saturado: fundo cor do fator, texto branco */}
          <div className="flex items-center gap-2 flex-wrap">
            {(() => {
              const resolvedMeta = resolveProfile(latestCompleted!.profile_code!);
              const profileName = (discT.profiles as Record<string, { nome: string }>)[resolvedMeta.code]?.nome ?? resolvedMeta.code;
              return (
                <span
                  className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold text-white"
                  style={{ backgroundColor: profileColor }}
                >
                  <span className="font-black tracking-wide">{latestCompleted!.profile_code}</span>
                  <span className="opacity-90">{profileName}</span>
                </span>
              );
            })()}
          </div>

          {/* Mini-barra 4 fatores */}
          <DiscMiniBar scores={latestCompleted!.scores as DiscScores} />

          {/* Data de conclusão */}
          {latestCompleted!.completed_at && (
            <div className="mt-1">
              <span className="text-[11px] text-muted-foreground">
                {t.completedAt.replace('{date}', formatDate(latestCompleted!.completed_at, locale, timezone))}
              </span>
            </div>
          )}
        </>
      )}

      {/* Pendente */}
      {!hasProfile && hasPending && (() => {
        const pendingUrl = buildDiscPublicUrl(employee.name, latestPending!.public_short_code);
        return (
          <div className="flex flex-col gap-2.5">
            {/* Chip âmbar */}
            <span className="inline-flex items-center gap-1.5 self-start rounded-full bg-amber-500 px-2.5 py-1 text-xs font-semibold text-white">
              <Clock className="h-3.5 w-3.5" />
              {t.pending}
            </span>

            {/* Link + botão Copiar — empilha no mobile, lado-a-lado ≥sm */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 min-w-0">
              {/* Campo read-only estilo input com link truncado */}
              <div
                className="flex items-center gap-1.5 flex-1 min-w-0 rounded-lg border border-border bg-muted/60 px-2.5 py-1.5 cursor-default"
                title={pendingUrl}
                onClick={(e) => e.stopPropagation()}
              >
                <Link2 className="h-3 w-3 text-muted-foreground shrink-0" />
                <span className="text-[11px] text-muted-foreground truncate min-w-0 flex-1">
                  {pendingUrl}
                </span>
              </div>

              {/* Botão Copiar — full-width no mobile, automático ≥sm */}
              <Button
                variant="outline"
                size="sm"
                className="shrink-0 gap-1.5 h-8 px-3 text-xs w-full sm:w-auto"
                onClick={handleCopyPendingLink}
              >
                <Copy className="h-3.5 w-3.5" />
                {t.copyLink}
              </Button>
            </div>
          </div>
        );
      })()}

      {/* Sem teste */}
      {!hasProfile && !hasPending && (
        <div className="flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-muted-foreground">
            {t.noProfile}
          </span>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={(e) => { e.stopPropagation(); onGenerateLink(employee.id); }}
            disabled={isGenerating}
          >
            {isGenerating ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Link2 className="h-3.5 w-3.5" />
            )}
            {t.generateLink}
          </Button>
        </div>
      )}

      {/* Indicador de clicabilidade */}
      <div className="flex items-center justify-end gap-0.5 mt-auto pt-1 pointer-events-none">
        <span className="text-xs text-muted-foreground group-hover:text-primary transition-colors">
          {t.viewDetails}
        </span>
        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary transition-colors" />
      </div>
    </div>
  );
}

// ── Componente principal ────────────────────────────────────────────────────
export function EmployeeDiscOverview({ employees }: EmployeeDiscOverviewProps) {
  const { locale } = useAppLocaleContext();
  const { toast } = useToast();
  const t = MESSAGES[locale].app.employees.form.disc.overview;
  const tToasts = MESSAGES[locale].app.employees.toasts;

  const { profilesByEmployee, isLoading, generateLink } = useCompanyDiscProfiles();

  // ID do funcionário cujo link está sendo gerado (para loading por card)
  const [generatingFor, setGeneratingFor] = useState<string | null>(null);

  // Funcionário selecionado para exibir o detalhe in-place (null = grade de cards)
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null);

  // View de comparação de 2 funcionários (in-place)
  const [comparing, setComparing] = useState(false);

  // Apenas funcionários ativos
  const activeEmployees = employees.filter((e) => e.is_active !== false);

  const handleGenerateLink = async (employeeId: string) => {
    const emp = employees.find((e) => e.id === employeeId);
    if (!emp) return;

    setGeneratingFor(employeeId);
    generateLink.mutate(employeeId, {
      onSuccess: async (row) => {
        const url = buildDiscPublicUrl(emp.name, row.public_short_code);
        try {
          await navigator.clipboard.writeText(url);
          toast({ title: tToasts.linkCopied, description: url, duration: 10000 });
        } catch {
          toast({ title: tToasts.pontoLinkGenerated, description: url, duration: 10000 });
        }
        setGeneratingFor(null);
      },
      onError: () => {
        setGeneratingFor(null);
      },
    });
  };

  // View de comparação in-place — renderiza em vez do grid
  if (comparing) {
    return (
      <EmployeeDiscCompare
        onBack={() => setComparing(false)}
        employees={activeEmployees}
        profilesByEmployee={profilesByEmployee}
      />
    );
  }

  // Detalhe in-place — renderiza em vez do grid, sem trocar de rota
  if (selectedEmployeeId) {
    return (
      <EmployeeProfileDetail
        employeeId={selectedEmployeeId}
        onBack={() => setSelectedEmployeeId(null)}
        allEmployees={activeEmployees}
        profilesByEmployeeExternal={profilesByEmployee}
        onChangeEmployee={(id) => setSelectedEmployeeId(id)}
      />
    );
  }

  if (isLoading) {
    return (
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="h-40 rounded-2xl bg-muted animate-pulse" />
        ))}
      </div>
    );
  }

  if (activeEmployees.length === 0) {
    return (
      <EmptyState
        icon={<Brain className="h-12 w-12" />}
        title={t.emptyTitle}
        description={t.emptyDescription}
      />
    );
  }

  // Quantos funcionários já têm perfil concluído (habilita a comparação: exige 2+)
  const completedCount = activeEmployees.filter(
    (e) => !!profilesByEmployee[e.id]?.latestCompleted?.primary_type,
  ).length;

  return (
    <>
      {/* Barra superior: botão Comparar (canto superior direito) */}
      {completedCount >= 2 && (
        <div className="mb-4 flex justify-end">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => setComparing(true)}
          >
            <GitCompareArrows className="h-4 w-4" />
            {t.compare.button}
          </Button>
        </div>
      )}

      {/* Grid de cards */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3">
        {activeEmployees.map((emp) => {
          const summary = profilesByEmployee[emp.id] ?? {
            latestCompleted: null,
            latestPending: null,
          };
          return (
            <EmployeeDiscCard
              key={emp.id}
              employee={emp}
              latestCompleted={summary.latestCompleted}
              latestPending={summary.latestPending}
              onSelect={setSelectedEmployeeId}
              onGenerateLink={handleGenerateLink}
              isGenerating={generatingFor === emp.id}
            />
          );
        })}
      </div>
    </>
  );
}
