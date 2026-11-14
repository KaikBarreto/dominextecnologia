import { useEffect, useState } from "react";
import { format, subDays } from "date-fns";
import {
  BarChart3,
  FileText,
  History,
  Printer,
  RefreshCw,
  WalletCards,
} from "lucide-react";
import { Link } from "react-router-dom";
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
import { Skeleton } from "@/components/ui/skeleton";
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
  type PdvHistoryEventType,
  type PdvProjectionKind,
} from "@/hooks/usePdvReportsV2";
import { PdvCardSettlementsPanel } from "@/components/pdv/reports/PdvCardSettlementsPanel";

type ReportTab = "summary" | "history" | "documents" | "cards";
const PAGE_SIZE = 25;

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
    const text = String(value);
    return /[;"\n]/.test(text) ? `"${text.split('"').join('""')}"` : text;
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

function Pagination({
  offset,
  total,
  onOffset,
}: {
  offset: number;
  total: number;
  onOffset: (value: number) => void;
}) {
  const page = Math.floor(offset / PAGE_SIZE) + 1;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  return (
    <div className="flex flex-col gap-2 border-t pt-3 text-xs sm:flex-row sm:items-center sm:justify-between">
      <span className="text-muted-foreground">
        Mostrando {total === 0 ? 0 : offset + 1}–
        {Math.min(offset + PAGE_SIZE, total)} de {total} itens
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
  const { timezone } = useAppLocaleContext();
  const { money, date } = useLocaleFormatters();
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
  const documentsReport = usePdvDocumentIndex({
    limit: PAGE_SIZE,
    offset: documentOffset,
    enabled: tab === "documents",
  });

  useEffect(() => {
    setProjectionOffset(0);
    setHistoryOffset(0);
  }, [from, to]);
  const historyEntries = historyReport.data?.entries ?? [];

  const tabs = [
    {
      value: "summary",
      label: "Recorte do PDV",
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
        <div className="space-y-2">
          {[1, 2, 3, 4].map((item) => (
            <Skeleton key={item} className="h-16 w-full" />
          ))}
        </div>
      )}

      {!loading && !error && tab === "summary" && projectionReport.data && (
        <section className="space-y-4">
          <NoticeBanner variant="info" title="Recorte do PDV">
            Mostra somente vendas e movimentações do PDV. Não é o DRE nem o DFC
            completo da empresa.
          </NoticeBanner>
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
                  Competência do PDV
                </SelectItem>
                <SelectItem value="dre_cash">Caixa do PDV</SelectItem>
                <SelectItem value="dfc">Fluxo realizado do PDV</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-5">
            {[
              ["Receita", money(projectionReport.data.revenue)],
              [
                "CMV",
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
              <Card key={label}>
                <CardContent className="p-3">
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className="mt-1 break-words text-lg font-bold tabular-nums">
                    {value}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
          <div className="flex justify-end print:hidden">
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                downloadCsv(`recorte-pdv-${from}-${to}.csv`, [
                  ["Data", "Origem", "Receita", "CMV", "Despesa", "Fluxo"],
                  ...projectionReport.data.entries.map((entry) => [
                    entry.eventDate,
                    entry.sourceLabel,
                    entry.revenue,
                    entry.cmv,
                    entry.expense,
                    entry.cashFlow,
                  ]),
                ])
              }
            >
              Exportar CSV
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
              {projectionReport.data.entries.map((entry) => (
                <Card key={entry.eventId}>
                  <CardContent className="space-y-2 p-3">
                    <div className="flex justify-between gap-3">
                      <b>{entry.sourceLabel}</b>
                      <span className="text-xs text-muted-foreground">
                        {date(entry.eventDate)}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <span>
                        Receita <b className="block">{money(entry.revenue)}</b>
                      </span>
                      <span>
                        CMV{" "}
                        <b className="block">
                          {entry.cmv == null
                            ? "Indisponível"
                            : money(entry.cmv)}
                        </b>
                      </span>
                    </div>
                  </CardContent>
                </Card>
              ))}
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
                      <TableHead className="text-right">CMV</TableHead>
                      <TableHead className="text-right">Despesa</TableHead>
                      <TableHead className="text-right">Fluxo</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {projectionReport.data.entries.map((entry) => (
                      <TableRow key={entry.eventId}>
                        <TableCell>{date(entry.eventDate)}</TableCell>
                        <TableCell>{entry.sourceLabel}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {money(entry.revenue)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {entry.cmv == null
                            ? "Indisponível"
                            : money(entry.cmv)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {money(entry.expense)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {money(entry.cashFlow)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
          <Pagination
            offset={projectionOffset}
            total={projectionReport.data.totalCount}
            onOffset={setProjectionOffset}
          />
        </section>
      )}

      {tab === "cards" && <PdvCardSettlementsPanel />}

      {!loading && !error && tab === "history" && historyReport.data && (
        <section className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Lista cronológica completa no período. Caixa, terminal e tipo
            aparecem em cada evento; o responsável fica no Histórico de Caixa.
          </p>
          <div className="flex justify-end print:hidden">
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                downloadCsv(`historico-pdv-${from}-${to}.csv`, [
                  ["Data", "Tipo", "Caixa", "Descrição", "Direção", "Valor"],
                  ...historyEntries.map((entry) => [
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
                ])
              }
            >
              Exportar CSV
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
            <div className="space-y-2">
              {historyEntries.map((entry) => (
                <Card key={`${entry.eventType}-${entry.eventId}`}>
                  <CardContent className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <b>{entry.label}</b>
                      <span className="rounded bg-primary px-2 py-0.5 text-[11px] text-primary-foreground">
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
                          <Link to={entry.deepLink}>Abrir</Link>
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
          <NoticeBanner variant="info">
            Este índice mostra onde abrir o comprovante; dados financeiros e o
            conteúdo do documento não são duplicados aqui.
          </NoticeBanner>
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
