import { useEffect, useRef, useState } from "react";
import { Loader2, ShoppingBag, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/mobile/EmptyState";
import { NoticeBanner } from "@/components/ui/NoticeBanner";
import { PdvPageSkeleton } from "@/components/pdv/loading/PdvPageSkeleton";
import { useIsMobile } from "@/hooks/use-mobile";
import { useLocaleFormatters } from "@/lib/format/hooks";
import { SALES_DIMENSION_LABELS, SALES_NAME_HEADER as NAME_HEADER, salesRowLabel } from "@/lib/pdv/salesReport";
import {
  usePdvSalesExport,
  usePdvSalesReport,
  type PdvSalesDimension,
} from "@/hooks/usePdvReportsV2";

const PAGE_SIZE = 25;

function salesText(count: number) {
  return `${count} ${count === 1 ? "venda" : "vendas"}`;
}

export function PdvSalesPanel({
  from,
  to,
  refreshKey = 0,
  excelRequestKey = 0,
  onDownloadExcel,
  onExcelError,
  onDownloadCsv,
  dimensions = ['product', 'customer', 'salesperson', 'hour'],
  initialDimension,
  description = 'O que mais saiu no período, só com vendas. Os valores já descontam as devoluções.',
}: {
  from: string;
  to: string;
  /** Muda quando o usuário toca em Atualizar no topo do relatório. */
  refreshKey?: number;
  /** Muda quando o usuário escolhe Excel no menu global de exportação. */
  excelRequestKey?: number;
  onDownloadExcel?: (
    name: string,
    sheetName: string,
    rows: Array<Array<string | number | null>>,
  ) => Promise<void>;
  onExcelError?: (message: string | null) => void;
  onDownloadCsv: (name: string, rows: Array<Array<string | number | null>>) => void;
  dimensions?: PdvSalesDimension[];
  initialDimension?: PdvSalesDimension;
  description?: string;
}) {
  const isMobile = useIsMobile();
  const { money } = useLocaleFormatters();
  const [dimension, setDimension] = useState<PdvSalesDimension>(initialDimension ?? dimensions[0] ?? 'customer');
  const [offset, setOffset] = useState(0);
  useEffect(() => { setOffset(0); }, [dimension, from, to]);

  const report = usePdvSalesReport({ dimension, from, to, limit: PAGE_SIZE, offset });
  const salesExport = usePdvSalesExport({ dimension, from, to });
  const handledExcelRequest = useRef(0);
  const excelHandlers = useRef({ onDownloadExcel, onExcelError });
  const exportEntries = useRef(salesExport.exportEntries);
  excelHandlers.current = { onDownloadExcel, onExcelError };
  exportEntries.current = salesExport.exportEntries;
  useEffect(() => {
    if (excelRequestKey <= 0 || handledExcelRequest.current === excelRequestKey) return;
    handledExcelRequest.current = excelRequestKey;
    const handlers = excelHandlers.current;
    if (!handlers.onDownloadExcel) return;
    handlers.onExcelError?.(null);
    void exportEntries.current((rows) => {
      void handlers.onDownloadExcel?.(
        `vendas-pdv-${SALES_DIMENSION_LABELS[dimension].toLowerCase()}-${from}-${to}`,
        SALES_DIMENSION_LABELS[dimension],
        [
          [NAME_HEADER[dimension], "Detalhe", "Vendas", "Quantidade", "Receita", "Custo dos materiais", "Margem", "Participação"],
          ...rows.map((row) => [
            salesRowLabel(row, dimension),
            row.detail,
            row.ordersCount,
            row.quantity,
            row.revenue,
            row.cmv,
            row.margin,
            Number((row.share * 100).toFixed(2)),
          ]),
        ],
      ).catch(() => handlers.onExcelError?.("Não foi possível gerar o arquivo Excel. Tente novamente."));
    });
  }, [dimension, excelRequestKey, from, to]);
  const { refetch } = report;
  useEffect(() => { if (refreshKey > 0) void refetch(); }, [refreshKey, refetch]);
  const percent = (share: number) => `${(share * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
  const optionalMoney = (value: number | null) => (value == null ? "Indisponível" : money(value));

  if (report.isLoading) return <PdvPageSkeleton variant="table" label="Carregando vendas do PDV" />;
  if (report.error) {
    return (
      <NoticeBanner variant="destructive" action="Tentar novamente" onClick={() => void report.refetch()}>
        {report.error.message}
      </NoticeBanner>
    );
  }
  if (!report.data) return null;
  const data = report.data;
  // Rótulos e colunas seguem a dimensão que o servidor devolveu, não o seletor:
  // na troca de opção os dois podem divergir por um instante.
  const shown = data.dimension;
  const showQuantity = shown === "product";
  const page = Math.floor(offset / PAGE_SIZE) + 1;
  const totalPages = Math.max(1, Math.ceil(data.totalCount / PAGE_SIZE));
  const revenueLeader = data.rows.reduce<(typeof data.rows)[number] | null>(
    (leader, row) => (!leader || row.revenue > leader.revenue ? row : leader),
    null,
  );
  const topRows = [...data.rows]
    .sort((left, right) => right.revenue - left.revenue)
    .slice(0, 3);
  const topRowsShare = Math.min(1, topRows.reduce((total, row) => total + row.share, 0));
  const topRowsCount = topRows.length;
  const averagePerSale = data.totals.ordersCount > 0
    ? data.totals.revenue / data.totals.ordersCount
    : 0;
  const marginRate = data.totals.margin == null || data.totals.revenue === 0
    ? null
    : data.totals.margin / data.totals.revenue;
  const concentrationLabel = shown === 'hour' ? 'Horário de pico' : 'Concentração de receita';

  return (
    <section className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {description}
      </p>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        {dimensions.length > 1 && <div className="flex max-w-xs flex-1">
          <Select value={dimension} onValueChange={(value) => setDimension(value as PdvSalesDimension)}>
            <SelectTrigger aria-label="Ver vendas por">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {dimensions.map((value) => (
                <SelectItem key={value} value={value}>{`Por ${SALES_DIMENSION_LABELS[value].toLowerCase()}`}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>}
        <div className="flex justify-end print:hidden">
          <Button
            variant="outline"
            size="sm"
            disabled={salesExport.isPending || !salesExport.ready}
            onClick={() => void salesExport.exportEntries((rows) =>
              onDownloadCsv(`vendas-pdv-${SALES_DIMENSION_LABELS[dimension].toLowerCase()}-${from}-${to}.csv`, [
                [NAME_HEADER[dimension], "Detalhe", "Vendas", "Quantidade", "Receita", "Custo dos materiais", "Margem", "Participação"],
                ...rows.map((row) => [
                  salesRowLabel(row, dimension), row.detail, row.ordersCount, row.quantity,
                  row.revenue, row.cmv, row.margin, Number((row.share * 100).toFixed(2)),
                ]),
              ]))}
          >
            {salesExport.isPending && <Loader2 aria-hidden="true" className="mr-2 h-4 w-4 animate-spin" />}
            {salesExport.isPending ? "Exportando…" : "Exportar CSV"}
          </Button>
        </div>
      </div>
      {salesExport.error && <p role="alert" className="text-sm text-destructive print:hidden">{salesExport.error}</p>}

      <div className="grid grid-cols-2 gap-5 border-y py-5 lg:grid-cols-4">
        {[
          ["Vendas", String(data.totals.ordersCount)],
          ["Receita", money(data.totals.revenue)],
          ["Custo dos materiais", optionalMoney(data.totals.cmv)],
          ["Margem", optionalMoney(data.totals.margin)],
        ].map(([label, value]) => (
          <div key={label}>
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="mt-1 break-words text-2xl font-bold tabular-nums">{value}</p>
          </div>
        ))}
      </div>

      {data.rows.length > 0 && offset === 0 && (
        <div className="space-y-3 rounded-xl bg-muted/45 p-4 sm:p-5">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-muted-foreground" />
            <div>
              <h3 className="text-sm font-semibold">Leitura do período</h3>
              <p className="text-xs text-muted-foreground">Destaques para decidir onde investigar primeiro.</p>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">Maior receita</p>
              <p className="mt-1 break-words font-semibold">{revenueLeader ? salesRowLabel(revenueLeader, shown) : 'Sem destaque'}</p>
              {revenueLeader && <p className="text-xs text-muted-foreground tabular-nums">{money(revenueLeader.revenue)} · {percent(revenueLeader.share)} do total</p>}
            </div>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">{concentrationLabel}</p>
              {shown === 'hour' ? (
                <>
                  <p className="mt-1 break-words font-semibold">{revenueLeader ? salesRowLabel(revenueLeader, shown) : 'Sem destaque'}</p>
                  {revenueLeader && <p className="text-xs text-muted-foreground tabular-nums">{percent(revenueLeader.share)} da receita</p>}
                </>
              ) : (
                <>
                  <p className="mt-1 font-semibold tabular-nums">{percent(topRowsShare)}</p>
                  <p className="text-xs text-muted-foreground">da receita está concentrada {topRowsCount === 1 ? 'no primeiro registro' : `nos ${topRowsCount} primeiros`}</p>
                </>
              )}
            </div>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">Eficiência comercial</p>
              <p className="mt-1 break-words font-semibold tabular-nums">{money(averagePerSale)} por venda</p>
              <p className="text-xs text-muted-foreground">
                {marginRate == null ? 'Margem percentual indisponível' : `${percent(marginRate)} de margem no período`}
              </p>
            </div>
          </div>
        </div>
      )}

      {data.rows.length === 0 ? (
        <EmptyState
          size="compact"
          icon={<ShoppingBag className="h-10 w-10" />}
          title="Nenhuma venda no período"
          description="Mude o período para ver outras vendas."
        />
      ) : (
        <div className="space-y-3">
          <div>
            <h3 className="text-sm font-semibold">Detalhamento do ranking</h3>
            <p className="text-xs text-muted-foreground">Compare participação, receita e margem de cada registro.</p>
          </div>
          {isMobile ? (
        <div className="space-y-2">
          {data.rows.map((row, index) => (
            <Card key={`${row.key ?? "sem"}-${index}`}>
              <CardContent className="space-y-2 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="break-words font-semibold">
                      <span className="mr-1 text-muted-foreground tabular-nums">{offset + index + 1}.</span>
                      {salesRowLabel(row, shown)}
                    </p>
                    {row.detail && <p className="text-xs text-muted-foreground">{row.detail}</p>}
                  </div>
                  <b className="shrink-0 tabular-nums">{money(row.revenue)}</b>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted" aria-hidden="true">
                  <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, row.share * 100)}%` }} />
                </div>
                <p className="text-xs text-muted-foreground">
                  {salesText(row.ordersCount)}
                  {showQuantity && ` · ${row.quantity.toLocaleString("pt-BR")} un`}
                  {` · ${percent(row.share)} da receita · margem ${optionalMoney(row.margin)}`}
                </p>
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
                  <TableHead className="w-12">#</TableHead>
                  <TableHead>{NAME_HEADER[shown]}</TableHead>
                  <TableHead className="text-right">Vendas</TableHead>
                  {showQuantity && <TableHead className="text-right">Quantidade</TableHead>}
                  <TableHead className="text-right">Receita</TableHead>
                  <TableHead className="w-40">Participação</TableHead>
                  <TableHead className="text-right">Custo dos materiais</TableHead>
                  <TableHead className="text-right">Margem</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.rows.map((row, index) => (
                  <TableRow key={`${row.key ?? "sem"}-${index}`}>
                    <TableCell className="tabular-nums text-muted-foreground">{offset + index + 1}</TableCell>
                    <TableCell>
                      <span className="font-medium">{salesRowLabel(row, shown)}</span>
                      {row.detail && <span className="block text-xs text-muted-foreground">{row.detail}</span>}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{row.ordersCount}</TableCell>
                    {showQuantity && <TableCell className="text-right tabular-nums">{row.quantity.toLocaleString("pt-BR")}</TableCell>}
                    <TableCell className="text-right font-semibold tabular-nums">{money(row.revenue)}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                          <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, row.share * 100)}%` }} />
                        </div>
                        <span className="w-12 text-right text-xs tabular-nums">{percent(row.share)}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{optionalMoney(row.cmv)}</TableCell>
                    <TableCell className="text-right tabular-nums">{optionalMoney(row.margin)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
          )}
        </div>
      )}

      <div className="flex flex-col gap-2 border-t pt-3 text-xs sm:flex-row sm:items-center sm:justify-between">
        <span className="text-muted-foreground">
          Mostrando {data.totalCount === 0 ? 0 : offset + 1} a {Math.min(offset + PAGE_SIZE, data.totalCount)} de {data.totalCount} registros
        </span>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}>Anterior</Button>
          <span className="tabular-nums">{page}/{totalPages}</span>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setOffset(offset + PAGE_SIZE)}>Próxima</Button>
        </div>
      </div>
    </section>
  );
}
