import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowUpCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { cn } from '@/lib/utils';
import { formatBRL } from '@/utils/currency';
import { useToast } from '@/hooks/use-toast';
import { useNfseTiers, formatTierLimit } from '@/hooks/useNfseTiers';
import { useNfseTierChange } from '@/hooks/useNfseTierChange';

interface AdminNfseTierControlProps {
  companyId: string;
  /** Nível atual da empresa (companies.nfse_tier). */
  currentTier: number;
}

/**
 * Controle do nível de NFS-e da empresa no painel master Auctus. Mostra o nível
 * atual e abre um seletor de upgrade que chama `change-nfse-tier` (o edge aceita
 * super_admin). Downgrade fora de escopo — só níveis acima são selecionáveis.
 */
export function AdminNfseTierControl({ companyId, currentTier }: AdminNfseTierControlProps) {
  const { tiers } = useNfseTiers();
  const { changeTier, isChanging } = useNfseTierChange();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);

  const current = tiers.find((t) => t.tier === currentTier);
  const upgradeOptions = tiers.filter((t) => t.tier > currentTier);

  const handleConfirm = async () => {
    if (selected == null) return;
    try {
      const res = await changeTier({ companyId, targetTier: selected });
      toast({ title: 'Nível atualizado', description: res.message });
      if (res.asaas_warning) {
        toast({ variant: 'destructive', title: 'Atenção', description: res.asaas_warning });
      }
      // Recarrega o detalhe da empresa pra refletir o novo nível/valor.
      queryClient.invalidateQueries({ queryKey: ['admin-company', companyId] });
      setOpen(false);
      setSelected(null);
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Erro ao alterar nível',
        description: err instanceof Error ? err.message : undefined,
      });
    }
  };

  return (
    <>
      <div className="flex items-center gap-2 mt-0.5">
        <Badge variant="outline" className="text-primary border-primary">
          Nível {currentTier}
        </Badge>
        <span className="text-xs text-muted-foreground">
          {current ? formatTierLimit(current.monthlyLimit) : '—'}
        </span>
        {upgradeOptions.length > 0 && (
          <Button variant="edit-ghost" size="sm" className="h-7 px-2 gap-1" onClick={() => setOpen(true)}>
            <ArrowUpCircle className="h-3.5 w-3.5" /> Alterar
          </Button>
        )}
      </div>

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
              Confirmar
            </Button>
          </div>
        }
      >
        <div className="space-y-2.5 py-1">
          <p className="text-sm text-muted-foreground">
            Sobe o nível de NFS-e da empresa (atual: Nível {currentTier}). O valor da assinatura é
            ajustado automaticamente e sincronizado com o Asaas.
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
