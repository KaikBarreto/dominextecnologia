import { useMemo, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { AlertCircle, ArrowDownToLine, CircleDollarSign, History, RotateCcw, WalletCards } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { cn } from '@/lib/utils';
import { formatMoney } from '@/lib/format';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { useAuth } from '@/contexts/AuthContext';
import {
  PartyAccountDomainError,
  type PartyAccountEntry,
  type PartyAccountType,
  usePartyAccountStatement,
} from '@/hooks/usePartyAccountStatement';

type Segment = 'accounts' | 'balance';
type ActionState =
  | { kind: 'post' }
  | { kind: 'apply'; entry: PartyAccountEntry }
  | { kind: 'reverse'; entry: PartyAccountEntry }
  | { kind: 'settle'; entry: PartyAccountEntry }
  | { kind: 'reverseSettlement'; entry: PartyAccountEntry }
  | null;

interface PartyAccountPanelProps {
  partyType: PartyAccountType;
  partyId: string;
  enabled?: boolean;
  canManage?: boolean;
  className?: string;
}

function today(): string {
  const value = new Date();
  const local = new Date(value.getTime() - value.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

function newRequestId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `party-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

const ENTRY_LABELS: Record<PartyAccountEntry['sourceType'], string> = {
  obligation: 'Conta',
  credit: 'Crédito',
  adjustment: 'Ajuste',
  application: 'Crédito aplicado',
  reversal: 'Estorno',
  settlement: 'Recebimento',
  settlement_reversal: 'Estorno de recebimento',
  legacy_debt_balance: 'Débito anterior',
  legacy_credit_balance: 'Crédito anterior',
};

const STATUS_LABELS: Record<NonNullable<PartyAccountEntry['accountStatus']>, string> = {
  open: 'Em aberto',
  partial: 'Parcial',
  paid: 'Pago',
  closed_by_credit: 'Quitado com crédito',
};

function safeDate(value: string): string {
  try {
    return format(parseISO(`${value}T12:00:00`), 'dd/MM/yyyy', { locale: ptBR });
  } catch {
    return value;
  }
}

export function PartyAccountPanel({
  partyType,
  partyId,
  enabled = true,
  canManage = false,
  className,
}: PartyAccountPanelProps) {
  const { locale, currency } = useAppLocaleContext();
  const { isAdminOrGestor, hasPermission, hasPermissionRecord } = useAuth();
  const canReceive = partyType === 'customer' && (isAdminOrGestor()
    || (hasPermissionRecord && hasPermission('fn:receive_pdv_receivable')));
  const canReverseSettlement = partyType === 'customer' && (isAdminOrGestor()
    || (hasPermissionRecord && hasPermission('fn:reverse_pdv_receivable')));
  const money = (value: number) => formatMoney(value, currency, locale);
  const [segment, setSegment] = useState<Segment>('accounts');
  const [page, setPage] = useState(1);
  const [action, setAction] = useState<ActionState>(null);
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [occurredOn, setOccurredOn] = useState(today);
  const [entryKind, setEntryKind] = useState<'credit' | 'adjustment'>('credit');
  const [method, setMethod] = useState<'dinheiro' | 'pix' | 'transferencia'>('pix');
  const [accountId, setAccountId] = useState('');
  const [cashSessionId, setCashSessionId] = useState('');
  const [requestId, setRequestId] = useState(newRequestId);
  const pageSize = 10;
  const account = usePartyAccountStatement({
    partyType, partyId, page, pageSize, segment, enabled, receivablesEnabled: canReceive || canReverseSettlement,
  });

  const statement = account.statement;
  const companyDate = statement?.summary.asOf && /^\d{4}-\d{2}-\d{2}$/.test(statement.summary.asOf)
    ? statement.summary.asOf
    : today();
  const entries = useMemo(() => statement?.entries ?? [], [statement?.entries]);

  if (!enabled || account.isHidden) return null;

  const resetAction = () => {
    setAction(null);
    setAmount('');
    setDescription('');
    setOccurredOn(companyDate);
    setEntryKind('credit');
    setMethod('pix');
    setAccountId('');
    setCashSessionId('');
    setRequestId(newRequestId());
  };

  const openAction = (next: Exclude<ActionState, null>) => {
    setAction(next);
    setAmount(next.kind === 'apply'
      ? String(Math.min(next.entry.openAmount ?? 0, statement?.summary.availableCredit ?? 0))
      : next.kind === 'settle' ? String(next.entry.openAmount ?? 0) : '');
    setDescription(next.kind === 'apply'
      ? `${partyType === 'customer' ? 'Crédito' : 'Adiantamento'} aplicado em ${next.entry.description}`
      : '');
    setOccurredOn(companyDate);
    setEntryKind('credit');
    setMethod(next.kind === 'reverseSettlement' ? next.entry.settlementMethod ?? 'pix' : 'pix');
    setAccountId(next.kind === 'reverseSettlement' ? next.entry.accountId ?? '' : '');
    setCashSessionId('');
    setRequestId(newRequestId());
  };

  const mutation = action?.kind === 'post'
    ? account.postCredit
    : action?.kind === 'apply'
      ? account.applyCredit
      : action?.kind === 'reverse'
        ? account.reverseCredit
        : action?.kind === 'settle'
          ? account.settleReceivable
          : account.reverseSettlement;

  const submit = async () => {
    if (!action) return;
    try {
      if (action.kind === 'post') {
        await account.postCredit.mutateAsync({
          entryKind,
          amount: Number(amount.replace(',', '.')),
          occurredOn,
          description,
          idempotencyKey: requestId,
        });
      } else if (action.kind === 'apply') {
        await account.applyCredit.mutateAsync({
          financialTransactionId: action.entry.id,
          amount: Number(amount.replace(',', '.')),
          occurredOn,
          description,
          idempotencyKey: requestId,
        });
      } else if (action.kind === 'reverse') {
        await account.reverseCredit.mutateAsync({
          entryId: action.entry.id,
          reason: description,
          idempotencyKey: requestId,
        });
      } else if (action.kind === 'settle') {
        await account.settleReceivable.mutateAsync({
          receivableId: action.entry.id,
          amount: Number(amount.replace(',', '.')),
          method,
          accountId,
          cashSessionId: method === 'dinheiro' ? cashSessionId : null,
          receivedOn: occurredOn,
          notes: description,
          idempotencyKey: requestId,
        });
      } else {
        await account.reverseSettlement.mutateAsync({
          settlementTransactionId: action.entry.id,
          accountId,
          cashSessionId: method === 'dinheiro' ? cashSessionId : null,
          reason: description,
          idempotencyKey: requestId,
        });
      }
      resetAction();
    } catch {
      // O mesmo requestId permanece no formulário: uma nova tentativa é idempotente.
    }
  };

  const totalPages = statement ? Math.max(1, Math.ceil(statement.totalCount / pageSize)) : 1;
  const formError = mutation.error instanceof PartyAccountDomainError
    ? mutation.error.message
    : mutation.error
      ? 'Não foi possível concluir. Tente novamente.'
      : null;

  return (
    <section className={cn('rounded-xl border bg-card', className)} aria-labelledby={`party-account-${partyType}-${partyId}`}>
      <div className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div>
          <h3 id={`party-account-${partyType}-${partyId}`} className="font-semibold">
            {partyType === 'customer' ? 'Conta do cliente' : 'Financeiro'}
          </h3>
          <p className="text-sm text-muted-foreground">
            {partyType === 'customer' ? 'Dívidas e créditos são mostrados separadamente.' : 'Contas e adiantamentos são mostrados separadamente.'}
          </p>
        </div>
        {canManage && statement && (
          <Button type="button" variant="outline" size="sm" className="h-auto min-h-9 w-full whitespace-normal px-3 sm:w-auto" onClick={() => openAction({ kind: 'post' })}>
            <ArrowDownToLine className="mr-2 h-4 w-4 shrink-0" />
            {partyType === 'customer' ? 'Registrar crédito ou ajuste' : 'Registrar adiantamento ou ajuste'}
          </Button>
        )}
      </div>

      {account.isLoading ? (
        <div className="space-y-3 border-y px-4 py-4" aria-label="Carregando conta">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : account.isError ? (
        <div role="alert" className="flex flex-col gap-3 border-y px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
            <div>
              <p className="font-medium">Não foi possível carregar esta conta</p>
              <p className="text-sm text-muted-foreground">
                {account.error instanceof Error ? account.error.message : 'Tente novamente.'}
              </p>
            </div>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={() => void account.refetch()}>
            Tentar novamente
          </Button>
        </div>
      ) : statement ? (
        <>
          <div className={cn(
            'grid border-y bg-muted/20',
            partyType === 'customer' ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4' : 'grid-cols-1 sm:grid-cols-2',
          )}>
            <Metric label={partyType === 'customer' ? 'Em aberto' : 'A pagar'} value={money(statement.summary.openAmount)} />
            <Metric label={partyType === 'customer' ? 'Crédito disponível' : 'Adiantamento'} value={money(statement.summary.availableCredit)} />
            {partyType === 'customer' && statement.summary.creditLimit !== null && (
              <Metric label="Limite de fiado" value={money(statement.summary.creditLimit)} />
            )}
            {partyType === 'customer' && statement.summary.purchaseCapacity !== null && (
              <Metric label="Disponível no fiado" value={money(statement.summary.purchaseCapacity)} />
            )}
          </div>
          {partyType === 'customer' && (
            <p className="border-b px-4 py-2 text-xs text-muted-foreground sm:px-5">
              O crédito disponível pode quitar contas; ele não aumenta o limite de fiado.
            </p>
          )}

          <div className="px-4 py-4 sm:px-5">
            <div className="mb-4 flex w-full gap-1 rounded-lg bg-muted p-1 sm:w-fit" role="tablist" aria-label="Tipo de movimento">
              <SegmentButton active={segment === 'accounts'} onClick={() => { setSegment('accounts'); setPage(1); }}>
                Contas
              </SegmentButton>
              <SegmentButton active={segment === 'balance'} onClick={() => { setSegment('balance'); setPage(1); }}>
                Saldo
              </SegmentButton>
            </div>

            {entries.length === 0 ? (
              <div className="flex flex-col items-center px-4 py-9 text-center">
                <History className="mb-3 h-8 w-8 text-muted-foreground" />
                <p className="font-medium">Nenhum movimento nesta página</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {segment === 'accounts' ? 'As contas aparecerão aqui.' : 'Créditos, aplicações e estornos aparecerão aqui.'}
                </p>
              </div>
            ) : (
              <div className="divide-y rounded-lg border">
                {entries.map((entry) => (
                  <EntryRow
                    key={entry.id}
                    entry={entry}
                    money={money}
                    canManage={canManage}
                    canReceive={canReceive}
                    canReverseSettlement={canReverseSettlement}
                    availableCredit={statement.summary.availableCredit}
                    partyType={partyType}
                    onApply={() => openAction({ kind: 'apply', entry })}
                    onReverse={() => openAction({ kind: 'reverse', entry })}
                    onSettle={() => openAction({ kind: 'settle', entry })}
                    onReverseSettlement={() => openAction({ kind: 'reverseSettlement', entry })}
                  />
                ))}
              </div>
            )}

            {statement.totalCount > pageSize && (
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm">
                <span className="text-muted-foreground">Página {page} de {totalPages}</span>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>Anterior</Button>
                  <Button type="button" variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((value) => value + 1)}>Próxima</Button>
                </div>
              </div>
            )}
          </div>
        </>
      ) : null}

      <ResponsiveModal
        open={Boolean(action)}
        onOpenChange={(open) => { if (!open && !mutation.isPending) resetAction(); }}
        title={action?.kind === 'post'
          ? partyType === 'customer' ? 'Registrar crédito ou ajuste' : 'Registrar adiantamento ou ajuste'
          : action?.kind === 'apply'
            ? partyType === 'customer' ? 'Usar crédito nesta conta' : 'Usar adiantamento nesta conta'
            : action?.kind === 'settle'
              ? 'Receber conta do cliente'
              : action?.kind === 'reverseSettlement'
                ? 'Estornar recebimento'
                : 'Estornar movimento'}
        description={action?.kind === 'apply'
          ? partyType === 'customer'
            ? 'Esta ação reduz a conta em aberto e o crédito disponível. Não registra pagamento em dinheiro.'
            : 'Esta ação reduz a conta a pagar e o adiantamento disponível. Não registra pagamento em dinheiro.'
          : action?.kind === 'settle'
            ? 'Informe como e onde o valor entrou. É possível receber só uma parte.'
            : action?.kind === 'reverseSettlement'
              ? 'O sistema cria uma saída compensatória e reabre as contas recebidas.'
          : action?.kind === 'reverse'
            ? 'O estorno cria um movimento inverso e mantém o histórico.'
            : partyType === 'customer'
              ? 'Registre um valor recebido antecipadamente ou corrija o saldo.'
              : 'Registre um valor pago antecipadamente ao fornecedor ou corrija o saldo.'}
        className="sm:max-w-lg"
        footer={
          <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" disabled={mutation.isPending} onClick={resetAction}>Cancelar</Button>
            <Button type="button" disabled={mutation.isPending
              || !description.trim()
              || ((action?.kind === 'settle' || action?.kind === 'apply' || action?.kind === 'post') && !(Number(amount.replace(',', '.')) !== 0))
              || ((action?.kind === 'settle' || action?.kind === 'reverseSettlement') && (!accountId || (method === 'dinheiro' && !cashSessionId)))} onClick={() => void submit()}>
              {mutation.isPending ? 'Salvando…' : action?.kind === 'reverse' || action?.kind === 'reverseSettlement' ? 'Confirmar estorno' : 'Confirmar'}
            </Button>
          </div>
        }
      >
        <div className="space-y-4 py-1">
          {action?.kind === 'post' && (
            <div className="space-y-2">
              <Label htmlFor="party-entry-kind">Tipo</Label>
              <select
                id="party-entry-kind"
                value={entryKind}
                onChange={(event) => setEntryKind(event.target.value as 'credit' | 'adjustment')}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="credit">{partyType === 'customer' ? 'Crédito recebido' : 'Adiantamento pago ao fornecedor'}</option>
                <option value="adjustment">Ajuste manual</option>
              </select>
            </div>
          )}
          {action?.kind !== 'reverse' && action?.kind !== 'reverseSettlement' && (
            <div className="space-y-2">
              <Label htmlFor="party-amount">Valor</Label>
              <Input id="party-amount" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0,00" />
              {action?.kind === 'post' && entryKind === 'adjustment' && (
                <p className="text-xs text-muted-foreground">Use valor negativo somente para reduzir o crédito.</p>
              )}
            </div>
          )}
          {action?.kind !== 'reverse' && action?.kind !== 'reverseSettlement' && (
            <div className="space-y-2">
              <Label htmlFor="party-date">Data</Label>
              <Input id="party-date" type="date" max={companyDate} value={occurredOn} onChange={(event) => setOccurredOn(event.target.value)} />
            </div>
          )}
          {(action?.kind === 'settle' || action?.kind === 'reverseSettlement') && (
            <>
              <div className="space-y-2">
                <Label htmlFor="party-settlement-method">Forma de recebimento</Label>
                <select id="party-settlement-method" value={method}
                  disabled={action.kind === 'reverseSettlement'}
                  onChange={(event) => { setMethod(event.target.value as typeof method); setAccountId(''); setCashSessionId(''); }}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                  <option value="dinheiro">Dinheiro</option><option value="pix">Pix</option><option value="transferencia">Transferência</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="party-settlement-account">Conta financeira</Label>
                <select id="party-settlement-account" value={accountId}
                  disabled={action.kind === 'reverseSettlement'}
                  onChange={(event) => { setAccountId(event.target.value); setCashSessionId(''); }}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                  <option value="">Selecione</option>
                  {(account.receivableOptions.data?.accounts ?? []).filter((item) => item.type === (method === 'dinheiro' ? 'caixa' : 'banco')).map((item) => (
                    <option key={item.id} value={item.id}>{item.name}</option>
                  ))}
                </select>
              </div>
              {method === 'dinheiro' && (
                <div className="space-y-2">
                  <Label htmlFor="party-settlement-session">Caixa aberto</Label>
                  <select id="party-settlement-session" value={cashSessionId} onChange={(event) => setCashSessionId(event.target.value)}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                    <option value="">Selecione</option>
                    {(account.receivableOptions.data?.cashSessions ?? []).filter((item) => item.cashAccountId === accountId).map((item) => (
                      <option key={item.id} value={item.id}>{item.label}</option>
                    ))}
                  </select>
                </div>
              )}
            </>
          )}
          <div className="space-y-2">
            <Label htmlFor="party-description">{action?.kind === 'reverse' || action?.kind === 'reverseSettlement' ? 'Motivo' : 'Descrição'}</Label>
            <Textarea id="party-description" value={description} onChange={(event) => setDescription(event.target.value)} maxLength={500} rows={3} />
          </div>
          {formError && <p role="alert" className="text-sm font-medium text-destructive">{formError}</p>}
        </div>
      </ResponsiveModal>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 border-b px-4 py-4 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0 sm:px-5">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-bold tabular-nums sm:text-xl">{value}</p>
    </div>
  );
}

function SegmentButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn('min-h-9 flex-1 rounded-md px-4 text-sm font-medium transition-colors sm:flex-none', active ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}
    >
      {children}
    </button>
  );
}

function EntryRow({
  entry,
  money,
  canManage,
  canReceive,
  canReverseSettlement,
  availableCredit,
  partyType,
  onApply,
  onReverse,
  onSettle,
  onReverseSettlement,
}: {
  entry: PartyAccountEntry;
  money: (value: number) => string;
  canManage: boolean;
  canReceive: boolean;
  canReverseSettlement: boolean;
  availableCredit: number;
  partyType: PartyAccountType;
  onApply: () => void;
  onReverse: () => void;
  onSettle: () => void;
  onReverseSettlement: () => void;
}) {
  const isAccount = entry.sourceType === 'obligation' || entry.sourceType === 'legacy_debt_balance';
  const canApply = canManage && entry.sourceType === 'obligation' && (entry.openAmount ?? 0) > 0 && availableCredit > 0;
  const canReverse = canManage && ['credit', 'adjustment', 'application'].includes(entry.sourceType);
  const canSettle = canReceive && entry.sourceType === 'obligation' && (entry.openAmount ?? 0) > 0;
  const canReverseReceipt = canReverseSettlement && entry.sourceType === 'settlement' && entry.canReverse;
  const displayedAmount = isAccount ? (entry.openAmount ?? entry.amount) : entry.amount;
  return (
    <div className="grid gap-3 px-3 py-3 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center sm:px-4">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">{
            partyType === 'supplier'
              ? entry.sourceType === 'credit'
                ? 'Adiantamento'
                : entry.sourceType === 'application'
                  ? 'Adiantamento aplicado'
                  : entry.sourceType === 'legacy_credit_balance'
                    ? 'Adiantamento anterior'
                    : ENTRY_LABELS[entry.sourceType]
              : ENTRY_LABELS[entry.sourceType]
          }</Badge>
          {entry.accountStatus && <Badge variant={entry.accountStatus === 'open' ? 'warning' : 'secondary'}>{STATUS_LABELS[entry.accountStatus]}</Badge>}
          <span className="text-xs text-muted-foreground">{safeDate(entry.occurredOn)}</span>
          {entry.dueDate && <span className="text-xs text-muted-foreground">Vence {safeDate(entry.dueDate)}</span>}
        </div>
        <p className="mt-1 break-words text-sm font-medium">{entry.description}</p>
      </div>
      <p className={cn('whitespace-nowrap text-right font-semibold tabular-nums', !isAccount && entry.amount < 0 && 'text-destructive')}>
        {!isAccount && entry.amount > 0 ? '+' : ''}{money(displayedAmount)}
      </p>
      {(canApply || canReverse || canSettle || canReverseReceipt) && (
        <div className="flex justify-end gap-2">
          {canSettle && <Button type="button" variant="outline" size="sm" onClick={onSettle}><CircleDollarSign className="mr-2 h-4 w-4" />Receber</Button>}
          {canApply && <Button type="button" variant="outline" size="sm" onClick={onApply}><WalletCards className="mr-2 h-4 w-4" />{partyType === 'customer' ? 'Usar crédito' : 'Usar adiantamento'}</Button>}
          {canReverse && <Button type="button" variant="ghost" size="sm" onClick={onReverse}><RotateCcw className="mr-2 h-4 w-4" />Estornar</Button>}
          {canReverseReceipt && <Button type="button" variant="ghost" size="sm" onClick={onReverseSettlement}><RotateCcw className="mr-2 h-4 w-4" />Estornar</Button>}
        </div>
      )}
    </div>
  );
}
