import { ClipboardCheck, Loader2 } from 'lucide-react';
import { EmptyState } from '@/components/mobile/EmptyState';
import { useContractPmocExecution } from '@/hooks/useContractPmocExecution';
import { PmocExecutionHistoryView } from './PmocExecutionHistoryView';

interface PmocExecutionHistoryTabProps {
  contractId: string;
  isPmoc: boolean;
}

/**
 * Aba "Histórico PMOC" do detalhe de contrato (AUTENTICADO) — PROVA de
 * cumprimento da Planilha PMOC tarefa-a-tarefa. Lê a view
 * `contract_activity_execution` (tenant-safe) via hook e delega a renderização
 * pro componente PURO `PmocExecutionHistoryView` (o mesmo usado no portal
 * público, alimentado pelo payload da edge). Mobile-first, PT-BR.
 */
export function PmocExecutionHistoryTab({ contractId, isPmoc }: PmocExecutionHistoryTabProps) {
  const { rows, isLoading, isError } = useContractPmocExecution(contractId, isPmoc);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        <span className="text-sm">Carregando histórico...</span>
      </div>
    );
  }

  if (isError) {
    return (
      <EmptyState
        icon={<ClipboardCheck className="h-full w-full" />}
        title="Não foi possível carregar o histórico"
        description="Tente novamente em alguns instantes."
      />
    );
  }

  return <PmocExecutionHistoryView rows={rows} />;
}
