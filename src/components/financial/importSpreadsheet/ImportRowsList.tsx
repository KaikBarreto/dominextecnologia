import { useMemo, useState } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { ArrowDownCircle, ArrowUpCircle, AlertTriangle } from 'lucide-react';
import { formatMoney } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';
import type { LocaleCode } from '@/lib/i18n/locales';
import { MESSAGES } from '@/lib/i18n/messages';
import type { FinancialImportPreviewRow, FinancialImportRowOverride } from '@/hooks/useFinancialImport';
import type { FinancialCategory } from '@/hooks/useFinancialCategories';
import type { FinancialAccount } from '@/hooks/useFinancialAccounts';
import type { CostCenter } from '@/hooks/useCostCenters';
import { PAYMENT_METHOD_CODES } from '@/lib/finance-payment-methods';
import { ImportRowStatusBadge } from './ImportRowStatusBadge';

const PAGE_SIZE = 50;

/**
 * `2026-10-18` → `18/10/2026`. Nunca `new Date(iso)` (UTC voltaria um dia).
 *
 * Usado também pra segunda linha da célula de data, o VENCIMENTO, que só
 * aparece em linha NÃO paga com vencimento resolvido — é o único caso em que
 * `due_date` tem efeito (o servidor devolve NULL em linha paga). Vai junto da
 * data em vez de virar coluna própria porque a tabela já tem 7 colunas e o CEO
 * não aceita tabela apertada; o dado precisa estar VISÍVEL na conferência de
 * todo jeito, senão o cliente grava um vencimento que nunca viu.
 */
function formatDateBR(iso: string | null): string {
  if (!iso) return '';
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return iso;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

function rowNeedsAttention(row: FinancialImportPreviewRow, clientIssues: string[] = []): boolean {
  return row.status !== 'ready' || row.issues.length > 0 || clientIssues.length > 0;
}

interface ImportRowsListProps {
  rows: FinancialImportPreviewRow[];
  selected: Record<number, boolean>;
  onToggleSelected: (rowNumber: number, value: boolean) => void;
  overrides: Record<number, FinancialImportRowOverride>;
  onOverrideChange: (rowNumber: number, patch: FinancialImportRowOverride) => void;
  categories: FinancialCategory[];
  accounts: FinancialAccount[];
  costCenters: CostCenter[];
  /**
   * Problemas que o PARSER do navegador achou, por número de linha.
   *
   * ⚠️ Esta tela desenha o que o SERVIDOR devolve. Todo problema que o parser
   * achou e o servidor não consegue redescobrir — porque o parser já zerou o
   * campo antes de enviar — simplesmente DESAPARECIA. Provado em 18/10/2026
   * com uma planilha de QA: a célula de vencimento escrita "mes que vem" saía
   * como "Pronta, vence 15/10/2026" (a data do lançamento, via fallback do
   * servidor), sem uma palavra sobre o texto ilegível. O sistema inventava uma
   * data em silêncio. Vale pro vencimento E pra data de pagamento.
   *
   * Regra: quem achou o problema mostra o problema. Linha com problema de
   * parser também NÃO vem marcada por padrão — o cliente tem que escolher.
   */
  clientIssues: Record<number, string[]>;
  locale: LocaleCode;
  currency: string;
}

/**
 * Tabela de conferência (desktop) / lista de cards (mobile ‒ mesmos selos).
 * Pagina em lotes de 50 — planilha de até 5.000 linhas renderizada de uma vez
 * congela a aba.
 */
export function ImportRowsList({
  rows,
  selected,
  onToggleSelected,
  overrides,
  onOverrideChange,
  categories,
  accounts,
  costCenters,
  clientIssues,
  locale,
  currency,
}: ImportRowsListProps) {
  const t = MESSAGES[locale].app.finance.spreadsheetImport;
  const isMobile = useIsMobile();
  const fmt = (v: number) => formatMoney(v, currency, locale);

  const [attentionOnly, setAttentionOnly] = useState(false);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const filtered = useMemo(
    () => (attentionOnly ? rows.filter((r) => rowNeedsAttention(r, clientIssues[r.row_number])) : rows),
    // `clientIssues` É dependência. Em 18/10/2026 um `useMemo` com deps
    // incompletas deixou o botão "Desfazer" da conciliação travado em produção
    // por um dia — o memo nunca recomputava porque a dep que mudava não estava
    // na lista. Não repetir.
    [rows, attentionOnly, clientIssues],
  );
  const visibleRows = filtered.slice(0, visibleCount);

  const activeCategories = useMemo(() => categories.filter((c) => c.is_active), [categories]);
  const activeAccounts = useMemo(
    () => accounts.filter((a) => a.is_active && a.type !== 'cartao'),
    [accounts],
  );
  const activeCostCenters = useMemo(() => costCenters.filter((c) => c.is_active), [costCenters]);

  const paymentMethodLabels = t.paymentMethods as Record<string, string>;

  const renderCategorySelect = (row: FinancialImportPreviewRow) => {
    const value = overrides[row.row_number]?.category_id ?? (row.category_status === 'ok' ? row.category_id ?? '' : '');
    return (
      <Select
        value={value || undefined}
        onValueChange={(v) => onOverrideChange(row.row_number, { category_id: v })}
      >
        <SelectTrigger className="h-8 text-xs">
          <SelectValue placeholder={t.resolveFieldPlaceholder} />
        </SelectTrigger>
        <SelectContent>
          {activeCategories.length === 0 ? (
            <div className="px-2 py-1.5 text-xs text-muted-foreground">{t.noOptionsAvailable}</div>
          ) : (
            activeCategories.map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
            ))
          )}
        </SelectContent>
      </Select>
    );
  };

  const renderAccountSelect = (row: FinancialImportPreviewRow) => {
    const value = overrides[row.row_number]?.account_id ?? (row.account_status === 'ok' ? row.account_id ?? '' : '');
    return (
      <Select
        value={value || undefined}
        onValueChange={(v) => onOverrideChange(row.row_number, { account_id: v })}
      >
        <SelectTrigger className="h-8 text-xs">
          <SelectValue placeholder={t.resolveFieldPlaceholder} />
        </SelectTrigger>
        <SelectContent>
          {activeAccounts.length === 0 ? (
            <div className="px-2 py-1.5 text-xs text-muted-foreground">{t.noOptionsAvailable}</div>
          ) : (
            activeAccounts.map((a) => (
              <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
            ))
          )}
        </SelectContent>
      </Select>
    );
  };

  const renderCostCenterSelect = (row: FinancialImportPreviewRow) => {
    const value = overrides[row.row_number]?.cost_center_id ?? (row.cost_center_status === 'ok' ? row.cost_center_id ?? '' : '');
    return (
      <Select
        value={value || undefined}
        onValueChange={(v) => onOverrideChange(row.row_number, { cost_center_id: v })}
      >
        <SelectTrigger className="h-8 text-xs">
          <SelectValue placeholder={t.resolveFieldPlaceholder} />
        </SelectTrigger>
        <SelectContent>
          {activeCostCenters.length === 0 ? (
            <div className="px-2 py-1.5 text-xs text-muted-foreground">{t.noOptionsAvailable}</div>
          ) : (
            activeCostCenters.map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
            ))
          )}
        </SelectContent>
      </Select>
    );
  };

  const renderPaymentMethodSelect = (row: FinancialImportPreviewRow) => {
    const value = overrides[row.row_number]?.payment_method ?? (row.payment_method_status === 'ok' ? row.payment_method ?? '' : '');
    return (
      <Select
        value={value || undefined}
        onValueChange={(v) => onOverrideChange(row.row_number, { payment_method: v })}
      >
        <SelectTrigger className="h-8 text-xs">
          <SelectValue placeholder={t.resolveFieldPlaceholder} />
        </SelectTrigger>
        <SelectContent>
          {PAYMENT_METHOD_CODES.map((code) => (
            <SelectItem key={code} value={code}>{paymentMethodLabels[code] ?? code}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  };

  /**
   * Issues de erro (bloqueiam) separadas das de aviso (não bloqueiam, ex:
   * contraparte) — e, por último, os problemas achados pelo PARSER, que o
   * servidor não tem como ver (ver `clientIssues` nas props).
   */
  const rowIssueMessages = (row: FinancialImportPreviewRow) => {
    const errors = row.issues.filter((i) => i.severity === 'error');
    const warnings = row.issues.filter((i) => i.severity === 'warning');
    const doParser = clientIssues[row.row_number] ?? [];
    return { errors, warnings, doParser };
  };

  const header = (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex items-center gap-2">
        <Switch id="attention-only" checked={attentionOnly} onCheckedChange={setAttentionOnly} />
        <label htmlFor="attention-only" className="text-sm cursor-pointer">
          {t.filter.attentionOnly}
        </label>
      </div>
      <p className="text-xs text-muted-foreground tabular-nums">
        {t.showingCount.replace('{shown}', String(visibleRows.length)).replace('{total}', String(filtered.length))}
      </p>
    </div>
  );

  const loadMoreButton = visibleCount < filtered.length ? (
    <div className="flex justify-center py-2">
      <Button variant="outline" size="sm" onClick={() => setVisibleCount((v) => v + PAGE_SIZE)}>
        {t.loadMore}
      </Button>
    </div>
  ) : null;

  if (isMobile) {
    return (
      <div className="space-y-3">
        {header}
        <div className="space-y-2">
          {visibleRows.map((row) => {
            const { errors, warnings, doParser } = rowIssueMessages(row);
            const isChecked = !!selected[row.row_number];
            return (
              <div
                key={row.row_number}
                className={cn(
                  'rounded-lg border p-3 space-y-2',
                  row.status === 'blocked' && 'border-destructive/40 bg-destructive/5',
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2 min-w-0">
                    <Checkbox
                      checked={isChecked}
                      onCheckedChange={(v) => onToggleSelected(row.row_number, v === true)}
                      disabled={row.status === 'blocked'}
                      className="mt-0.5"
                    />
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{row.description}</p>
                      <p className="text-xs text-muted-foreground tabular-nums">
                        {formatDateBR(row.date)}
                        {!row.is_paid && row.due_date && (
                          <span className="ml-1.5">
                            · {t.dueDateLine.replace('{date}', formatDateBR(row.due_date))}
                          </span>
                        )}
                      </p>
                    </div>
                  </div>
                  <ImportRowStatusBadge status={row.status} locale={locale} />
                </div>

                <div className="flex items-center gap-1.5 text-sm font-semibold tabular-nums">
                  {row.transaction_type === 'entrada' ? (
                    <ArrowUpCircle className="h-3.5 w-3.5 text-success shrink-0" />
                  ) : (
                    <ArrowDownCircle className="h-3.5 w-3.5 text-destructive shrink-0" />
                  )}
                  {fmt(row.amount)}
                </div>

                {row.category_status !== 'ok' && (
                  <div className="space-y-1">
                    <p className="text-[11px] text-muted-foreground">{t.table.category}</p>
                    {renderCategorySelect(row)}
                  </div>
                )}
                {row.account_status !== 'ok' && (
                  <div className="space-y-1">
                    <p className="text-[11px] text-muted-foreground">{t.table.account}</p>
                    {renderAccountSelect(row)}
                  </div>
                )}
                {row.cost_center_status !== 'ok' && row.cost_center_input && (
                  <div className="space-y-1">
                    <p className="text-[11px] text-muted-foreground">{t.table.costCenter}</p>
                    {renderCostCenterSelect(row)}
                  </div>
                )}
                {row.payment_method_status !== 'ok' && row.payment_method_input && (
                  <div className="space-y-1">
                    <p className="text-[11px] text-muted-foreground">{t.table.paymentMethod}</p>
                    {renderPaymentMethodSelect(row)}
                  </div>
                )}

                {doParser.map((mensagem, i) => (
                  <p key={`p${i}`} className="flex items-start gap-1.5 text-xs text-warning">
                    <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5" />
                    {mensagem}
                  </p>
                ))}
                {errors.map((issue, i) => (
                  <p key={i} className="flex items-start gap-1.5 text-xs text-destructive">
                    <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5" />
                    {issue.message}
                  </p>
                ))}
                {warnings.map((issue, i) => (
                  <p key={i} className="flex items-start gap-1.5 text-xs text-warning">
                    <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5" />
                    {issue.message}
                  </p>
                ))}
                {row.status === 'duplicate' && (
                  <p className="text-xs text-muted-foreground">{t.duplicateReason}</p>
                )}
              </div>
            );
          })}
        </div>
        {loadMoreButton}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {header}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">{t.table.select}</TableHead>
              <TableHead>{t.table.date}</TableHead>
              <TableHead>{t.table.description}</TableHead>
              <TableHead className="text-right">{t.table.amount}</TableHead>
              <TableHead>{t.table.category}</TableHead>
              <TableHead>{t.table.account}</TableHead>
              <TableHead>{t.table.status}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibleRows.map((row) => {
              const { errors, warnings, doParser } = rowIssueMessages(row);
              const isChecked = !!selected[row.row_number];
              return (
                <TableRow key={row.row_number} className={cn(row.status === 'blocked' && 'bg-destructive/5')}>
                  <TableCell>
                    <Checkbox
                      checked={isChecked}
                      onCheckedChange={(v) => onToggleSelected(row.row_number, v === true)}
                      disabled={row.status === 'blocked'}
                    />
                  </TableCell>
                  <TableCell className="tabular-nums whitespace-nowrap">
                    {formatDateBR(row.date)}
                    {!row.is_paid && row.due_date && (
                      <p className="text-xs text-muted-foreground">
                        {t.dueDateLine.replace('{date}', formatDateBR(row.due_date))}
                      </p>
                    )}
                  </TableCell>
                  <TableCell className="max-w-[220px]">
                    <p className="truncate">{row.description}</p>
                    {errors.map((issue, i) => (
                      <p key={i} className="flex items-start gap-1 text-xs text-destructive mt-0.5">
                        <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5" />
                        {issue.message}
                      </p>
                    ))}
                    {warnings.map((issue, i) => (
                      <p key={i} className="flex items-start gap-1 text-xs text-warning mt-0.5">
                        <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5" />
                        {issue.message}
                      </p>
                    ))}
                    {doParser.map((mensagem, i) => (
                      <p key={`p${i}`} className="flex items-start gap-1 text-xs text-warning mt-0.5">
                        <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5" />
                        {mensagem}
                      </p>
                    ))}
                    {row.status === 'duplicate' && (
                      <p className="text-xs text-muted-foreground mt-0.5">{t.duplicateReason}</p>
                    )}
                  </TableCell>
                  <TableCell className={cn('text-right tabular-nums font-medium whitespace-nowrap', row.transaction_type === 'entrada' ? 'text-success' : 'text-destructive')}>
                    {fmt(row.amount)}
                  </TableCell>
                  <TableCell className="min-w-[160px]">
                    {row.category_status === 'ok' ? row.category_name : renderCategorySelect(row)}
                  </TableCell>
                  <TableCell className="min-w-[160px]">
                    {row.account_status === 'ok' ? row.account_name : renderAccountSelect(row)}
                  </TableCell>
                  <TableCell>
                    <ImportRowStatusBadge status={row.status} locale={locale} />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      {loadMoreButton}
    </div>
  );
}
