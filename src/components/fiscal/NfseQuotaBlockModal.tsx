import { useState } from 'react';
import { toast } from 'sonner';
import { Loader2, ArrowUpCircle, Lock, Sparkles } from 'lucide-react';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { Button } from '@/components/ui/button';
import { useNfseTierChange } from '@/hooks/useNfseTierChange';
import { formatBRL } from '@/utils/currency';

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

  const nextTier = info?.nextTier ?? null;

  const handleUpgrade = async () => {
    if (!companyId || !nextTier) return;
    setErrorMsg(null);
    try {
      await changeTier({ companyId, targetTier: nextTier.tier });
      toast.success('Nível atualizado! Você já pode emitir.');
      onOpenChange(false);
      onUpgraded();
    } catch (err) {
      // Mensagem PT-BR do edge (ex: não é o responsável pela assinatura).
      setErrorMsg(err instanceof Error ? err.message : 'Não foi possível atualizar o nível.');
    }
  };

  const limitLabel = nextTier?.limit == null ? 'ilimitadas' : `${nextTier.limit.toLocaleString('pt-BR')} notas/mês`;

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={(o) => {
        if (!isChanging) {
          if (!o) setErrorMsg(null);
          onOpenChange(o);
        }
      }}
      title="Limite de notas atingido"
      footer={
        nextTier ? (
          <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isChanging}>
              Agora não
            </Button>
            <Button onClick={handleUpgrade} disabled={isChanging || !companyId} className="gap-2">
              {isChanging ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUpCircle className="h-4 w-4" />}
              Fazer upgrade para {nextTier.name} — R$ {formatBRL(nextTier.price)}/mês
            </Button>
          </div>
        ) : (
          <div className="flex justify-end">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Fechar
            </Button>
          </div>
        )
      }
    >
      <div className="space-y-4 py-1">
        <div className="flex items-start gap-3 rounded-lg border border-warning/40 bg-warning/10 p-3">
          <Lock className="h-5 w-5 text-warning shrink-0 mt-0.5" />
          <p className="text-sm text-foreground">
            Você emitiu <strong>{info?.used ?? 0}</strong> de <strong>{info?.limit ?? 0}</strong> notas
            fiscais este mês no seu nível atual. Para emitir mais notas ainda este mês, suba de nível.
          </p>
        </div>

        {nextTier ? (
          <div className="rounded-xl border-2 border-primary/40 bg-primary/5 p-4">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <span className="text-xs font-semibold uppercase tracking-wider text-primary">
                Próximo nível
              </span>
            </div>
            <div className="flex items-end justify-between gap-3">
              <div className="min-w-0">
                <p className="font-bold text-base">{nextTier.name}</p>
                <p className="text-sm text-muted-foreground">{limitLabel}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-xl font-bold text-primary">R$ {formatBRL(nextTier.price)}</p>
                <p className="text-[11px] text-muted-foreground">/mês</p>
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground mt-3">
              O upgrade libera a cota maior na hora e a nota que você estava emitindo é concluída
              automaticamente. O novo valor entra na próxima cobrança.
            </p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Você já está no nível máximo. Se precisa de mais capacidade, fale com o suporte.
          </p>
        )}

        {errorMsg && (
          <p className="text-sm text-destructive">{errorMsg}</p>
        )}
      </div>
    </ResponsiveModal>
  );
}
