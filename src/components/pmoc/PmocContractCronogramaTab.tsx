import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Printer } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

import {
  PmocCronogramaCalendar,
  type PmocCronogramaCalendarOrder,
} from './PmocCronogramaCalendar';
import { useServiceOrders } from '@/hooks/useServiceOrders';
import { useGenerateCronogramaPdf } from '@/hooks/useGeneratePmocDocument';
import type { ServiceOrder } from '@/types/database';

/**
 * Aba "Cronograma" do contrato PMOC (Onda C — v1.9.x).
 *
 * Renderiza o calendar reaproveitado da /agenda, filtrado pelo `contract_id`.
 * Não há criação/edição de OS aqui — gestor que quiser mexer numa OS clica
 * e cai no detalhe.
 *
 * Onda G — bugfix: "Imprimir PDF Anual" agora chama diretamente a mutation de
 * geração do cronograma e abre o PDF resultante em nova aba. Antes, o botão
 * só navegava de volta pra aba Documentos, frustrando o gestor.
 *
 * Plano: docs/planos/2026-05-23-pmoc-onda-C-dossie-cronograma.md §4.7 / §5.3 (passo 7)
 */

export interface PmocContractCronogramaTabProps {
  contractId: string;
}

export function PmocContractCronogramaTab({
  contractId,
}: PmocContractCronogramaTabProps) {
  const navigate = useNavigate();
  const { serviceOrders, isLoading } = useServiceOrders();
  const generateCronograma = useGenerateCronogramaPdf();

  const contractOrders = useMemo<PmocCronogramaCalendarOrder[]>(() => {
    return (serviceOrders || []).filter(
      (o: ServiceOrder) => o.contract_id === contractId,
    ) as unknown as PmocCronogramaCalendarOrder[];
  }, [serviceOrders, contractId]);

  const handleOSClick = (os: ServiceOrder) => {
    // Em desktop e mobile, redireciona pra rota da OS (mesma de outros contextos).
    if (os.id) navigate(`/os-tecnico/${os.id}`);
  };

  const handlePrintAnnualPdf = async () => {
    try {
      const result = await generateCronograma.mutateAsync({ contract_id: contractId });
      if (result?.pdf_url) {
        window.open(result.pdf_url, '_blank', 'noopener,noreferrer');
      }
    } catch {
      // Toast amigável já é emitido pelo hook (`useGenerateCronogramaPdf`).
    }
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
        <Button
          variant="outline"
          size="sm"
          onClick={handlePrintAnnualPdf}
          disabled={generateCronograma.isPending}
          className="min-h-[40px] shrink-0"
        >
          {generateCronograma.isPending ? (
            <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
          ) : (
            <Printer className="mr-1 h-3.5 w-3.5" />
          )}
          {generateCronograma.isPending ? 'Gerando…' : 'Imprimir PDF Anual'}
        </Button>
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
