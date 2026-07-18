import { useState } from 'react';
import { toast } from 'sonner';
import { Loader2, ArrowUpCircle, Lock, Sparkles } from 'lucide-react';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { Button } from '@/components/ui/button';
import { useNfseTierChange } from '@/hooks/useNfseTierChange';
import { formatMoney } from '@/lib/format';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';

export interface NfseQuotaBlockInfo {
  used: number;
  limit: number;
  tier: number;
  nextTier: { tier: number; name: string; limit: number | null; price: number } | null;
}

interface NfseQuotaBlockModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  info: NfseQuotaBlockInfo | null;
  companyId: string | null | undefined;
  /** Chamado após upgrade bem-sucedido — o chamador reexecuta a emissão. */
  onUpgraded: () => void;
}

/**
 * Modal de bloqueio de cota de NFS-e: aparece quando o servidor recusa a
 * emissão (HTTP 402 `nfse_quota_exceeded`). Oferece upgrade de 1 clique pro
 * próximo nível e, ao confirmar, dispara `onUpgraded` pra reexecutar a nota que
 * o usuário tentava emitir. O edge valida posse/super_admin; se o emissor não
 * for o responsável pela assinatura, mostramos a mensagem PT-BR do edge.
 */
export function NfseQuotaBlockModal({
  open,
  onOpenChange,
  info,
  companyId,
  onUpgraded,
}: NfseQuotaBlockModalProps) {
  const { changeTier, isChanging } = useNfseTierChange();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const { locale, currency } = useAppLocaleContext();
  const t = MESSAGES[locale].app.nfse;

  const nextTier = info?.nextTier ?? null;

  const handleUpgrade = async () => {
    if (!companyId || !nextTier) return;
    setErrorMsg(null);
    try {
      await changeTier({ companyId, targetTier: nextTier.tier });
      toast.success(t.quotaBlock.toasts.upgraded);
      onOpenChange(false);
      onUpgraded();
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : t.quotaBlock.toasts.error,
      );
    }
  };

  const limitLabel =
    nextTier?.limit == null
      ? t.quotaBlock.unlimitedNotes
      : t.quotaBlock.limitedNotes.replace('{limit}', String(nextTier.limit));

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={(o) => {
        if (!isChanging) {
          if (!o) setErrorMsg(null);
          onOpenChange(o);
        }
      }}
      title={t.quotaBlock.title}
      footer={
        nextTier ? (
          <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isChanging}>
              {t.quotaBlock.notNow}
            </Button>
            <Button onClick={handleUpgrade} disabled={isChanging || !companyId} className="gap-2">
              {isChanging ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ArrowUpCircle className="h-4 w-4" />
              )}
              {t.quotaBlock.upgradeBtn.replace('{name}', nextTier.name)} —{' '}
              {formatMoney(nextTier.price, currency, locale)}{t.quotaBlock.priceMonth}
            </Button>
          </div>
        ) : (
          <div className="flex justify-end">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              {t.quotaBlock.close}
            </Button>
          </div>
        )
      }
    >
      <div className="space-y-4 py-1">
        <div className="flex items-start gap-3 rounded-lg border border-warning/40 bg-warning/10 p-3">
          <Lock className="h-5 w-5 text-warning shrink-0 mt-0.5" />
          <p className="text-sm text-foreground">
            {t.quotaBlock.warning
              .replace('{used}', String(info?.used ?? 0))
              .replace('{limit}', String(info?.limit ?? 0))}
          </p>
        </div>

        {nextTier ? (
          <div className="rounded-xl border-2 border-primary/40 bg-primary/5 p-4">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <span className="text-xs font-semibold uppercase tracking-wider text-primary">
                {t.quotaBlock.nextTierLabel}
              </span>
            </div>
            <div className="flex items-end justify-between gap-3">
              <div className="min-w-0">
                <p className="font-bold text-base">{nextTier.name}</p>
                <p className="text-sm text-muted-foreground">{limitLabel}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-xl font-bold text-primary">
                  {formatMoney(nextTier.price, currency, locale)}
                </p>
                <p className="text-[11px] text-muted-foreground">{t.quotaBlock.priceMonth}</p>
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground mt-3">
              {t.quotaBlock.upgradeNote}
            </p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            {t.quotaBlock.maxTierReached}
          </p>
        )}

        {errorMsg && (
          <p className="text-sm text-destructive">{errorMsg}</p>
        )}
      </div>
    </ResponsiveModal>
  );
}
