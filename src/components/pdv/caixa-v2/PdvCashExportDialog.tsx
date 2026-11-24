import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, FileSpreadsheet, FileText, Loader2 } from 'lucide-react';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { DateField } from '@/components/ui/date-field';
import { Label } from '@/components/ui/label';
import { LabeledSwitch } from '@/components/ui/labeled-switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  fetchPdvCashPeriodExport,
  fetchPdvCashSessionExport,
  usePdvCashExportCompanyName,
} from '@/hooks/usePdvCashExport';
import { useToast } from '@/hooks/use-toast';
import { useLocaleFormatters } from '@/lib/format/hooks';
import { dateInTz, todayInTz } from '@/lib/timezone';
import { cn } from '@/lib/utils';
import {
  ALL_CASH_EXPORT_GROUPS,
  countCashExportMovements,
  filterCashExportPayload,
} from '@/lib/pdv/cashExport/filters';
import {
  CASH_EXPORT_GROUPS,
  CASH_EXPORT_PAYMENT_OPTIONS,
  cashExportPaymentLabel,
} from '@/lib/pdv/cashExport/labels';
import {
  CASH_EXPORT_MAX_DAYS,
  CASH_EXPORT_PERIOD_PRESETS,
  resolveCashExportPeriod,
  validateCashExportPeriod,
  type CashExportPeriodPreset,
} from '@/lib/pdv/cashExport/period';
import { describeCashExportFilters, describeCashExportPeriod } from '@/lib/pdv/cashExport/describe';
import { buildCashExportFilename } from '@/lib/pdv/cashExport/filename';
import type { CashExportDocumentOptions } from '@/lib/pdv/cashExport/excel';
import type { CashExportFilters, CashExportMovementGroup, CashExportPayload } from '@/lib/pdv/cashExport/types';

export interface PdvCashExportSessionTarget {
  id: string;
  terminalName: string;
  operatorName: string;
  closedAt: string | null;
}

interface PdvCashExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** `session` exporta o caixa informado em `session`; `period` exporta vários caixas fechados. */
  mode: 'session' | 'period';
  session?: PdvCashExportSessionTarget | null;
  terminals?: { id: string; name: string }[];
  operators?: [string, string][];
  /** Só quem pode ver caixa de outro operador escolhe o operador. */
  canManageOthers?: boolean;
  initialTerminalId?: string | null;
  initialOperatorId?: string | null;
}

type ExportFormat = 'pdf' | 'excel';

const ALL = '__all__';
const sectionLabel = 'text-[13px] font-semibold uppercase tracking-widest text-foreground/85';

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

export function PdvCashExportDialog({
  open,
  onOpenChange,
  mode,
  session = null,
  terminals = [],
  operators = [],
  canManageOthers = false,
  initialTerminalId = null,
  initialOperatorId = null,
}: PdvCashExportDialogProps) {
  const { toast } = useToast();
  const { money, dateTime, timezone } = useLocaleFormatters();
  const companyName = usePdvCashExportCompanyName(open);

  const [format, setFormat] = useState<ExportFormat>('pdf');
  const [preset, setPreset] = useState<CashExportPeriodPreset>('this_month');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [terminalId, setTerminalId] = useState<string>(ALL);
  const [operatorId, setOperatorId] = useState<string>(ALL);
  const [groups, setGroups] = useState<CashExportMovementGroup[]>(ALL_CASH_EXPORT_GROUPS);
  const [methods, setMethods] = useState<string[]>([...CASH_EXPORT_PAYMENT_OPTIONS]);
  const [includeCancelled, setIncludeCancelled] = useState(false);
  const [includeItems, setIncludeItems] = useState(true);
  const [busy, setBusy] = useState(false);
  const [emptyNotice, setEmptyNotice] = useState(false);

  useEffect(() => {
    if (!open) return;
    setFormat('pdf');
    setPreset('this_month');
    setCustomFrom('');
    setCustomTo('');
    setTerminalId(initialTerminalId ?? ALL);
    setOperatorId(initialOperatorId ?? ALL);
    setGroups(ALL_CASH_EXPORT_GROUPS);
    setMethods([...CASH_EXPORT_PAYMENT_OPTIONS]);
    setIncludeCancelled(false);
    setIncludeItems(true);
    setEmptyNotice(false);
    setBusy(false);
  }, [open, initialTerminalId, initialOperatorId]);

  const range = useMemo(() => {
    if (mode !== 'period') return null;
    if (preset === 'custom') return { from: customFrom, to: customTo };
    return resolveCashExportPeriod(preset, todayInTz(timezone));
  }, [mode, preset, customFrom, customTo, timezone]);

  const periodError = range ? validateCashExportPeriod(range.from, range.to) : null;
  const customPending = preset === 'custom' && (!customFrom || !customTo);
  const filterError = groups.length === 0
    ? 'Marque ao menos um tipo de movimentação.'
    : methods.length === 0
      ? 'Marque ao menos uma forma de pagamento.'
      : null;
  const blockingMessage = periodError && !customPending ? periodError : filterError;
  const canSubmit = !busy && !customPending && !periodError && !filterError;

  const handleExport = async () => {
    if (!canSubmit) return;
    setBusy(true);
    setEmptyNotice(false);
    try {
      const raw: CashExportPayload = mode === 'session' && session
        ? await fetchPdvCashSessionExport(session.id)
        : await fetchPdvCashPeriodExport({
          from: range!.from,
          to: range!.to,
          terminalId: terminalId === ALL ? null : terminalId,
          operatorId: canManageOthers && operatorId !== ALL ? operatorId : null,
        });

      const filters: CashExportFilters = { groups, paymentMethods: methods, includeCancelled };
      const filtered = filterCashExportPayload(raw, filters);
      if (countCashExportMovements(filtered) === 0) {
        setEmptyNotice(true);
        return;
      }

      const tz = raw.timezone ?? timezone;
      const first = filtered.sessions[0];
      const periodLabel = mode === 'session' && first
        ? `Caixa ${first.terminalName}, operador ${first.operatorName}${first.closedAt ? `, fechado em ${dateTime(first.closedAt)}` : ''}`
        : `Período: ${describeCashExportPeriod(range!.from, range!.to)}`;
      const options: CashExportDocumentOptions = {
        companyName,
        periodLabel,
        filtersLabel: describeCashExportFilters(filters),
        timezone: tz,
        includeItems,
      };
      const extension = format === 'pdf' ? 'pdf' : 'xlsx';
      const filename = mode === 'session' && first
        ? buildCashExportFilename({
          scope: 'session',
          extension,
          terminalName: first.terminalName,
          closedDate: first.closedAt ? dateInTz(first.closedAt, tz) : null,
        })
        : buildCashExportFilename({ scope: 'period', extension, from: range!.from, to: range!.to });

      // Os geradores só entram no bundle quando alguém exporta.
      if (format === 'pdf') {
        const { downloadCashExportPdf } = await import('@/lib/pdv/cashExport/pdf');
        downloadCashExportPdf(filtered, options, { money, dateTime }, filename);
      } else {
        const { downloadCashExportExcel } = await import('@/lib/pdv/cashExport/excel');
        await downloadCashExportExcel(filtered, options, filename);
      }
      toast({
        title: 'Exportação pronta',
        description: `${countCashExportMovements(filtered)} movimentações em ${filtered.sessions.length} ${filtered.sessions.length === 1 ? 'caixa' : 'caixas'}.`,
      });
      onOpenChange(false);
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Não foi possível exportar',
        description: error instanceof Error ? error.message : 'Tente novamente.',
      });
    } finally {
      setBusy(false);
    }
  };

  const FormatIcon = format === 'excel' ? FileSpreadsheet : FileText;

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={(next) => { if (!busy) onOpenChange(next); }}
      title={mode === 'session' ? 'Exportar caixa' : 'Exportar movimentações do caixa'}
      description={mode === 'session' && session
        ? `${session.terminalName}, ${session.operatorName}${session.closedAt ? `, fechado em ${dateTime(session.closedAt)}` : ''}`
        : 'Todas as vendas e movimentações dos caixas fechados no período, em qualquer forma de pagamento.'}
      footer={(
        <div className="space-y-2">
          {blockingMessage ? <p className="text-sm text-muted-foreground">{blockingMessage}</p> : null}
          <Button type="button" className="min-h-11 w-full gap-2 rounded-xl" disabled={!canSubmit} onClick={() => void handleExport()}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FormatIcon className="h-4 w-4" />}
            {busy ? 'Gerando...' : `Exportar em ${format === 'pdf' ? 'PDF' : 'Excel'}`}
          </Button>
        </div>
      )}
    >
      <div className="space-y-5">
        <div className="space-y-2">
          <Label className={sectionLabel}>Formato</Label>
          <div className="grid grid-cols-2 gap-2">
            {([['pdf', 'PDF', FileText], ['excel', 'Excel', FileSpreadsheet]] as const).map(([id, label, Icon]) => (
              <button
                key={id}
                type="button"
                aria-pressed={format === id}
                onClick={() => setFormat(id)}
                className={cn(
                  'flex min-h-11 items-center justify-center gap-2 rounded-lg border text-sm font-medium transition-colors',
                  format === id ? 'border-primary bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:bg-muted/50',
                )}
              >
                <Icon className="h-4 w-4" /> {label}
              </button>
            ))}
          </div>
        </div>

        {mode === 'period' ? (
          <>
            <div className="space-y-2">
              <Label className={sectionLabel}>Período do fechamento</Label>
              <Select value={preset} onValueChange={(value) => { setPreset(value as CashExportPeriodPreset); setEmptyNotice(false); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CASH_EXPORT_PERIOD_PRESETS.map((item) => (
                    <SelectItem key={item.id} value={item.id}>{item.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {preset === 'custom' ? (
                <div className="grid grid-cols-2 gap-2">
                  <DateField label="De" value={customFrom || undefined} max={customTo || undefined} onChange={(value) => { setCustomFrom(value); setEmptyNotice(false); }} />
                  <DateField label="Até" value={customTo || undefined} min={customFrom || undefined} onChange={(value) => { setCustomTo(value); setEmptyNotice(false); }} />
                </div>
              ) : range ? (
                <p className="text-xs text-muted-foreground">{describeCashExportPeriod(range.from, range.to)}</p>
              ) : null}
              <p className="text-xs text-muted-foreground">Máximo de {CASH_EXPORT_MAX_DAYS} dias por exportação.</p>
            </div>

            <div className="space-y-2">
              <Label className={sectionLabel}>Caixa</Label>
              <Select value={terminalId} onValueChange={(value) => { setTerminalId(value); setEmptyNotice(false); }}>
                <SelectTrigger><SelectValue placeholder="Todos os caixas" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>Todos os caixas</SelectItem>
                  {terminals.map((terminal) => <SelectItem key={terminal.id} value={terminal.id}>{terminal.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {canManageOthers ? (
              <div className="space-y-2">
                <Label className={sectionLabel}>Operador</Label>
                <Select value={operatorId} onValueChange={(value) => { setOperatorId(value); setEmptyNotice(false); }}>
                  <SelectTrigger><SelectValue placeholder="Todos os operadores" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>Todos os operadores</SelectItem>
                    {operators.map(([id, name]) => <SelectItem key={id} value={id}>{name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Você exporta somente os seus caixas.</p>
            )}
          </>
        ) : null}

        <CheckboxSection
          title="Tipos de movimentação"
          options={CASH_EXPORT_GROUPS.map((group) => ({ value: group.id, label: group.label }))}
          selected={groups}
          onChange={(next) => { setGroups(next as CashExportMovementGroup[]); setEmptyNotice(false); }}
          columns={1}
        />

        <CheckboxSection
          title="Formas de pagamento"
          options={CASH_EXPORT_PAYMENT_OPTIONS.map((method) => ({ value: method, label: cashExportPaymentLabel(method) }))}
          selected={methods}
          onChange={(next) => { setMethods(next); setEmptyNotice(false); }}
          columns={2}
        />

        <div className="flex flex-col items-start gap-4">
          <div className="flex flex-col items-start gap-2">
            <Label className={sectionLabel}>Vendas canceladas</Label>
            <LabeledSwitch
              value={includeCancelled ? 'sim' : 'nao'}
              onChange={(value) => { setIncludeCancelled(value === 'sim'); setEmptyNotice(false); }}
              off={{ value: 'nao', label: 'Não incluir' }}
              on={{ value: 'sim', label: 'Incluir' }}
              aria-label="Incluir vendas canceladas"
            />
          </div>
          <div className="flex flex-col items-start gap-2">
            <Label className={sectionLabel}>Itens das vendas</Label>
            <LabeledSwitch
              value={includeItems ? 'sim' : 'nao'}
              onChange={(value) => setIncludeItems(value === 'sim')}
              off={{ value: 'nao', label: 'Só o total' }}
              on={{ value: 'sim', label: 'Detalhar itens' }}
              aria-label="Detalhar itens das vendas"
            />
          </div>
        </div>

        {emptyNotice ? (
          <div role="alert" className="flex items-start gap-2 rounded-lg border border-warning bg-muted p-3 text-sm">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
            <span>Nenhuma movimentação encontrada com esses filtros. Ajuste o período, os tipos ou as formas de pagamento e tente de novo.</span>
          </div>
        ) : null}
      </div>
    </ResponsiveModal>
  );
}

function CheckboxSection({
  title,
  options,
  selected,
  onChange,
  columns,
}: {
  title: string;
  options: { value: string; label: string }[];
  selected: string[];
  onChange: (next: string[]) => void;
  columns: 1 | 2;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className={sectionLabel}>{title}</Label>
        <div className="flex gap-3 text-xs">
          <button type="button" className="text-primary hover:underline" onClick={() => onChange(options.map((option) => option.value))}>Todos</button>
          <button type="button" className="text-muted-foreground hover:underline" onClick={() => onChange([])}>Nenhum</button>
        </div>
      </div>
      <div className={cn('grid gap-1 rounded-md border p-2', columns === 2 && 'grid-cols-2')}>
        {options.map((option) => (
          <label key={option.value} className="flex min-h-9 cursor-pointer items-center gap-2.5 rounded-md px-1.5 text-sm hover:bg-muted/50">
            <Checkbox
              checked={selected.includes(option.value)}
              onCheckedChange={() => onChange(toggle(selected, option.value))}
            />
            <span className="min-w-0">{option.label}</span>
          </label>
        ))}
      </div>
    </div>
  );
}
