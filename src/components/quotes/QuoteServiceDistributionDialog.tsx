import { useEffect, useMemo, useState } from 'react';
import { Check, Wrench } from 'lucide-react';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { NoticeBanner } from '@/components/ui/NoticeBanner';
import { useEquipment } from '@/hooks/useEquipment';
import { useServiceTypes } from '@/hooks/useServiceTypes';
import type { Quote } from '@/hooks/useQuotes';
import {
  buildEquipmentServiceDistribution,
  type QuoteEquipmentServiceAssignment,
} from '@/lib/quoteServiceDistribution';

interface Props {
  open: boolean;
  quote: Quote | null;
  loading?: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (items: QuoteEquipmentServiceAssignment[]) => void;
}

export function QuoteServiceDistributionDialog({
  open, quote, loading, onOpenChange, onConfirm,
}: Props) {
  const { equipment: rawEquipment } = useEquipment(quote?.customer_id ?? undefined);
  const { serviceTypes } = useServiceTypes();
  const [assignments, setAssignments] = useState<Record<string, string[]>>({});
  // Sem cliente, useEquipment retorna o catálogo inteiro da empresa para outras
  // telas. Aqui isso seria uma distribuição indevida, então a lista efetiva é vazia.
  const equipment = quote?.customer_id ? rawEquipment : [];

  const quoteServiceIds = useMemo(() => Array.from(new Set(
    (quote?.quote_items ?? [])
      .map(item => item.service_type_id)
      .filter((id): id is string => !!id),
  )), [quote]);
  const quoteServiceIdsKey = quoteServiceIds.join('|');

  useEffect(() => {
    if (!open) return;
    const ids = quoteServiceIdsKey ? quoteServiceIdsKey.split('|') : [];
    setAssignments(Object.fromEntries(ids.map(id => [id, []])));
  }, [open, quote?.id, quoteServiceIdsKey]);

  const requiresDistribution = quoteServiceIds.length > 0 && equipment.length > 0;
  const complete = !requiresDistribution
    || quoteServiceIds.every(serviceId => (assignments[serviceId]?.length ?? 0) > 0);

  const toggle = (serviceId: string, equipmentId: string) => {
    setAssignments(prev => {
      const current = prev[serviceId] ?? [];
      return {
        ...prev,
        [serviceId]: current.includes(equipmentId)
          ? current.filter(id => id !== equipmentId)
          : [...current, equipmentId],
      };
    });
  };

  const footer = (
    <div className="flex w-full justify-end gap-2">
      <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
        Cancelar
      </Button>
      <Button
        type="button"
        disabled={!complete || loading}
        onClick={() => onConfirm(buildEquipmentServiceDistribution(assignments))}
      >
        {loading ? 'Gerando...' : 'Gerar OS'}
      </Button>
    </div>
  );

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      title={`Distribuir serviços · Orçamento #${quote?.quote_number ?? ''}`}
      description="Defina em qual equipamento cada serviço será executado. Os checklists vinculados serão aplicados automaticamente."
      className="sm:max-w-[760px]"
      footer={footer}
    >
      <div className="space-y-4">
        {!quote?.customer_id && (
          <NoticeBanner variant="warning">
            Este orçamento não tem cliente cadastrado. A OS será gerada sem equipamentos.
          </NoticeBanner>
        )}
        {quote?.customer_id && equipment.length === 0 && (
          <NoticeBanner variant="info">
            O cliente não possui equipamentos cadastrados. Você poderá adicioná-los depois na OS.
          </NoticeBanner>
        )}
        {quoteServiceIds.length === 0 && (
          <NoticeBanner variant="info">
            O orçamento não possui tipos de serviço vinculados. A OS será gerada com os itens e valores, sem distribuição.
          </NoticeBanner>
        )}

        {quoteServiceIds.map(serviceId => {
          const service = serviceTypes.find(item => item.id === serviceId);
          const selected = assignments[serviceId] ?? [];
          const allSelected = equipment.length > 0 && selected.length === equipment.length;
          return (
            <section key={serviceId} className="rounded-lg border bg-card p-3 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: service?.color || '#64748b' }} />
                  <h3 className="truncate text-sm font-semibold">{service?.name ?? 'Serviço do orçamento'}</h3>
                  <Badge variant="outline" className="shrink-0">{selected.length} equipamento(s)</Badge>
                </div>
                {equipment.length > 1 && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => setAssignments(prev => ({
                      ...prev,
                      [serviceId]: allSelected ? [] : equipment.map(item => item.id),
                    }))}
                  >
                    <Check className="mr-1 h-3.5 w-3.5" />
                    {allSelected ? 'Limpar' : 'Todos'}
                  </Button>
                )}
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                {equipment.map(item => {
                  const checked = selected.includes(item.id);
                  return (
                    <label
                      key={item.id}
                      className="flex cursor-pointer items-center gap-3 rounded-md border px-3 py-2.5 hover:bg-muted/40"
                    >
                      <Checkbox checked={checked} onCheckedChange={() => toggle(serviceId, item.id)} />
                      <Wrench className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">{item.name}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {[item.brand, item.model, item.identifier].filter(Boolean).join(' · ') || 'Sem detalhes'}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
              {requiresDistribution && selected.length === 0 && (
                <p className="text-xs text-destructive">Selecione ao menos um equipamento para este serviço.</p>
              )}
            </section>
          );
        })}
      </div>
    </ResponsiveModal>
  );
}
