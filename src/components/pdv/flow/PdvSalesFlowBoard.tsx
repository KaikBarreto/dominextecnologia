import { useEffect, useMemo, useState } from 'react';
import { Inbox, Search, X } from 'lucide-react';
import { EmptyState } from '@/components/mobile/EmptyState';
import { Button } from '@/components/ui/button';
import { SearchField } from '@/components/ui/search-field-actions';
import { KanbanColumnHeader } from '@/components/ui/KanbanColumnHeader';
import { PdvSalesFlowCard } from './PdvSalesFlowCard';
import { PDV_SALES_FLOW_STAGE_META } from './pdvSalesFlowStage';
import { cn, normalizeSearch } from '@/lib/utils';
import '@/components/pdv/pdv-preview-sale.css';
import '@/components/pdv/PdvWorkspace.css';
import type { PdvFulfillmentMode, PdvSalesFlowCardModel, PdvSalesFlowStage } from '@/hooks/usePdvSalesFlow';

interface FlowColumn {
  stage: PdvSalesFlowStage;
  label: string;
}

const DISPATCH_COLUMNS: FlowColumn[] = [
  { stage: 'draft', label: 'Orçamentos' },
  { stage: 'cash', label: 'No caixa' },
  { stage: 'pickup', label: 'Retirada' },
];
const CASHIER_COLUMNS: FlowColumn[] = [
  { stage: 'draft', label: 'Orçamento' },
  { stage: 'cash', label: 'No caixa' },
  { stage: 'completed', label: 'Concluído' },
];

interface Props {
  cards: PdvSalesFlowCardModel[];
  fulfillmentMode: PdvFulfillmentMode;
  onOpen: (card: PdvSalesFlowCardModel) => void;
  formatMoney: (value: number) => string;
  selectedFlowId?: string | null;
}

export function PdvSalesFlowBoard({ cards, fulfillmentMode, onOpen, formatMoney, selectedFlowId }: Props) {
  const columns = useMemo(() => fulfillmentMode === 'cashier' ? CASHIER_COLUMNS : DISPATCH_COLUMNS, [fulfillmentMode]);
  const [query, setQuery] = useState('');
  const normalizedQuery = normalizeSearch(query);
  const hasSearch = normalizedQuery.length > 0;
  const filteredCards = useMemo(() => {
    const terms = normalizedQuery.split(' ').filter(Boolean);
    if (!terms.length) return cards;
    return cards.filter(card => {
      const text = normalizeSearch([
        card.preorderNumber == null ? '' : `Orçamento #${card.preorderNumber}`,
        card.orderNumber == null ? '' : `Pedido #${card.orderNumber}`,
        card.customerName ?? 'Sem cliente', card.stockName ?? '', PDV_SALES_FLOW_STAGE_META[card.stage].label,
      ].join(' '));
      return terms.every(term => text.includes(term));
    });
  }, [cards, normalizedQuery]);
  const cardsByStage = useMemo(() => new Map(columns.map(column => [column.stage,
    filteredCards.filter(card => card.stage === column.stage || column.stage === 'pickup' && card.stage === 'partial'),
  ])), [columns, filteredCards]);
  const visibleColumns = useMemo(() => hasSearch ? columns.filter(column => (cardsByStage.get(column.stage)?.length ?? 0) > 0) : columns, [cardsByStage, columns, hasSearch]);
  const [mobileStage, setMobileStage] = useState<PdvSalesFlowStage>(columns[0].stage);
  const activeColumn = visibleColumns.find(column => column.stage === mobileStage) ?? visibleColumns[0];
  useEffect(() => {
    if (visibleColumns.length && !visibleColumns.some(column => column.stage === mobileStage)) setMobileStage(visibleColumns[0].stage);
  }, [mobileStage, visibleColumns]);

  return <section aria-label="Fluxo do balcão" className="min-w-0 space-y-4">
    <div className="flex max-w-xl items-center gap-2">
      <SearchField containerClassName="min-w-0 flex-1" value={query} onChange={event => setQuery(event.target.value)} aria-label="Buscar no fluxo do balcão" placeholder="Buscar por número, cliente ou estoque" />
      {query && <Button type="button" size="icon" variant="ghost" aria-label="Limpar busca do fluxo" onClick={() => setQuery('')}><X className="h-4 w-4" /></Button>}
    </div>
    {hasSearch && visibleColumns.length === 0 ? <EmptyState icon={<Search className="h-10 w-10" />} title="Nenhum atendimento encontrado" description="Tente outro número ou nome de cliente." action={{ label: 'Limpar busca', onClick: () => setQuery('') }} /> : <>
      <div className="hidden overflow-x-auto pb-2 md:block">
        <div className={cn('grid min-w-full grid-flow-col grid-cols-none gap-4', fulfillmentMode === 'dispatch' ? 'auto-cols-[minmax(17rem,1fr)]' : 'auto-cols-[minmax(19rem,1fr)]')}>
          {visibleColumns.map(column => <FlowColumnSection key={column.stage} column={column} cards={cardsByStage.get(column.stage) ?? []} selectedFlowId={selectedFlowId} onOpen={onOpen} formatMoney={formatMoney} />)}
        </div>
      </div>
      <div className="md:hidden">
        <nav aria-label="Etapas do fluxo" className="flex gap-5 overflow-x-auto border-b border-border">
          {visibleColumns.map(column => <button key={column.stage} type="button" onClick={() => setMobileStage(column.stage)} aria-current={column.stage === activeColumn?.stage ? 'page' : undefined} className={cn('min-h-11 shrink-0 border-b-2 py-2 text-sm font-semibold', column.stage === activeColumn?.stage ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground')}>
            {column.label} ({cardsByStage.get(column.stage)?.length ?? 0})
          </button>)}
        </nav>
        {activeColumn && <div className="mt-3"><FlowColumnSection column={activeColumn} cards={cardsByStage.get(activeColumn.stage) ?? []} selectedFlowId={selectedFlowId} onOpen={onOpen} formatMoney={formatMoney} /></div>}
      </div>
    </>}
  </section>;
}

function FlowColumnSection({ column, cards, selectedFlowId, onOpen, formatMoney }: {
  column: FlowColumn; cards: PdvSalesFlowCardModel[]; selectedFlowId?: string | null;
  onOpen: (card: PdvSalesFlowCardModel) => void; formatMoney: (value: number) => string;
}) {
  const meta = PDV_SALES_FLOW_STAGE_META[column.stage];
  const emptyMessage = column.stage === 'draft' ? 'Nenhum orçamento nesta etapa.' : column.stage === 'cash' ? 'Nenhum atendimento aguardando no caixa.' : column.stage === 'pickup' ? 'Nenhum pedido aguardando retirada.' : 'Nenhum atendimento concluído.';
  return <section className="min-w-0 overflow-hidden rounded-2xl border bg-background" data-pdv-flow-column={column.stage}>
    <KanbanColumnHeader title={column.label} color={meta.color} count={cards.length} icon={meta.Icon} />
    <div className="pdv-preview-sale space-y-2 p-2.5">
      {cards.length ? cards.map(card => <PdvSalesFlowCard key={card.flowId} card={card} selected={card.flowId === selectedFlowId} onOpen={onOpen} formatMoney={formatMoney} showStage={false} />) : <EmptyState size="compact" icon={<Inbox className="h-5 w-5" />} title={emptyMessage} />}
    </div>
  </section>;
}
