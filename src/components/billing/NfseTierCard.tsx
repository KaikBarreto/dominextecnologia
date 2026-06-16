import { useState } from 'react';
import { toast } from 'sonner';
import { FileText, ArrowUpCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { cn } from '@/lib/utils';
import { formatBRL } from '@/utils/currency';
import { useNfseQuota } from '@/hooks/useNfseQuota';
import { useNfseTiers, formatTierLimit } from '@/hooks/useNfseTiers';
import { useNfseTierChange } from '@/hooks/useNfseTierChange';

interface NfseTierCardProps {
  companyId: string | null | undefined;
  /** Só renderiza se a empresa tem o módulo `nfe`. */
  hasNfeModule: boolean;
}

/**
 * Cartão do nível de Notas Fiscais (NFS-e) na tela de assinatura do tenant.
 * Mostra o nível atual + cota mensal e abre um seletor de upgrade (só níveis
 * acima do atual; downgrade fora de escopo). O total da assinatura é a fonte da
 * verdade do edge — aqui só exibimos o preço por nível, sem recomputar o total.
 */
export function NfseTierCard({ companyId, hasNfeModule }: NfseTierCardProps) {
  const { tier: currentTier, unlimited, isLoading: quotaLoading } = useNfseQuota(companyId);
  const { tiers, isLoading: tiersLoading } = useNfseTiers();
  const { changeTier, isChanging } = useNfseTierChange();

  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);

  if (!hasNfeModule) return null;
  if (quotaLoading || tiersLoading) return null;

  const current = tiers.find((t) => t.tier === currentTier);
  const upgradeOptions = tiers.filter((t) => t.tier > currentTier);

  const handleConfirm = async () => {
    if (!companyId || selected == null) return;
    try {
      const res = await changeTier({ companyId, targetTier: selected });
      toast.success(res.message || 'Nível de Notas Fiscais atualizado!');
      if (res.asaas_warning) toast.warning(res.asaas_warning);
      setOpen(false);
      setSelected(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Não foi possível alterar o nível.');
    }
  };

  return (
    <>
      <Card>
        <CardHeader className="p-4 md:p-6">
          <div className="flex items-start justify-between gap-3">
            <CardTitle className="text-[13px] font-semibold uppercase tracking-widest text-foreground/85 flex items-center gap-2">
              <div className="p-1.5 md:p-2 rounded-lg md:rounded-xl bg-primary shrink-0">
                <FileText className="h-4 w-4 md:h-5 md:w-5 text-primary-foreground" />
              </div>
              Notas Fiscais
            </CardTitle>
            <Badge variant="outline" className="text-primary border-primary shrink-0">
              Nível {currentTier}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="p-4 md:p-6 pt-0 space-y-3">
          <p className="text-sm text-muted-foreground">
            {current?.name ?? `Nível ${currentTier}`} ·{' '}
            {unlimited ? 'Notas ilimitadas por mês' : formatTierLimit(current?.monthlyLimit ?? null)}
          </p>
          {upgradeOptions.length > 0 ? (
            <Button variant="outline" className="w-full gap-2" onClick={() => setOpen(true)}>
              <ArrowUpCircle className="h-4 w-4" /> Alterar nível
            </Button>
          ) : (
            <p className="text-xs text-muted-foreground">Você já está no nível máximo.</p>
          )}
        </CardContent>
      </Card>

      <ResponsiveModal
        open={open}
        onOpenChange={(o) => {
          if (!isChanging) {
            setOpen(o);
            if (!o) setSelected(null);
          }
        }}
        title="Alterar nível de Notas Fiscais"
        footer={
          <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={isChanging}>
              Cancelar
            </Button>
            <Button onClick={handleConfirm} disabled={selected == null || isChanging} className="gap-2">
              {isChanging ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUpCircle className="h-4 w-4" />}
              Confirmar upgrade
            </Button>
          </div>
        }
      >
        <div className="space-y-2.5 py-1">
          <p className="text-sm text-muted-foreground">
            Escolha um nível acima do atual (Nível {currentTier}). O novo limite é liberado na hora e o
            valor entra na próxima cobrança.
          </p>
          {upgradeOptions.map((t) => {
            const isSel = selected === t.tier;
            return (
              <button
                type="button"
                key={t.tier}
                onClick={() => setSelected(t.tier)}
                className={cn(
                  'w-full text-left rounded-xl border-2 p-3 transition-all',
                  isSel ? 'border-primary bg-primary/5' : 'border-border hover:border-muted-foreground/30',
                )}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="font-bold text-base">{t.name}</p>
                      {isSel && <CheckCircle2 className="h-4 w-4 text-primary" />}
                    </div>
                    <p className="text-sm text-muted-foreground">{formatTierLimit(t.monthlyLimit)}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-lg font-bold text-primary">R$ {formatBRL(t.price)}</p>
                    <p className="text-[10px] text-muted-foreground">/mês</p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </ResponsiveModal>
    </>
  );
}
