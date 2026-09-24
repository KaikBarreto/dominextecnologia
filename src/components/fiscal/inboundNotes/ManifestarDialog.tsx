import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Eye, Loader2, XCircle, Ban } from 'lucide-react';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';
import type { InboundNfe, ManifestacaoAcaoTipo } from '@/hooks/useInboundNotes';

const MIN_JUSTIFICATIVA = 15;
const MAX_JUSTIFICATIVA = 255;

interface ManifestarDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  nota: InboundNfe | null;
  submitting?: boolean;
  onConfirm: (tipo: ManifestacaoAcaoTipo, justificativa?: string) => void;
}

/**
 * Manifestação do destinatário para NF-e recebida. Os 4 tipos que a edge
 * `dfe-manifestar` aceita (briefing/plano); 'desconhecida' e 'nao_realizada'
 * exigem justificativa de 15 a 255 caracteres (validado aqui pra não gastar
 * uma transmissão com rejeição previsível — a mesma CHECK existe no banco em
 * `dfe_manifestacao_jobs`).
 *
 * A manifestação é ASSÍNCRONA e IRREVERSÍVEL perante a Receita: este dialog só
 * PEDE. Quem chama decide o que fazer com o pedido (a nota vai pra
 * "em processamento" — nunca "confirmada" direto no clique).
 */
export function ManifestarDialog({ open, onOpenChange, nota, submitting, onConfirm }: ManifestarDialogProps) {
  const { locale } = useAppLocaleContext();
  const t = MESSAGES[locale].app.nfse.recebidas.manifestarDialog;

  const [tipo, setTipo] = useState<ManifestacaoAcaoTipo | null>(null);
  const [justificativa, setJustificativa] = useState('');

  useEffect(() => {
    if (open) {
      setTipo(null);
      setJustificativa('');
    }
  }, [open, nota?.id]);

  // Só 'nao_realizada' exige justificativa (NT 2020.001 v1.50 tirou a exigência
  // do Desconhecimento — a edge `dfe-manifestar` só serializa `xJust` aí; ver
  // `supabase/functions/_shared/dfe-client.ts`, `TIPO_EXIGE_JUSTIFICATIVA`).
  const needsJustificativa = tipo === 'nao_realizada';
  const trimmedLength = justificativa.trim().length;
  const justificativaValid = !needsJustificativa || trimmedLength >= MIN_JUSTIFICATIVA;
  const canSubmit = !!tipo && justificativaValid && !submitting;

  // Já existe pedido em voo pra esta nota: não deixa abrir outro (a fila só
  // aceita um job vivo por nota — `dfe_manifestacao_jobs_inbound_uniq`).
  const alreadyPending = !!nota?.manifestacao_pendente;

  const options = useMemo(
    () =>
      [
        {
          value: 'ciencia' as const,
          icon: Eye,
          label: t.tipoCiencia,
          hint: t.tipoCienciaHint,
          // Ciência não faz sentido se já demos ciência ou fomos além dela.
          disabled: nota?.manifestacao !== 'nenhuma',
        },
        {
          value: 'confirmada' as const,
          icon: CheckCircle2,
          label: t.tipoConfirmada,
          hint: t.tipoConfirmadaHint,
          disabled: nota?.manifestacao === 'confirmada',
        },
        {
          value: 'desconhecida' as const,
          icon: XCircle,
          label: t.tipoDesconhecida,
          hint: t.tipoDesconhecidaHint,
          disabled: nota?.manifestacao === 'desconhecida',
        },
        {
          value: 'nao_realizada' as const,
          icon: Ban,
          label: t.tipoNaoRealizada,
          hint: t.tipoNaoRealizadaHint,
          disabled: nota?.manifestacao === 'nao_realizada',
        },
      ] satisfies Array<{ value: ManifestacaoAcaoTipo; icon: typeof Eye; label: string; hint: string; disabled: boolean }>,
    [nota?.manifestacao, t],
  );

  const handleSubmit = () => {
    if (!canSubmit || !tipo) return;
    onConfirm(tipo, needsJustificativa ? justificativa.trim() : undefined);
  };

  const footer = (
    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3">
      <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
        {t.cancel}
      </Button>
      <Button type="button" onClick={handleSubmit} disabled={!canSubmit || alreadyPending}>
        {submitting ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            {t.submitting}
          </>
        ) : (
          t.submit
        )}
      </Button>
    </div>
  );

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      title={t.title}
      description={t.description}
      className="sm:max-w-lg"
      footer={footer}
    >
      <div className="space-y-4">
        {alreadyPending && (
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-400">
            {t.alreadyPending}
          </div>
        )}

        <div className="space-y-2">
          <Label>{t.tipoLabel}</Label>
          <div className="grid gap-2">
            {options.map((opt) => {
              const Icon = opt.icon;
              const isActive = tipo === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  disabled={opt.disabled || alreadyPending}
                  onClick={() => setTipo(opt.value)}
                  className={cn(
                    'flex items-start gap-3 rounded-lg border p-3 text-left transition-colors',
                    'disabled:cursor-not-allowed disabled:opacity-50',
                    isActive
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border bg-background hover:border-primary/50',
                  )}
                >
                  <Icon className="mt-0.5 h-4 w-4 shrink-0" />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">{opt.label}</span>
                    <span
                      className={cn(
                        'block text-xs mt-0.5',
                        isActive ? 'text-primary-foreground/85' : 'text-muted-foreground',
                      )}
                    >
                      {opt.hint}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {needsJustificativa && (
          <div className="space-y-2">
            <Label htmlFor="manifestar-justificativa">{t.justificativaLabel}</Label>
            <Textarea
              id="manifestar-justificativa"
              value={justificativa}
              onChange={(e) => setJustificativa(e.target.value)}
              placeholder={t.justificativaPlaceholder}
              rows={4}
              maxLength={MAX_JUSTIFICATIVA}
              autoFocus
            />
            <div className="flex items-center justify-between text-xs">
              {trimmedLength > 0 && !justificativaValid ? (
                <p className="text-destructive">
                  {t.justificativaTooShort.replace('{count}', String(trimmedLength))}
                </p>
              ) : (
                <span className="text-muted-foreground">
                  {t.justificativaCount.replace('{count}', String(trimmedLength))}
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </ResponsiveModal>
  );
}
