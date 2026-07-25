// ─────────────────────────────────────────────────────────────────────────────
// EmployeeDiscPanel — Perfil Comportamental (DISC) no detalhe do funcionário (RH).
//
// Montado numa aba do EmployeeFormDialog (só em edição, precisa do employee.id).
// Estados:
//   • sem perfil e sem link → EmptyState + "Gerar link do teste".
//   • link pendente         → badge saturado "Aguardando resposta" + copiar/compartilhar.
//   • respondido            → DiscReport (variant compact) embutido + "ver relatório
//                             completo" (abre full em ResponsiveModal) + "Refazer teste".
//   • histórico             → versões datadas; clicar abre o relatório daquela data.
//
// Fronteira Supabase = useEmployeeDisc (hook). Este componente nunca toca supabase.
// Regra do app: link gerado JÁ copia pra área de transferência (toast).
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect } from 'react';
import { Brain, Copy, Share2, Loader2, RotateCcw, Clock, FileText, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { EmptyState } from '@/components/mobile/EmptyState';
import { useToast } from '@/hooks/use-toast';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';
import { formatDate } from '@/lib/format';
import {
  useEmployeeDisc,
  buildDiscPublicUrl,
  type DiscAssessment,
} from '@/hooks/useEmployeeDisc';
import { DiscReport } from '@/components/employees/disc/DiscReport';
import type { DiscScores } from '@/lib/disc/scoring';

interface EmployeeDiscPanelProps {
  /** Undefined quando o funcionário ainda não foi salvo (modo criação). */
  employeeId?: string;
  employeeName: string;
  /** true quando estamos na criação e o funcionário ainda não tem id. */
  isNew?: boolean;
  /** true durante o salvamento automático antes de gerar o link na criação. */
  isSavingForDisc?: boolean;
  /** Chamado quando o usuário clica em "Gerar link" mas o funcionário ainda não existe. */
  onNeedSaveThenGenerate?: () => void;
  /** Quando true, dispara generateLink automaticamente (usado após save-then-generate). */
  autoGenerate?: boolean;
}

export function EmployeeDiscPanel({
  employeeId,
  employeeName,
  isNew = false,
  isSavingForDisc = false,
  onNeedSaveThenGenerate,
  autoGenerate = false,
}: EmployeeDiscPanelProps) {
  const { toast } = useToast();
  const { locale, timezone } = useAppLocaleContext();
  const t = MESSAGES[locale].app.employees.form.disc;

  const { assessments, currentProfile, pendingAssessment, isLoading, generateLink } =
    useEmployeeDisc(employeeId ?? null);

  // Relatório aberto no modal (versão histórica clicada ou "ver completo").
  const [reportAssessment, setReportAssessment] = useState<DiscAssessment | null>(null);

  const interpolate = (tpl: string, vars: Record<string, string>) =>
    tpl.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? `{${k}}`);

  const copyLink = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      toast({ title: MESSAGES[locale].app.employees.toasts.linkCopied, description: url });
    } catch {
      toast({ variant: 'destructive', title: t.linkCopyFailed, description: url });
    }
  };

  // Após save-then-generate: o employeeId acabou de aparecer. Dispara a geração
  // automaticamente sem exigir um segundo clique do usuário.
  useEffect(() => {
    if (autoGenerate && employeeId && !generateLink.isPending && !pendingAssessment && !currentProfile) {
      // Não passa showResult → NULL → herda config da empresa via COALESCE.
      generateLink.mutate({ employeeId }, {
        onSuccess: (row) => {
          const url = buildDiscPublicUrl(employeeName, row.public_short_code);
          void copyLink(url);
        },
      });
    }
    // Só deve disparar quando autoGenerate e employeeId chegam pela primeira vez.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoGenerate, employeeId]);

  const shareLink = async (url: string) => {
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title: t.shareText, text: t.shareText, url });
        return;
      } catch {
        // usuário cancelou o share nativo — cai no copiar
      }
    }
    void copyLink(url);
  };

  // Gera o link, copia pra área de transferência (regra do app) e mostra toast.
  // Se o funcionário ainda não existe (isNew), delega pro EmployeeFormDialog salvar primeiro.
  // Não passa showResult → NULL → herda config da empresa via COALESCE.
  const handleGenerate = () => {
    if (isNew || !employeeId) {
      onNeedSaveThenGenerate?.();
      return;
    }
    generateLink.mutate({ employeeId }, {
      onSuccess: (row) => {
        const url = buildDiscPublicUrl(employeeName, row.public_short_code);
        void copyLink(url);
      },
    });
  };

  const generating = generateLink.isPending || isSavingForDisc;

  if (isLoading && !isNew) {
    return (
      <div className="flex items-center justify-center py-10 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  const pendingUrl = pendingAssessment
    ? buildDiscPublicUrl(employeeName, pendingAssessment.public_short_code)
    : null;

  return (
    <div className="space-y-4">
      {/* ── Sem perfil e sem link pendente → estado vazio ────────────────────── */}
      {!currentProfile && !pendingAssessment && (
        <EmptyState
          size="compact"
          icon={<Brain className="h-full w-full" />}
          title={isNew ? t.emptyTitleNew : t.emptyTitle}
          description={isNew ? t.emptyDescriptionNew : t.emptyDescription}
          action={{
            label: generating
              ? (isSavingForDisc ? t.savingAndGenerating : t.generating)
              : t.generate,
            onClick: handleGenerate,
          }}
        />
      )}

      {/* ── Link pendente (aguardando resposta) ──────────────────────────────── */}
      {pendingAssessment && !currentProfile && pendingUrl && (
        <div className="rounded-xl border border-border p-4 space-y-3">
          <div className="flex items-center gap-2">
            {/* Badge saturado (fundo cor + texto branco), nunca outline */}
            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500 px-2.5 py-1 text-xs font-semibold text-white">
              <Clock className="h-3.5 w-3.5" />
              {t.pendingBadge}
            </span>
          </div>
          <div>
            <p className="text-sm font-medium">{t.pendingTitle}</p>
            <p className="text-xs text-muted-foreground">{t.pendingDescription}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => copyLink(pendingUrl)}>
              <Copy className="h-3.5 w-3.5" /> {t.copy}
            </Button>
            <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => shareLink(pendingUrl)}>
              <Share2 className="h-3.5 w-3.5" /> {t.share}
            </Button>
          </div>
        </div>
      )}

      {/* ── Respondido (perfil atual) ────────────────────────────────────────── */}
      {currentProfile && currentProfile.scores && currentProfile.profile_code && (
        <div className="space-y-3">
          <DiscReport
            scores={currentProfile.scores as DiscScores}
            profileCode={currentProfile.profile_code}
            variant="compact"
          />
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => setReportAssessment(currentProfile)}
            >
              <FileText className="h-3.5 w-3.5" /> {t.viewFullReport}
            </Button>
            {/* Refazer = ação não destrutiva (gera nova versão) */}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={handleGenerate}
              disabled={generating}
            >
              {generating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
              {t.retake}
            </Button>
          </div>
        </div>
      )}

      {/* ── Histórico de versões datadas ─────────────────────────────────────── */}
      {assessments.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t.historyTitle}
          </p>
          <div className="rounded-xl border border-border divide-y divide-border overflow-hidden">
            {assessments.map((a) => {
              const isCompleted = a.status === 'completed';
              const label = isCompleted && a.completed_at
                ? interpolate(t.respondedOn, { date: formatDate(a.completed_at, locale, timezone) })
                : interpolate(t.generatedOn, { date: formatDate(a.created_at, locale, timezone) });
              return (
                <button
                  key={a.id}
                  type="button"
                  disabled={!isCompleted}
                  onClick={() => isCompleted && setReportAssessment(a)}
                  className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-sm transition-colors enabled:hover:bg-muted disabled:cursor-default"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold text-white ${
                        isCompleted ? 'bg-emerald-600' : 'bg-amber-500'
                      }`}
                    >
                      {isCompleted ? (a.profile_code ?? t.completedBadge) : t.historyPending}
                    </span>
                    <span className="truncate text-muted-foreground">{label}</span>
                  </div>
                  {isCompleted && <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Modal do relatório completo (drawer no mobile via ResponsiveModal) ── */}
      <ResponsiveModal
        open={!!reportAssessment}
        onOpenChange={(o) => !o && setReportAssessment(null)}
        title={t.reportModalTitle}
      >
        {reportAssessment?.scores && reportAssessment.profile_code && (
          <DiscReport
            scores={reportAssessment.scores as DiscScores}
            profileCode={reportAssessment.profile_code}
            variant="full"
          />
        )}
      </ResponsiveModal>
    </div>
  );
}
