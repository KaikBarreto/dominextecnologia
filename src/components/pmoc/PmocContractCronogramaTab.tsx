import { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Loader2, Printer, RefreshCw } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

import {
  PmocCronogramaCalendar,
  type PmocCronogramaCalendarOrder,
} from './PmocCronogramaCalendar';
import { ScheduleDetailPanel } from '@/components/schedule/ScheduleDetailPanel';
import { useServiceOrders } from '@/hooks/useServiceOrders';
import { useGenerateCronogramaPdf } from '@/hooks/useGeneratePmocDocument';
import { useGenerateRetroactiveContractOSs } from '@/hooks/useGenerateRetroactiveContractOSs';
import { useIsMobile } from '@/hooks/use-mobile';
import type { ServiceOrder } from '@/types/database';

/**
 * Aba "Cronograma" do contrato PMOC (Onda C — v1.9.x).
 *
 * Renderiza o calendar reaproveitado da /agenda, filtrado pelo `contract_id`.
 * Não há criação/edição de OS aqui — gestor que quiser mexer numa OS clica
 * e cai no detalhe.
 *
 * v1.9.20 — drill-in lateral (desktop): clicar num dia abre painel lateral
 * com as OSs daquele dia (mesma UX da /agenda). Click numa OS no painel
 * mostra resumo + ações. No mobile, mantemos o redirect direto pra rota da
 * OS pra preservar o fluxo mobile-first existente (drill duplo seria denso
 * demais numa tela já apertada).
 *
 * v1.9.20 — cores semânticas: verde (concluída), laranja (pendente futura),
 * vermelho (atrasada) — token semântico via `pmocStatusColors`.
 *
 * Onda G — bugfix: "Imprimir PDF Anual" agora chama diretamente a mutation de
 * geração do cronograma e abre o PDF resultante em nova aba. Antes, o botão
 * só navegava de volta pra aba Documentos, frustrando o gestor.
 *
 * Plano: docs/planos/2026-05-23-pmoc-onda-C-dossie-cronograma.md §4.7 / §5.3 (passo 7)
 *        docs/planos/2026-05-24-pmoc-os-bug-cronograma.md §Item 3-4
 */

export interface PmocContractCronogramaTabProps {
  contractId: string;
}

export function PmocContractCronogramaTab({
  contractId,
}: PmocContractCronogramaTabProps) {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { serviceOrders, isLoading } = useServiceOrders();
  const generateCronograma = useGenerateCronogramaPdf();
  const generateRetroactive = useGenerateRetroactiveContractOSs();

  // Estado do drill-in (desktop): qual dia está em foco e qual OS está aberta.
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [selectedOrder, setSelectedOrder] = useState<
    (ServiceOrder & { customer: any; equipment: any }) | null
  >(null);

  const contractOrders = useMemo<PmocCronogramaCalendarOrder[]>(() => {
    return (serviceOrders || []).filter(
      (o: ServiceOrder) => o.contract_id === contractId,
    ) as unknown as PmocCronogramaCalendarOrder[];
  }, [serviceOrders, contractId]);

  // Quando o contrato (PMOC ou comum) não tem nenhuma OS vinculada, oferecemos
  // gerar retroativamente. Caso típico: contrato PMOC criado antes da v1.9.12,
  // quando a geração ainda dependia do cron desabilitado. Continua valendo
  // pós-v1.9.20 como ferramenta de recuperação pra contratos órfãos.
  const hasNoOrders = !isLoading && contractOrders.length === 0;

  const handleGenerateRetroactive = () => {
    generateRetroactive.mutate(contractId);
  };

  // Click numa OS:
  // - Mobile: redireciona pra rota da OS (UX existente, não regride).
  // - Desktop: abre no painel lateral (mantém contexto do contrato).
  const handleOSClick = useCallback(
    (os: ServiceOrder) => {
      if (isMobile) {
        if (os.id) navigate(`/os-tecnico/${os.id}`);
        return;
      }
      setSelectedOrder(os as ServiceOrder & { customer: any; equipment: any });
    },
    [isMobile, navigate],
  );

  // Click num dia (vazio ou com OSs) — só usado no desktop pro drill-in.
  // No mobile não tem painel, então o handler é no-op (o calendário ainda
  // atualiza o `currentDate` internamente pra navegação).
  const handleDayClick = useCallback(
    (date: Date) => {
      if (isMobile) return;
      setSelectedDate(date);
      setSelectedOrder(null);
    },
    [isMobile],
  );

  const handleClearSelection = useCallback(() => {
    setSelectedOrder(null);
  }, []);

  const handleOpenFullOs = useCallback(() => {
    if (selectedOrder?.id) navigate(`/os-tecnico/${selectedOrder.id}`);
  }, [navigate, selectedOrder]);

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
          <>
            {hasNoOrders && (
              <Alert className="mb-4">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Nenhuma OS encontrada para este contrato</AlertTitle>
                <AlertDescription className="space-y-3">
                  <p>
                    Este contrato não tem ordens de serviço geradas. Você pode
                    gerar agora todo o cronograma de uma vez — datas, técnico
                    responsável e equipamentos do contrato serão respeitados.
                  </p>
                  <Button
                    onClick={handleGenerateRetroactive}
                    disabled={generateRetroactive.isPending}
                    size="sm"
                    className="min-h-[40px]"
                  >
                    {generateRetroactive.isPending ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <RefreshCw className="mr-2 h-4 w-4" />
                    )}
                    {generateRetroactive.isPending
                      ? 'Gerando OSs…'
                      : 'Gerar OSs deste contrato agora'}
                  </Button>
                </AlertDescription>
              </Alert>
            )}

            {/* Layout: mobile = só calendário; desktop = calendário + painel
                lateral (drill-in). lg = ponto de virada mesmo padrão da
                Schedule.tsx. */}
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
              <div className="flex-1 min-w-0">
                <PmocCronogramaCalendar
                  serviceOrders={contractOrders}
                  view={undefined /* deixa o gestor alternar */}
                  onOSClick={handleOSClick}
                  onDayClick={handleDayClick}
                  selectedDate={isMobile ? undefined : selectedDate}
                  pmocStatusColors
                  showControls
                />
              </div>

              {!isMobile && (
                <div className="w-full lg:w-80 lg:shrink-0 min-h-[420px] lg:min-h-[520px]">
                  <ScheduleDetailPanel
                    selectedDate={selectedDate}
                    orders={contractOrders as unknown as (ServiceOrder & { customer: any; equipment: any })[]}
                    selectedOrder={selectedOrder}
                    onOrderSelect={(o) => setSelectedOrder(o)}
                    onClearSelection={handleClearSelection}
                    // Não passamos onEdit / onDelete / onFinalize etc. —
                    // a aba Cronograma é visualização, não gestão de OS.
                    // O usuário usa o botão "Preencher OS / Relatório de
                    // Serviço" embutido no panel pra ir pra rota completa.
                  />
                  {selectedOrder?.id && (
                    <Button
                      variant="link"
                      size="sm"
                      className="mt-2 h-auto p-0 text-xs text-muted-foreground"
                      onClick={handleOpenFullOs}
                    >
                      Abrir OS em tela cheia
                    </Button>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
