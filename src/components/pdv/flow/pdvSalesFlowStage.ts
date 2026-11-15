import { Banknote, CheckCircle2, ClipboardList, PackageCheck, PackageOpen, type LucideIcon } from 'lucide-react';
import type { PdvSalesFlowStage } from '@/hooks/usePdvSalesFlow';

/** A mesma cor identifica a etapa no card, no cabeçalho e na retirada. */
export const PDV_SALES_FLOW_STAGE_META: Record<PdvSalesFlowStage, {
  label: string;
  color: string;
  badgeClassName: string;
  accentClassName: string;
  Icon: LucideIcon;
}> = {
  draft: { label: 'Orçamento', color: '#334155', badgeClassName: 'bg-slate-700', accentClassName: 'border-l-slate-700', Icon: ClipboardList },
  cash: { label: 'No caixa', color: '#6d28d9', badgeClassName: 'bg-violet-700', accentClassName: 'border-l-violet-700', Icon: Banknote },
  pickup: { label: 'Aguardando retirada', color: '#1e40af', badgeClassName: 'bg-blue-800', accentClassName: 'border-l-blue-800', Icon: PackageOpen },
  partial: { label: 'Retirada parcial', color: '#92400e', badgeClassName: 'bg-amber-800', accentClassName: 'border-l-amber-800', Icon: PackageCheck },
  completed: { label: 'Concluído', color: '#065f46', badgeClassName: 'bg-emerald-800', accentClassName: 'border-l-emerald-800', Icon: CheckCircle2 },
};
