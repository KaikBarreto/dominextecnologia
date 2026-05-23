import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Printer } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

import {
  PmocCronogramaCalendar,
  type PmocCronogramaCalendarOrder,
} from './PmocCronogramaCalendar';
import { useServiceOrders } from '@/hooks/useServiceOrders';
import type { ServiceOrder } from '@/types/database';

/**
 * Aba "Cronograma" do contrato PMOC (Onda C — v1.9.x).
 *
 * Renderiza o calendar reaproveitado da /agenda, filtrado pelo `contract_id`.
 * Não há criação/edição de OS aqui — gestor que quiser mexer numa OS clica
 * e cai no detalhe.
 *
 * Plano: docs/planos/2026-05-23-pmoc-onda-C-dossie-cronograma.md §4.7 / §5.3 (passo 7)
 */

export interface PmocContractCronogramaTabProps {
  contractId: string;
  /** Atalho pra "Gerar PDF anual" — callback fornecido pelo container. */
  onJumpToDocsTab?: () => void;
}

export function PmocContractCronogramaTab({
  contractId,
  onJumpToDocsTab,
}: PmocContractCronogramaTabProps) {
  const navigate = useNavigate();
  const { serviceOrders, isLoading } = useServiceOrders();

  const contractOrders = useMemo<PmocCronogramaCalendarOrder[]>(() => {
    return (serviceOrders || []).filter(
      (o: ServiceOrder) => o.contract_id === contractId,
    ) as unknown as PmocCronogramaCalendarOrder[];
  }, [serviceOrders, contractId]);

  const handleOSClick = (os: ServiceOrder) => {
    // Em desktop e mobile, redireciona pra rota da OS (mesma de outros contextos).
    if (os.id) navigate(`/os-tecnico/${os.id}`);
  };

  return (
    <Card className="w-full min-w-0 max-w-full overflow-hidden">
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <CardTitle className="break-words">Cronograma do contrato</CardTitle>
          <p className="text-xs text-muted-foreground">
            Visualize todas as manutenções desta unidade em formato calendário.
          </p>
        </div>
        {onJumpToDocsTab && (
          <Button
            variant="outline"
            size="sm"
            onClick={onJumpToDocsTab}
            className="min-h-[40px] shrink-0"
          >
            <Printer className="mr-1 h-3.5 w-3.5" />
            Imprimir PDF Anual
          </Button>
        )}
      </CardHeader>
      <CardContent className="min-w-0">
        {isLoading ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Carregando ordens…</p>
        ) : (
          <PmocCronogramaCalendar
            serviceOrders={contractOrders}
            view={undefined /* deixa o gestor alternar */}
            onOSClick={handleOSClick}
            showControls
          />
        )}
      </CardContent>
    </Card>
  );
}
