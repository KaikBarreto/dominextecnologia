import { Fragment, useEffect, useState } from "react";
import { format, subDays } from "date-fns";
import {
  ArrowRight,
  BarChart3,
  ChevronDown,
  FileText,
  History,
  Loader2,
  Printer,
  RefreshCw,
  WalletCards,
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { RowActionsMenu } from "@/components/ui/RowActionsMenu";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  DateRangeFilter,
  useDateRangeFilter,
} from "@/components/ui/DateRangeFilter";
import { NoticeBanner } from "@/components/ui/NoticeBanner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PdvPageSkeleton } from "@/components/pdv/loading/PdvPageSkeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { MobilePillTabs } from "@/components/mobile/MobilePillTabs";
import { EmptyState } from "@/components/mobile/EmptyState";
import { useIsMobile } from "@/hooks/use-mobile";
import { useLocaleFormatters } from "@/lib/format/hooks";
import { todayInTz } from "@/lib/timezone";
import { useAppLocaleContext } from "@/contexts/AppLocaleContext";
import {
  usePdvDocumentIndex,
  usePdvGlobalHistory,
  usePdvPartialProjection,
  usePdvProjectionExport,
  usePdvHistoryExport,
  resolvePdvHistoryDeepLink,
  type PdvHistoryEventType,
  type PdvProjectionEntry,
  type PdvProjectionKind,
} from "@/hooks/usePdvReportsV2";
import { usePdvWorkflowSettings } from "@/hooks/usePdvCounterFlow";
import { PdvCardSettlementsPanel } from "@/components/pdv/reports/PdvCardSettlementsPanel";
import { csvCell as safeCsvTextCell } from "@/utils/movimentacoesCsvGenerator";

type ReportTab = "summary" | "history" | "documents" | "cards";
const PAGE_SIZE = 25;

const EVENT_TONES: Record<PdvHistoryEventType, string> = {
  financial_transaction: 'bg-blue-600', cash_session_open: 'bg-violet-600', cash_session_close: 'bg-slate-700',
  delivery: 'bg-emerald-600', return: 'bg-rose-600', reversal: 'bg-orange-600',
};

const EVENT_LABELS: Record<PdvHistoryEventType, string> = {
  financial_transaction: "Financeiro",
  cash_session_open: "Abertura",
  cash_session_close: "Fechamento",
  delivery: "Retirada",
  return: "Devolução",
  reversal: "Compensação",
};

function downloadCsv(name: string, rows: Array<Array<string | number | null>>) {
  const cell = (value: string | number | null) => {
    if (value == null) return "";
    // Valores numéricos continuam números; só texto recebe proteção de fórmula.
    return typeof value === 'number' ? String(value) : safeCsvTextCell(value);
  };
  const content = rows.map((row) => row.map(cell).join(";")).join("\n");
  const url = URL.createObjectURL(
    new Blob([`\uFEFF${content}`], { type: "text/csv;charset=utf-8" }),
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
}

function entryLabel(entry: PdvProjectionEntry, pdvMode: string | undefined): string {
  if (entry.orderNumber == null) return entry.sourceLabel;
  if (pdvMode === "simples") return `Venda ${entry.orderNumber}`;
  if (pdvMode === "balcao") return `Retirada do pedido ${entry.orderNumber}`;
  return `Pedido ${entry.orderNumber}`;
}

function itemsText(count: number) {
  return `${count} ${count === 1 ? "item" : "itens"}`;
}

function Pagination({
  offset,
  total,
  onOffset,
  label = "itens",
}: {
  offset: number;
  total: number;
  onOffset: (value: number) => void;
  label?: string;
}) {
  const page = Math.floor(offset / PAGE_SIZE) + 1;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  return (
    <div className="flex flex-col gap-2 border-t pt-3 text-xs sm:flex-row sm:items-center sm:justify-between">
      <span className="text-muted-foreground">
        Mostrando {total === 0 ? 0 : offset + 1}–
        {Math.min(offset + PAGE_SIZE, total)} de {total} {label}
      </span>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={page <= 1}
          onClick={() => onOffset(Math.max(0, offset - PAGE_SIZE))}
        >
          Anterior
        </Button>
        <span className="tabular-nums">
          {page}/{totalPages}
        </span>
        <Button
          variant="outline"
          size="sm"
          disabled={page >= totalPages}
          onClick={() => onOffset(offset + PAGE_SIZE)}
        >
          Próxima
        </Button>
      </div>
    </div>
  );
}

export function PdvReportsWorkspace() {
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const { timezone } = useAppLocaleContext();
  const { money, date } = useLocaleFormatters();
  const workflow = usePdvWorkflowSettings();
  const pdvMode = workflow.data?.pdvMode;
  const dispatchAvailable = pdvMode === "balcao" && workflow.data?.fulfillmentMode === "dispatch";
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggleExpanded = (id: string) => setExpanded((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const [tab, setTab] = useState<ReportTab>("summary");
  const [projection, setProjection] =
    useState<PdvProjectionKind>("dre_competence");
  const [projectionOffset, setProjectionOffset] = useState(0);
  const [historyOffset, setHistoryOffset] = useState(0);
  const [documentOffset, setDocumentOffset] = useState(0);
  const dateFilter = useDateRangeFilter("last30");
  const today = todayInTz(timezone);
  const from = dateFilter.range.from
    ? format(dateFilter.range.from, "yyyy-MM-dd")
    : format(subDays(new Date(`${today}T12:00:00`), 29), "yyyy-MM-dd");
  const to = dateFilter.range.to
    ? format(dateFilter.range.to, "yyyy-MM-dd")
    : today;

  const projectionReport = usePdvPartialProjection({
    projection,
    from,
    to,
    limit: PAGE_SIZE,
    offset: projectionOffset,
    enabled: tab === "summary",
  });
  const historyReport = usePdvGlobalHistory({
    from,
    to,
    limit: PAGE_SIZE,
    offset: historyOffset,
    enabled: tab === "history",
  });
  const projectionExport = usePdvProjectionExport({ projection, from, to, enabled: tab === 'summary' });
  const historyExport = usePdvHistoryExport({ from, to, enabled: tab === 'history' });
  const documentsReport = usePdvDocumentIndex({
    limit: PAGE_SIZE,
    offset: documentOffset,
    enabled: tab === "documents",
  });

  useEffect(() => {
    setProjectionOffset(0);
    setHistoryOffset(0);
  }, [from, to]);
  useEffect(() => { setExpanded(new Set()); }, [projection, projectionOffset, from, to]);
  const historyEntries = historyReport.data?.entries ?? [];

  const tabs = [
    {
      value: "summary",
      label: "Resumo",
      icon: <BarChart3 className="h-4 w-4" />,
    },
    {
      value: "history",
      label: "Histórico",
      icon: <History className="h-4 w-4" />,
    },
    {
      value: "documents",
      label: "Comprovantes",
      icon: <FileText className="h-4 w-4" />,
    },
    {
      value: "cards",
      label: "Cartões",
      icon: <WalletCards className="h-4 w-4" />,
    },
  ];

  const loading = tab === "cards" ? false :
    tab === "summary"
      ? projectionReport.isLoading
      : tab === "history"
        ? historyReport.isLoading
        : documentsReport.isLoading;
  const error = tab === "cards" ? null :
    tab === "summary"
      ? projectionReport.error
      : tab === "history"
        ? historyReport.error
        : documentsReport.error;
  const refetch =
    tab === "summary"
      ? projectionReport.refetch
      : tab === "history"
        ? historyReport.refetch
        : documentsReport.refetch;

  return (
    <div className="space-y-4">
      <MobilePillTabs
        variant="underline"
        level="screen"
        tabs={tabs}
        activeTab={tab}
        onTabChange={(value) => setTab(value as ReportTab)}
      />

      <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
        {tab === "documents" ? (
          <p className="text-sm text-muted-foreground">
            Índice completo de comprovantes gerados
          </p>
        ) : tab === "cards" ? (
          <p className="text-sm text-muted-foreground">Vendas no cartão aguardando confirmação no banco</p>
        ) : (
          <DateRangeFilter
            value={dateFilter.range}
            preset={dateFilter.preset}
            onPresetChange={dateFilter.setPreset}
            onRangeChange={dateFilter.setRange}
          />
        )}
        {tab !== "cards" && <div className="flex flex-wrap gap-2 print:hidden">
          <Button variant="outline" size="sm" onClick={() => void refetch()}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Atualizar
          </Button>
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer className="mr-2 h-4 w-4" />
            Imprimir / PDF
          </Button>
        </div>}
      </div>

      {error && (
        <NoticeBanner
          variant="destructive"
          action="Tentar novamente"
          onClick={() => void refetch()}
        >
          {error.message}
        </NoticeBanner>
      )}
      {loading && (
        <PdvPageSkeleton variant={tab === 'summary' ? 'reports' : 'table'} label="Carregando relatório do PDV" />
      )}

      {!loading && !error && tab === "summary" && projectionReport.data && (
        <section className="space-y-4">
          <p className="text-sm text-muted-foreground">Vendas e movimentações do PDV neste período. Consulte o DRE e o DFC completos no Financeiro.</p>
          <div className="flex max-w-sm">
            <Select
              value={projection}
              onValueChange={(value) => {
                setProjection(value as PdvProjectionKind);
                setProjectionOffset(0);
              }}
            >
              <SelectTrigger aria-label="Tipo do recorte">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="dre_competence">
                  Vendas registradas
                </SelectItem>
                <SelectItem value="dre_cash">Recebimentos do PDV</SelectItem>
                <SelectItem value="dfc">Movimento de dinheiro</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-5 border-y py-5 lg:grid-cols-5">
            {[
              ["Receita", money(projectionReport.data.revenue)],
              [
                "Custo dos materiais",
                projectionReport.data.cmv == null
                  ? "Indisponível"
                  : money(projectionReport.data.cmv),
              ],
              ["Despesa", money(projectionReport.data.expense)],
              [
                "Resultado",
                projectionReport.data.result == null
                  ? "Indisponível"
                  : money(projectionReport.data.result),
              ],
              ["Fluxo realizado", money(projectionReport.data.cashFlow)],
            ].map(([label, value]) => (
              <Card key={label} className="border-0 bg-transparent shadow-none">
                <CardContent className="p-0">
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className="mt-1 break-words text-2xl font-bold tabular-nums">
                    {value}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
          {projectionExport.error && <p role="alert" className="text-sm text-destructive print:hidden">{projectionExport.error}</p>}
          <div className="flex justify-end print:hidden">
            <Button
              variant="outline"
              size="sm"
              disabled={projectionExport.isPending || !projectionExport.ready}
              onClick={() => void projectionExport.exportEntries((entries) =>
                downloadCsv(`recorte-pdv-${from}-${to}.csv`, [
                  ["Data", "Origem", "Venda", "Item", "Quantidade", "Receita", "Custo dos materiais", "Despesa", "Fluxo"],
                  // Planilha detalhada: uma linha por produto, com o número da venda para reagrupar.
                  ...entries.flatMap((entry) => {
                    const origin = entryLabel(entry, pdvMode);
                    if (entry.details.length === 0) {
                      return [[entry.eventDate, origin, entry.orderNumber, null, null, entry.revenue, entry.cmv, entry.expense, entry.cashFlow]];
                    }
                    return entry.details.map((detail, index) => [
                      entry.eventDate, origin, entry.orderNumber, detail.description, detail.quantity,
                      detail.revenue, detail.cmv,
                      index === 0 ? entry.expense : null,
                      index === 0 ? entry.cashFlow : null,
                    ]);
                  }),
                ]))}
            >
              {projectionExport.isPending && <Loader2 aria-hidden="true" className="mr-2 h-4 w-4 animate-spin" />}
              {projectionExport.isPending ? 'Exportando…' : 'Exportar CSV'}
            </Button>
          </div>
          {projectionReport.data.entries.length === 0 ? (
            <EmptyState
              size="compact"
              icon={<BarChart3 className="h-10 w-10" />}
              title="Nenhum evento no período"
              description="Mude o período para consultar outro recorte."
            />
          ) : isMobile ? (
            <div className="space-y-2">
              {projectionReport.data.entries.map((entry) => {
                const label = entryLabel(entry, pdvMode);
                const canExpand = entry.details.length > 0;
                const open = canExpand && expanded.has(entry.eventId);
                const header = (
                  <>
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <div className="flex justify-between gap-3">
                        <b className="min-w-0 break-words text-left">{label}</b>
                        <span className="shrink-0 text-xs text-muted-foreground">{date(entry.eventDate)}</span>
                      </div>
                      {entry.itemCount > 1 && (
                        <span className="text-left text-xs text-muted-foreground">{itemsText(entry.itemCount)}</span>
                      )}
                      <div className="grid grid-cols-2 gap-2 text-left text-xs">
                        <span>Receita <b className="block">{money(entry.revenue)}</b></span>
                        <span>CMV <b className="block">{entry.cmv == null ? "Indisponível" : money(entry.cmv)}</b></span>
                      </div>
                    </div>
                    {canExpand && <ChevronDown aria-hidden="true" className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />}
                  </>
                );
                return (
                  <Card key={entry.eventId}>
                    <CardContent className="p-0">
                      {canExpand ? (
                        <button
                          type="button"
                          aria-expanded={open}
                          aria-label={`${open ? "Recolher" : "Ver"} itens de ${label}`}
                          onClick={() => toggleExpanded(entry.eventId)}
                          className="flex min-h-[44px] w-full items-center gap-2 p-3"
                        >
                          {header}
                        </button>
                      ) : (
                        <div className="flex items-center gap-2 p-3">{header}</div>
                      )}
                      {open && (
                        <ul className="space-y-2 border-t bg-muted/30 p-3">
                          {entry.details.map((detail, index) => (
                            <li key={index} className="flex justify-between gap-3 text-xs">
                              <span className="min-w-0 break-words">{detail.quantity} x {detail.description}</span>
                              <b className="shrink-0 tabular-nums">{money(detail.revenue)}</b>
                            </li>
                          ))}
                        </ul>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          ) : (
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Data</TableHead>
                      <TableHead>Origem</TableHead>
                      <TableHead className="text-right">Receita</TableHead>
                      <TableHead className="text-right">Custo dos materiais</TableHead>
                      <TableHead className="text-right">Despesa</TableHead>
                      <TableHead className="text-right">Fluxo</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {projectionReport.data.entries.map((entry) => {
                      const label = entryLabel(entry, pdvMode);
                      const canExpand = entry.details.length > 0;
                      const open = canExpand && expanded.has(entry.eventId);
                      return (
                        <Fragment key={entry.eventId}>
                          <TableRow>
                            <TableCell>{date(entry.eventDate)}</TableCell>
                            <TableCell>
                              {canExpand ? (
                                <button
                                  type="button"
                                  aria-expanded={open}
                                  aria-label={`${open ? "Recolher" : "Ver"} itens de ${label}`}
                                  onClick={() => toggleExpanded(entry.eventId)}
                                  className="flex items-center gap-2 text-left hover:underline"
                                >
                                  <ChevronDown aria-hidden="true" className={`h-4 w-4 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
                                  <span>{label}</span>
                                  {entry.itemCount > 1 && <span className="text-xs text-muted-foreground">({itemsText(entry.itemCount)})</span>}
                                </button>
                              ) : (
                                <span>{label}</span>
                              )}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">{money(entry.revenue)}</TableCell>
                            <TableCell className="text-right tabular-nums">
                              {entry.cmv == null ? "Indisponível" : money(entry.cmv)}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">{money(entry.expense)}</TableCell>
                            <TableCell className="text-right tabular-nums">{money(entry.cashFlow)}</TableCell>
                          </TableRow>
                          {open && entry.details.map((detail, index) => (
                            <TableRow key={`${entry.eventId}-${index}`} className="bg-muted/30 text-sm">
                              <TableCell />
                              <TableCell className="pl-10">{detail.quantity} x {detail.description}</TableCell>
                              <TableCell className="text-right tabular-nums">{money(detail.revenue)}</TableCell>
                              <TableCell className="text-right tabular-nums">
                                {detail.cmv == null ? "Indisponível" : money(detail.cmv)}
                              </TableCell>
                              <TableCell />
                              <TableCell />
                            </TableRow>
                          ))}
                        </Fragment>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
          <Pagination
            offset={projectionOffset}
            total={projectionReport.data.totalCount}
            onOffset={setProjectionOffset}
            label="registros"
          />
        </section>
      )}

      {tab === "cards" && <PdvCardSettlementsPanel />}

      {!loading && !error && tab === "history" && historyReport.data && (
        <section className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Movimentações do período, identificadas por caixa e tipo.
          </p>
          {historyExport.error && <p role="alert" className="text-sm text-destructive print:hidden">{historyExport.error}</p>}
          <div className="flex justify-end print:hidden">
            <Button
              variant="outline"
              size="sm"
              disabled={historyExport.isPending || !historyExport.ready}
              onClick={() => void historyExport.exportEntries((entries) =>
                downloadCsv(`historico-pdv-${from}-${to}.csv`, [
                  ["Data", "Tipo", "Caixa", "Descrição", "Direção", "Valor"],
                  ...entries.map((entry) => [
                    entry.eventDate,
                    EVENT_LABELS[entry.eventType],
                    entry.cashSessionLabel,
                    entry.label,
                    entry.direction === "entrada"
                      ? "Entrada"
                      : entry.direction === "saida"
                        ? "Saída"
                        : "",
                    entry.amount,
                  ]),
                ]))}
            >
              {historyExport.isPending && <Loader2 aria-hidden="true" className="mr-2 h-4 w-4 animate-spin" />}
              {historyExport.isPending ? 'Exportando…' : 'Exportar CSV'}
            </Button>
          </div>
          {historyEntries.length === 0 ? (
            <EmptyState
              size="compact"
              icon={<History className="h-10 w-10" />}
              title="Nenhum evento encontrado"
              description="Mude o período, o caixa ou o tipo."
            />
          ) : (
            !isMobile ? <div className="overflow-hidden rounded-lg border bg-card"><Table className="pdv-history-table min-w-[760px]"><TableHeader><TableRow><TableHead>Data</TableHead><TableHead>Tipo</TableHead><TableHead>Caixa</TableHead><TableHead>Descrição</TableHead><TableHead className="text-right">Valor</TableHead><TableHead><span className="sr-only">Ações</span></TableHead></TableRow></TableHeader><TableBody>{historyEntries.map(entry => <TableRow key={`${entry.eventType}-${entry.eventId}`}><TableCell className="whitespace-nowrap">{date(entry.eventDate)}</TableCell><TableCell><span className={`whitespace-nowrap rounded px-2 py-1 text-[11px] font-semibold text-white ${EVENT_TONES[entry.eventType]}`}>{EVENT_LABELS[entry.eventType]}</span></TableCell><TableCell>{entry.cashSessionLabel}</TableCell><TableCell>{entry.label}</TableCell><TableCell className="whitespace-nowrap text-right font-semibold tabular-nums">{entry.amount == null ? 'Valor restrito' : money(entry.amount)}</TableCell><TableCell>{entry.deepLink && <RowActionsMenu triggerVariant="plain" ariaLabel={`Ações de ${entry.label}`} actions={[{ label: 'Abrir', icon: ArrowRight, onClick: () => navigate(resolvePdvHistoryDeepLink(entry.deepLink, dispatchAvailable)) }]} />}</TableCell></TableRow>)}</TableBody></Table></div> : <div className="space-y-2">
              {historyEntries.map((entry) => (
                <Card key={`${entry.eventType}-${entry.eventId}`}>
                  <CardContent className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <b>{entry.label}</b>
                      <span className={`rounded px-2 py-0.5 text-[11px] font-semibold text-white ${EVENT_TONES[entry.eventType]}`}>
                          {EVENT_LABELS[entry.eventType]}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {date(entry.eventDate)} · {entry.cashSessionLabel}
                      </p>
                    </div>
                    <div className="flex items-center justify-between gap-3 sm:justify-end">
                      {entry.amount == null ? (
                        <span className="text-xs text-muted-foreground">
                          Valor restrito
                        </span>
                      ) : (
                        <div className="text-right">
                          <span className="block text-[11px] text-muted-foreground">
                            {entry.direction === "saida"
                              ? "Saída"
                              : entry.direction === "entrada"
                                ? "Entrada"
                                : "Valor"}
                          </span>
                          <b className="tabular-nums">{money(entry.amount)}</b>
                        </div>
                      )}
                      {entry.deepLink && (
                        <Button asChild variant="ghost" size="sm">
                          <Link to={resolvePdvHistoryDeepLink(entry.deepLink, dispatchAvailable)}>Abrir</Link>
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
          <Pagination
            offset={historyOffset}
            total={historyReport.data.totalCount}
            onOffset={setHistoryOffset}
          />
        </section>
      )}

      {!loading && !error && tab === "documents" && documentsReport.data && (
        <section className="space-y-3">
          <p className="text-sm text-muted-foreground">Abra o pedido ou a retirada para consultar o comprovante.</p>
          {documentsReport.data.documents.length === 0 ? (
            <EmptyState
              size="compact"
              icon={<WalletCards className="h-10 w-10" />}
              title="Nenhum comprovante gerado"
              description="Os comprovantes aparecem após a confirmação do pedido ou da retirada."
            />
          ) : (
            <div className="space-y-2">
              {documentsReport.data.documents.map((document) => (
                <Card key={document.id}>
                  <CardContent className="flex items-center gap-3 p-3">
                    <FileText className="h-5 w-5 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">
                        {document.documentType === "delivery_receipt"
                          ? "Comprovante de retirada"
                          : "Comprovante do pedido"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Gerado em {date(document.createdAt)}
                      </p>
                    </div>
                    {document.deepLink && (
                      <Button asChild variant="outline" size="sm">
                        <Link to={document.deepLink}>Abrir</Link>
                      </Button>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
          <Pagination
            offset={documentOffset}
            total={documentsReport.data.totalCount}
            onOffset={setDocumentOffset}
          />
        </section>
      )}
    </div>
  );
}
