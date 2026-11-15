import { RefreshCw } from 'lucide-react';
import { EmptyState } from '@/components/mobile/EmptyState';
import { PdvPageSkeleton } from '@/components/pdv/loading/PdvPageSkeleton';
import { usePdvSalesFlow, type PdvFulfillmentMode, type PdvSalesFlowCardModel } from '@/hooks/usePdvSalesFlow';
import { PdvSalesFlowBoard } from './PdvSalesFlowBoard';

/** Só é montado quando o usuário escolhe a visão e possui acesso ao fluxo. */
export function PdvFullSalesFlow({ fulfillmentMode, onOpen, formatMoney }: {
  fulfillmentMode: PdvFulfillmentMode;
  onOpen: (card: PdvSalesFlowCardModel) => void;
  formatMoney: (amount: number) => string;
}) {
  const flow = usePdvSalesFlow();
  if (flow.isLoading) return <PdvPageSkeleton variant="kanban" label="Carregando fluxo do balcão" />;
  if (flow.isError) return <EmptyState icon={<RefreshCw className="h-12 w-12 text-destructive" />} title="Não foi possível carregar o fluxo" description="Atualize a fila e tente novamente." action={{ label: 'Tentar novamente', onClick: () => void flow.refetch() }} />;
  return <PdvSalesFlowBoard cards={flow.data ?? []} fulfillmentMode={fulfillmentMode} onOpen={onOpen} formatMoney={formatMoney} />;
}
