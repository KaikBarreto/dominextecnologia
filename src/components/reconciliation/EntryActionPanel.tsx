import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { SearchableSelect, type SearchableSelectGroup } from '@/components/ui/SearchableSelect';
import { CostCenterSelect } from '@/components/financial/CostCenterSelect';
import { CustomerSelectField } from '@/components/customers/CustomerSelectField';
import { SupplierSelectField } from '@/components/financial/SupplierSelectField';
import { useCustomers } from '@/hooks/useCustomers';
import { useSuppliers } from '@/hooks/useSuppliers';
import { useEmployees } from '@/hooks/useEmployees';
import { useFinancialAccounts } from '@/hooks/useFinancialAccounts';
import { useFinancialCategories } from '@/hooks/useFinancialCategories';
import { filterCategoriesByTransactionType } from '@/lib/financial-category-filter';
import { buildCategoryTree } from '@/lib/category-tree';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';
import { formatMoney } from '@/lib/format';
import { cn } from '@/lib/utils';
import {
  AlertTriangle,
  ArrowLeftRight,
  Ban,
  Check,
  CheckCircle2,
  CreditCard,
  FileDown,
  Loader2,
  PlusCircle,
  RefreshCw,
  Search,
  Undo2,
  Users,
  X,
} from 'lucide-react';
import type { useBankReconciliation } from '@/hooks/useBankReconciliation';
import type {
  CreateCardPurchaseResult,
  ListCardBillsResult,
  MatchType,
  ReconEntry,
  ReconKind,
  ReconTxJson,
} from '@/lib/reconciliation/types';

/** `due_date`/`transaction_date`/`reference_month` chegam YYYY-MM-DD. Nunca `new Date(...)`. */
function formatDateBR(isoDate: string | null): string {
  if (!isoDate) return '';
  const m = isoDate.slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return isoDate;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

function formatMonthYear(isoDate: string): string {
  const m = isoDate.slice(0, 10).match(/^(\d{4})-(\d{2})-/);
  if (!m) return isoDate;
  return `${m[2]}/${m[1]}`;
}

type Mode =
  | 'idle'
  | 'settle'
  | 'create'
  | 'transfer'
  | 'cardBill'
  | 'employee'
  | 'search'
  | 'candidates'
  // Modo FATURA DE CARTÃO (20261018140000) — ver briefing: nunca reusar
  // 'settle'/'transfer'/'employee' aqui, a RPC recusa os três.
  | 'cardPurchaseCandidates'
  | 'cardPurchaseCreate'
  | 'cardPaymentCandidates'
  | 'cardPayBill'
  | 'cardSearch';

type ReconMutations = Pick<
  ReturnType<typeof useBankReconciliation>,
  | 'matchExisting'
  | 'searchCandidates'
  | 'listCardBills'
  | 'listTransferLegs'
  | 'settleTransaction'
  | 'createTransaction'
  | 'createTransfer'
  | 'payCardBill'
  | 'createEmployeeMovement'
  | 'flipSign'
  | 'ignoreEntry'
  | 'unmatchEntry'
  | 'createCardPurchase'
  | 'matchCardPurchase'
  | 'matchCardBillPayment'
  | 'cardPayBill'
  | 'searchCardPurchases'
>;

interface EntryActionPanelProps {
  entry: ReconEntry;
  /** Conta ativa da conciliação (perna DESTA linha). */
  accountId: string;
  /** `state.kind` do import — define o ramo (banco x fatura de cartão). */
  kind: ReconKind;
  finalized: boolean;
  mutations: ReconMutations;
  /** Fecha o drawer no mobile. Ignorado no desktop (painel fixo). */
  onClose?: () => void;
}

/** Forma mínima de uma mutation do react-query que esta checagem precisa (testável sem montar o hook inteiro). */
interface PendingMutationLike<TVariables> {
  isPending: boolean;
  variables?: TVariables;
}

/**
 * Subconjunto de `ReconMutations` relevante pra travar o botão só da linha
 * certa. As 4 do modo cartão são OPCIONAIS de propósito: o teste existente
 * (`EntryActionPanel.entryMutationPending.test.ts`, que roda SEM elas)
 * continua válido sem precisar listar as novas em todo caso de teste.
 */
type EntryScopedMutations = {
  matchExisting: PendingMutationLike<{ entryId: string }>;
  settleTransaction: PendingMutationLike<{ entryId: string }>;
  createTransaction: PendingMutationLike<{ entryId: string }>;
  createTransfer: PendingMutationLike<{ entryId: string }>;
  payCardBill: PendingMutationLike<{ entryId: string }>;
  createEmployeeMovement: PendingMutationLike<{ entryId: string }>;
  flipSign: PendingMutationLike<{ entryIds: string[] }>;
  ignoreEntry: PendingMutationLike<{ entryId: string }>;
  unmatchEntry: PendingMutationLike<{ entryId: string }>;
  createCardPurchase?: PendingMutationLike<{ entryId: string }>;
  matchCardPurchase?: PendingMutationLike<{ entryId: string }>;
  matchCardBillPayment?: PendingMutationLike<{ entryId: string }>;
  cardPayBill?: PendingMutationLike<{ entryId: string }>;
};

/**
 * Trava por LINHA, não global: as mutations do `useBankReconciliation` são
 * instâncias ÚNICAS compartilhadas entre todas as linhas do extrato (o hook
 * é instanciado uma vez por import). Olhar só `isPending` travava o Desfazer
 * de QUALQUER linha enquanto QUALQUER OUTRA linha estivesse gravando — com
 * 300 linhas no extrato isso inutiliza a tela inteira. Checamos as
 * `variables` da mutação em voo contra o `entryId` desta linha específica.
 *
 * Extraída como função pura (sem JSX/hooks) pra ser testável sem montar o
 * componente — ver `EntryActionPanel.entryMutationPending.test.ts`.
 */
export function isEntryMutationPending(entryId: string, mutations: EntryScopedMutations): boolean {
  return (
    (mutations.matchExisting.isPending && mutations.matchExisting.variables?.entryId === entryId) ||
    (mutations.settleTransaction.isPending && mutations.settleTransaction.variables?.entryId === entryId) ||
    (mutations.createTransaction.isPending && mutations.createTransaction.variables?.entryId === entryId) ||
    (mutations.createTransfer.isPending && mutations.createTransfer.variables?.entryId === entryId) ||
    (mutations.payCardBill.isPending && mutations.payCardBill.variables?.entryId === entryId) ||
    (mutations.createEmployeeMovement.isPending && mutations.createEmployeeMovement.variables?.entryId === entryId) ||
    (mutations.flipSign.isPending && !!mutations.flipSign.variables?.entryIds.includes(entryId)) ||
    (mutations.ignoreEntry.isPending && mutations.ignoreEntry.variables?.entryId === entryId) ||
    (mutations.unmatchEntry.isPending && mutations.unmatchEntry.variables?.entryId === entryId) ||
    (!!mutations.createCardPurchase?.isPending && mutations.createCardPurchase.variables?.entryId === entryId) ||
    (!!mutations.matchCardPurchase?.isPending && mutations.matchCardPurchase.variables?.entryId === entryId) ||
    (!!mutations.matchCardBillPayment?.isPending && mutations.matchCardBillPayment.variables?.entryId === entryId) ||
    (!!mutations.cardPayBill?.isPending && mutations.cardPayBill.variables?.entryId === entryId)
  );
}

/**
 * Destino que o painel de ações CHEGA A OFERECER (como botão/modo), por
 * MODO (`kind`) e SINAL (`isCredit`) da linha. Não decide se um destino já
 * oferecido está habilitado (ex: `settle` some de candidato quando
 * `entry.settle.candidate_count === 0`, mas isso só importa se `settle`
 * estiver nesta lista) — só QUAIS existem.
 *
 * Função pura, usada de verdade pelo render (`CardIdleDestinations` e o
 * `idle` de banco abaixo) — não é um espelho que pode divergir da tela: é
 * exatamente o que decide o que aparece. Existe pra provar, sem montar o
 * componente, a invariante do módulo: no modo `'card'` NUNCA aparecem
 * `'settle'`/`'transfer'`/`'employee_vale'`/`'create'` (a RPC recusa os
 * quatro), e o débito nunca oferece `'card_payment_pay'` nem o crédito
 * `'card_purchase_create'` — ver
 * `EntryActionPanel.offeredDestinations.test.ts`.
 */
export type OfferedDestination =
  | 'settle'
  | 'create'
  | 'transfer'
  | 'card_bill'
  | 'employee_vale'
  | 'search'
  | 'flip_sign'
  | 'ignore'
  | 'card_purchase_create'
  | 'card_payment_pay';

export function getOfferedDestinations(kind: ReconKind, isCredit: boolean): OfferedDestination[] {
  if (kind === 'card') {
    // Débito (compra): lança a compra que falta. Crédito (pagamento/estorno):
    // registra o pagamento da fatura. Nunca os dois ao mesmo tempo, e NUNCA
    // 'settle'/'transfer'/'employee_vale'/'create' — não existem neste modo.
    return isCredit
      ? ['card_payment_pay', 'search', 'flip_sign', 'ignore']
      : ['card_purchase_create', 'search', 'flip_sign', 'ignore'];
  }
  const destinations: OfferedDestination[] = ['settle', 'create', 'transfer', 'search', 'flip_sign', 'ignore'];
  // Pagar fatura de cartão e vale de funcionário só fazem sentido numa SAÍDA
  // do extrato bancário (dinheiro saindo da conta) — nunca numa ENTRADA.
  if (!isCredit) destinations.push('card_bill', 'employee_vale');
  return destinations;
}

/** Linha de candidato (TxJson) reutilizada em settle/candidates/search. */
function CandidateRow({
  candidate,
  onAction,
  actionLabel,
  isPending,
}: {
  candidate: ReconTxJson;
  onAction: () => void;
  actionLabel: string;
  isPending: boolean;
}) {
  const { locale, currency } = useAppLocaleContext();
  const isCredit = candidate.transaction_type === 'entrada';
  const counterparty = candidate.customer_name || candidate.supplier_name || candidate.employee_name;
  return (
    <div className="flex items-center justify-between gap-2 rounded-md border bg-card p-2.5">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{candidate.description || '—'}</p>
        <p className="truncate text-xs text-muted-foreground">
          {formatDateBR(candidate.due_date || candidate.paid_date || candidate.transaction_date)}
          {counterparty ? ` · ${counterparty}` : ''}
        </p>
      </div>
      <p className={cn('shrink-0 text-sm font-semibold tabular-nums', isCredit ? 'text-success' : 'text-destructive')}>
        {formatMoney(candidate.amount, currency, locale)}
      </p>
      <Button size="sm" className="shrink-0 bg-success text-success-foreground hover:bg-success/90" disabled={isPending} onClick={onAction}>
        {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
        {actionLabel}
      </Button>
    </div>
  );
}

export function EntryActionPanel({ entry, accountId, kind, finalized, mutations, onClose }: EntryActionPanelProps) {
  const { locale, currency } = useAppLocaleContext();
  const t = MESSAGES[locale].app.finance.reconciliation.actionPanel;
  const tMatchType = MESSAGES[locale].app.finance.reconciliation.matchTypeLabel;

  const [mode, setMode] = useState<Mode>('idle');
  const [confirmUnmatchOpen, setConfirmUnmatchOpen] = useState(false);

  const isCredit = entry.effective_amount >= 0;
  const absAmount = Math.abs(entry.effective_amount);

  // Reseta o sub-modo quando a linha selecionada muda (parent mantém a MESMA
  // instância do componente entre seleções sem remontar, no desktop).
  useEffect(() => {
    setMode('idle');
  }, [entry.id]);

  const entryMutationPending = isEntryMutationPending(entry.id, mutations);

  /* ─────────────────────── linha já resolvida: badge + desfazer ─────────────────────── */
  if (entry.status !== 'pending') {
    const matchType = entry.current_match?.match_type ?? null;
    const label = matchType ? tMatchType[matchType as MatchType] : t.destinations.ignore;
    const needsConfirm = matchType !== null && matchType !== 'existing';
    const confirmText = matchType ? tUndoConfirmFor(matchType, t) : t.confirmUndo.created;

    const handleUndo = () => {
      if (needsConfirm) setConfirmUnmatchOpen(true);
      else mutations.unmatchEntry.mutate({ entryId: entry.id });
    };

    return (
      <div className="flex items-center justify-between gap-2">
        <Badge variant={entry.status === 'ignored' ? 'muted' : 'success'} className="gap-1">
          {entry.status === 'ignored' ? <Ban className="h-3 w-3" /> : <CheckCircle2 className="h-3 w-3" />}
          {entry.status === 'ignored' ? MESSAGES[locale].app.finance.reconciliation.status.ignored : label}
        </Badge>
        {!finalized && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleUndo}
            disabled={entryMutationPending}
            className="text-muted-foreground hover:bg-destructive hover:text-white"
          >
            {entryMutationPending ? (
              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Undo2 className="mr-1 h-3.5 w-3.5" />
            )}
            {t.resolvedUndo}
          </Button>
        )}

        <AlertDialog open={confirmUnmatchOpen} onOpenChange={setConfirmUnmatchOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t.confirmUndoTitle}</AlertDialogTitle>
              <AlertDialogDescription>{confirmText}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t.cancelButton}</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-white hover:bg-destructive/90"
                onClick={() => {
                  setConfirmUnmatchOpen(false);
                  mutations.unmatchEntry.mutate({ entryId: entry.id });
                }}
              >
                {t.undoButton}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    );
  }

  /* ─────────────────────── linha pendente: sugestão + destinos ─────────────────────── */
  const suggestion = entry.suggested;
  const hasSuggestion = !!suggestion?.suggested_transaction_id && !suggestion.ambiguous;
  const isAmbiguous = !!suggestion?.ambiguous;
  const suggestedCandidate = hasSuggestion
    ? suggestion.candidates.find((c) => c.id === suggestion.suggested_transaction_id) ?? suggestion.candidates[0] ?? null
    : null;

  if (mode === 'candidates') {
    return (
      <ModeShell title={t.chooseMatch} onBack={() => setMode('idle')} backLabel={t.candidatesBack}>
        <div className="space-y-2">
          {suggestion.candidates.map((c) => (
            <CandidateRow
              key={c.id}
              candidate={c}
              actionLabel={t.confirmMatch}
              isPending={mutations.matchExisting.isPending}
              onAction={() => mutations.matchExisting.mutate({ entryId: entry.id, financialTransactionId: c.id })}
            />
          ))}
        </div>
      </ModeShell>
    );
  }

  if (mode === 'settle') {
    return (
      <ModeShell title={t.settle.title} onBack={() => setMode('idle')} backLabel={t.candidatesBack}>
        <div className="space-y-2">
          {entry.settle.candidates.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t.settle.empty}</p>
          ) : (
            entry.settle.candidates.map((c) => (
              <CandidateRow
                key={c.id}
                candidate={c}
                actionLabel={t.settle.confirm}
                isPending={mutations.settleTransaction.isPending}
                onAction={() => mutations.settleTransaction.mutate({ entryId: entry.id, financialTransactionId: c.id })}
              />
            ))
          )}
        </div>
      </ModeShell>
    );
  }

  if (mode === 'search') {
    return <SearchMode entry={entry} mutations={mutations} onBack={() => setMode('idle')} />;
  }

  if (mode === 'create') {
    return <CreateMode entry={entry} isCredit={isCredit} mutations={mutations} onBack={() => setMode('idle')} />;
  }

  if (mode === 'transfer') {
    return <TransferMode entry={entry} accountId={accountId} mutations={mutations} onBack={() => setMode('idle')} />;
  }

  if (mode === 'cardBill') {
    return <CardBillMode entry={entry} mutations={mutations} onBack={() => setMode('idle')} />;
  }

  if (mode === 'employee') {
    return <EmployeeMode entry={entry} mutations={mutations} onBack={() => setMode('idle')} />;
  }

  /* ── MODO CARTÃO: sub-modos ── */
  if (mode === 'cardPurchaseCandidates') {
    return <CardMatchMode kind="purchase" entry={entry} mutations={mutations} onBack={() => setMode('idle')} />;
  }

  if (mode === 'cardPaymentCandidates') {
    return <CardMatchMode kind="payment" entry={entry} mutations={mutations} onBack={() => setMode('idle')} />;
  }

  if (mode === 'cardPurchaseCreate') {
    return <CardCreatePurchaseMode entry={entry} mutations={mutations} onBack={() => setMode('idle')} onDone={onClose} />;
  }

  if (mode === 'cardPayBill') {
    return <CardPayBillMode entry={entry} mutations={mutations} onBack={() => setMode('idle')} />;
  }

  if (mode === 'cardSearch') {
    return <CardSearchMode entry={entry} mutations={mutations} onBack={() => setMode('idle')} />;
  }

  /* ── MODO CARTÃO: idle (pendente) ──
   * Nunca os destinos 'settle'/'transfer'/'employee' aqui — a RPC recusa os
   * três, e oferecer na tela é dar ao cliente um botão que erra no clique.
   */
  if (kind === 'card') {
    return (
      <CardIdleDestinations
        entry={entry}
        isCredit={isCredit}
        absAmount={absAmount}
        mutations={mutations}
        onClose={onClose}
        onPickMode={setMode}
      />
    );
  }

  /* ── idle ── */
  // `kind` aqui é sempre 'bank' (o ramo 'card' já retornou mais acima), mas
  // chama a função de verdade pra não duplicar a régua de quais destinos
  // existem por sinal.
  const bankDestinations = getOfferedDestinations(kind, isCredit);
  return (
    <div className="space-y-2">
      {onClose && (
        <Button variant="ghost" size="sm" className="mb-1 -ml-2 text-muted-foreground" onClick={onClose}>
          <X className="mr-1.5 h-3.5 w-3.5" />
          {t.close}
        </Button>
      )}

      {hasSuggestion && (
        <div className="space-y-2 rounded-md border bg-muted/30 p-2.5">
          <p className="text-xs font-medium text-foreground">{t.suggestionTitle}</p>
          {suggestedCandidate ? (
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm text-foreground">{suggestedCandidate.description || '—'}</p>
                <p className="text-xs text-muted-foreground">{formatDateBR(suggestedCandidate.transaction_date)}</p>
              </div>
              <p className={cn('shrink-0 text-sm font-semibold tabular-nums', isCredit ? 'text-success' : 'text-destructive')}>
                {formatMoney(suggestedCandidate.amount, currency, locale)}
              </p>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">{t.suggestionValueOnly.replace('{amount}', formatMoney(absAmount, currency, locale))}</p>
          )}
          <Button
            size="sm"
            className="w-full bg-success text-success-foreground hover:bg-success/90"
            disabled={mutations.matchExisting.isPending}
            onClick={() =>
              mutations.matchExisting.mutate({ entryId: entry.id, financialTransactionId: suggestion.suggested_transaction_id! })
            }
          >
            {mutations.matchExisting.isPending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Check className="mr-1 h-3.5 w-3.5" />}
            {suggestedCandidate ? t.confirmMatchWith.replace('{description}', suggestedCandidate.description || '—') : t.confirmMatch}
          </Button>
        </div>
      )}

      {isAmbiguous && (
        <div className="space-y-2 rounded-md border bg-muted/30 p-2.5">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
            <p className="text-xs text-muted-foreground">
              {t.ambiguousDescription
                .replace('{count}', String(suggestion.candidate_count))
                .replace('{amount}', formatMoney(absAmount, currency, locale))}
            </p>
          </div>
          {suggestion.candidates.length > 0 && (
            <Button size="sm" className="w-full bg-success text-success-foreground hover:bg-success/90" onClick={() => setMode('candidates')}>
              {t.chooseMatch}
            </Button>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {entry.settle.candidate_count === 0 ? (
          <DisabledWithTooltip label={t.destinations.settle} tooltip={t.destinations.settleDisabledTooltip} icon={<FileDown className="h-3.5 w-3.5" />} />
        ) : (
          <Button variant="outline" size="sm" className="gap-1.5 hover:bg-info hover:text-white hover:border-info" onClick={() => setMode('settle')}>
            <FileDown className="h-3.5 w-3.5" />
            {t.destinations.settle}
          </Button>
        )}

        <Button variant="outline" size="sm" className="gap-1.5 hover:bg-primary hover:text-primary-foreground hover:border-primary" onClick={() => setMode('create')}>
          <PlusCircle className="h-3.5 w-3.5" />
          {t.destinations.create}
        </Button>

        <Button variant="outline" size="sm" className="gap-1.5 hover:bg-info hover:text-white hover:border-info" onClick={() => setMode('transfer')}>
          <ArrowLeftRight className="h-3.5 w-3.5" />
          {t.destinations.transfer}
        </Button>

        {bankDestinations.includes('card_bill') && (
          <Button variant="outline" size="sm" className="gap-1.5 hover:bg-info hover:text-white hover:border-info" onClick={() => setMode('cardBill')}>
            <CreditCard className="h-3.5 w-3.5" />
            {t.destinations.cardBill}
          </Button>
        )}

        {bankDestinations.includes('employee_vale') && (
          <Button variant="outline" size="sm" className="gap-1.5 hover:bg-primary hover:text-primary-foreground hover:border-primary" onClick={() => setMode('employee')}>
            <Users className="h-3.5 w-3.5" />
            {t.destinations.employee}
          </Button>
        )}

        <Button variant="outline" size="sm" className="gap-1.5 hover:bg-success hover:text-white hover:border-success" onClick={() => setMode('search')}>
          <Search className="h-3.5 w-3.5" />
          {t.destinations.search}
        </Button>

        <Button
          variant="outline"
          size="sm"
          className={cn('gap-1.5 hover:bg-warning hover:text-white hover:border-warning', entry.sign_suspect && !entry.sign_flipped && 'border-warning text-warning')}
          disabled={mutations.flipSign.isPending}
          onClick={() => mutations.flipSign.mutate({ entryIds: [entry.id], flipped: !entry.sign_flipped })}
        >
          {mutations.flipSign.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          {t.destinations.flipSign}
        </Button>

        <Button
          variant="destructive-ghost"
          size="sm"
          className="gap-1.5"
          disabled={mutations.ignoreEntry.isPending}
          onClick={() => mutations.ignoreEntry.mutate({ entryId: entry.id })}
        >
          {mutations.ignoreEntry.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Ban className="h-3.5 w-3.5" />}
          {t.destinations.ignore}
        </Button>
      </div>

      {!hasSuggestion && !isAmbiguous && <p className="text-[11px] text-muted-foreground">{t.noAutoMatchHint}</p>}
    </div>
  );
}

function tUndoConfirmFor(matchType: MatchType, t: { confirmUndo: Record<string, string> }): string {
  return t.confirmUndo[matchType] ?? t.confirmUndo.created;
}

/* ─────────────────────────── shells / helpers ─────────────────────────── */

function ModeShell({ title, backLabel, onBack, children }: { title: string; backLabel: string; onBack: () => void; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-foreground">{title}</p>
        <Button variant="ghost" size="sm" onClick={onBack}>
          {backLabel}
        </Button>
      </div>
      {children}
    </div>
  );
}

function DisabledWithTooltip({ label, tooltip, icon }: { label: string; tooltip: string; icon: React.ReactNode }) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span tabIndex={0} className="inline-flex">
            <Button variant="outline" size="sm" className="w-full gap-1.5" disabled>
              {icon}
              {label}
            </Button>
          </span>
        </TooltipTrigger>
        <TooltipContent>{tooltip}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/* ─────────────────────────── busca manual ─────────────────────────── */

function SearchMode({ entry, mutations, onBack }: { entry: ReconEntry; mutations: ReconMutations; onBack: () => void }) {
  const { locale } = useAppLocaleContext();
  const t = MESSAGES[locale].app.finance.reconciliation.actionPanel;
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');

  useEffect(() => {
    const id = setTimeout(() => setDebounced(query.trim()), 300);
    return () => clearTimeout(id);
  }, [query]);

  const { data, isFetching } = useQuery({
    queryKey: ['recon-search-candidates', entry.id, debounced],
    queryFn: () => mutations.searchCandidates(entry.id, debounced || undefined),
  });

  return (
    <ModeShell title={t.destinations.search} onBack={onBack} backLabel={t.candidatesBack}>
      <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t.search.placeholder} />
      <p className="text-[11px] text-muted-foreground">{t.search.toleranceHint}</p>

      {isFetching ? (
        <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
      ) : (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{t.search.sectionRealized}</p>
            {(data?.realized ?? []).length === 0 ? (
              <p className="text-xs text-muted-foreground">{t.search.emptyRealized}</p>
            ) : (
              data!.realized.map((c) => (
                <CandidateRow
                  key={c.id}
                  candidate={c}
                  actionLabel={t.search.matchButton}
                  isPending={mutations.matchExisting.isPending}
                  onAction={() =>
                    mutations.matchExisting.mutate({ entryId: entry.id, financialTransactionId: c.id, allowAnyDate: true })
                  }
                />
              ))
            )}
          </div>
          <div className="space-y-1.5">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{t.search.sectionOpenBills}</p>
            {(data?.open_bills ?? []).length === 0 ? (
              <p className="text-xs text-muted-foreground">{t.search.emptyOpenBills}</p>
            ) : (
              data!.open_bills.map((c) => (
                <CandidateRow
                  key={c.id}
                  candidate={c}
                  actionLabel={t.search.settleButton}
                  isPending={mutations.settleTransaction.isPending}
                  onAction={() => mutations.settleTransaction.mutate({ entryId: entry.id, financialTransactionId: c.id })}
                />
              ))
            )}
          </div>
        </div>
      )}
    </ModeShell>
  );
}

/* ─────────────────────────── criar lançamento ─────────────────────────── */

function CreateMode({
  entry,
  isCredit,
  mutations,
  onBack,
}: {
  entry: ReconEntry;
  isCredit: boolean;
  mutations: ReconMutations;
  onBack: () => void;
}) {
  const { locale } = useAppLocaleContext();
  const t = MESSAGES[locale].app.finance.reconciliation.actionPanel.create;
  const { categories } = useFinancialCategories();
  const { customers } = useCustomers();
  const { suppliers } = useSuppliers();

  const compatible = useMemo(
    () => filterCategoriesByTransactionType(categories, isCredit ? 'entrada' : 'saida'),
    [categories, isCredit],
  );
  const tree = useMemo(() => buildCategoryTree(compatible), [compatible]);
  const categoryGroups: SearchableSelectGroup[] = useMemo(
    () =>
      tree.roots.map((root) => ({
        heading: root.name,
        options: [
          { value: root.id, label: root.name },
          ...tree.childrenOf(root.id).map((child) => ({ value: child.id, label: child.name })),
        ],
      })),
    [tree],
  );

  const [categoryId, setCategoryId] = useState('');
  const [description, setDescription] = useState(entry.memo || entry.name || '');
  const [costCenterId, setCostCenterId] = useState<string | null>(null);
  const [customerId, setCustomerId] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [notes, setNotes] = useState('');

  const canSubmit = categoryId.trim().length > 0 && description.trim().length > 0;

  return (
    <ModeShell title={t.title} onBack={onBack} backLabel={MESSAGES[locale].app.finance.reconciliation.actionPanel.candidatesBack}>
      <div className="space-y-3">
        <div>
          <Label>{t.categoryLabel}</Label>
          <SearchableSelect
            groups={categoryGroups}
            value={categoryId}
            onValueChange={setCategoryId}
            placeholder={t.categoryPlaceholder}
          />
        </div>
        <div>
          <Label>{t.descriptionLabel}</Label>
          <Input value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div>
          <Label>{t.costCenterLabel}</Label>
          <CostCenterSelect value={costCenterId} onValueChange={setCostCenterId} />
        </div>
        {isCredit ? (
          <div>
            <Label>{t.customerLabel}</Label>
            <CustomerSelectField customers={customers} value={customerId} onValueChange={setCustomerId} />
          </div>
        ) : (
          <div>
            <Label>{t.supplierLabel}</Label>
            <SupplierSelectField suppliers={suppliers} value={supplierId} onValueChange={setSupplierId} />
          </div>
        )}
        <div>
          <Label>{t.notesLabel}</Label>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
        </div>
        <p className="text-[11px] text-muted-foreground">{t.adjustmentHint}</p>
        <Button
          className="w-full"
          disabled={!canSubmit || mutations.createTransaction.isPending}
          onClick={() =>
            mutations.createTransaction.mutate({
              entryId: entry.id,
              categoryId,
              description,
              costCenterId,
              customerId: customerId || null,
              supplierId: supplierId || null,
              notes: notes || null,
            })
          }
        >
          {mutations.createTransaction.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {t.submit}
        </Button>
      </div>
    </ModeShell>
  );
}

/* ─────────────────────────── transferência ─────────────────────────── */

function TransferMode({
  entry,
  accountId,
  mutations,
  onBack,
}: {
  entry: ReconEntry;
  accountId: string;
  mutations: ReconMutations;
  onBack: () => void;
}) {
  const { locale, currency } = useAppLocaleContext();
  const t = MESSAGES[locale].app.finance.reconciliation.actionPanel;
  const tt = t.transfer;
  const { accounts } = useFinancialAccounts();
  const otherAccounts = useMemo(
    () => accounts.filter((a) => a.is_active && a.type !== 'cartao' && a.id !== accountId),
    [accounts, accountId],
  );
  const [otherAccountId, setOtherAccountId] = useState('');
  const [description, setDescription] = useState('');

  const { data: legsData } = useQuery({
    queryKey: ['recon-transfer-legs', entry.id],
    queryFn: () => mutations.listTransferLegs(entry.id),
  });

  return (
    <ModeShell title={tt.title} onBack={onBack} backLabel={t.candidatesBack}>
      <div className="space-y-3">
        {(legsData?.legs ?? []).length > 0 && (
          <div className="space-y-2 rounded-md border border-warning/40 bg-warning/5 p-2.5">
            <p className="text-xs font-medium text-foreground">{tt.existingLegTitle}</p>
            <p className="text-[11px] text-muted-foreground">{tt.existingLegHint}</p>
            {legsData!.legs.map((leg) => (
              <div key={leg.id} className="flex items-center justify-between gap-2 rounded-md border bg-card p-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{leg.other_account_name}</p>
                  <p className="text-xs text-muted-foreground">{formatDateBR(leg.transaction_date)}</p>
                </div>
                <p className="shrink-0 text-sm font-semibold tabular-nums">{formatMoney(leg.amount, currency, locale)}</p>
                <Button
                  size="sm"
                  className="shrink-0 bg-success text-success-foreground hover:bg-success/90"
                  disabled={mutations.createTransfer.isPending}
                  onClick={() => mutations.createTransfer.mutate({ entryId: entry.id, otherAccountId: leg.other_account_id })}
                >
                  {tt.matchExistingButton}
                </Button>
              </div>
            ))}
          </div>
        )}

        <div>
          <Label>{tt.otherAccountLabel}</Label>
          <SearchableSelect
            options={otherAccounts.map((a) => ({ value: a.id, label: a.name }))}
            value={otherAccountId}
            onValueChange={setOtherAccountId}
            placeholder={tt.otherAccountPlaceholder}
          />
        </div>
        <div>
          <Label>{MESSAGES[locale].app.finance.reconciliation.actionPanel.create.descriptionLabel}</Label>
          <Input value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <p className="text-[11px] text-muted-foreground">{tt.notDRE}</p>
        <Button
          className="w-full"
          disabled={!otherAccountId || mutations.createTransfer.isPending}
          onClick={() => mutations.createTransfer.mutate({ entryId: entry.id, otherAccountId, description: description || null })}
        >
          {mutations.createTransfer.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {tt.submit}
        </Button>
      </div>
    </ModeShell>
  );
}

/* ─────────────────────────── fatura de cartão ─────────────────────────── */

function CardBillMode({ entry, mutations, onBack }: { entry: ReconEntry; mutations: ReconMutations; onBack: () => void }) {
  const { locale, currency } = useAppLocaleContext();
  const t = MESSAGES[locale].app.finance.reconciliation.actionPanel;
  const tb = t.cardBill;
  const [confirmingBillId, setConfirmingBillId] = useState<string | null>(null);

  const { data, isFetching } = useQuery<ListCardBillsResult>({
    queryKey: ['recon-card-bills', entry.id],
    queryFn: () => mutations.listCardBills(entry.id),
  });

  const pay = (billId: string) => mutations.payCardBill.mutate({ entryId: entry.id, billId });

  return (
    <ModeShell title={tb.title} onBack={onBack} backLabel={t.candidatesBack}>
      {isFetching ? (
        <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
      ) : (data?.bills ?? []).length === 0 ? (
        <p className="text-sm text-muted-foreground">{tb.empty}</p>
      ) : (
        <div className="space-y-2">
          {data!.bills.map((bill) => (
            <div key={bill.id} className="flex items-center justify-between gap-2 rounded-md border bg-card p-2.5">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">{formatMonthYear(bill.reference_month)}</p>
                <p className="text-xs text-muted-foreground">{tb.remaining.replace('{amount}', formatMoney(bill.remaining, currency, locale))}</p>
              </div>
              <Button
                size="sm"
                className="shrink-0 bg-success text-success-foreground hover:bg-success/90"
                disabled={mutations.payCardBill.isPending}
                onClick={() => (bill.covers_remaining ? pay(bill.id) : setConfirmingBillId(bill.id))}
              >
                {mutations.payCardBill.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                {tb.submit}
              </Button>
            </div>
          ))}
        </div>
      )}

      <AlertDialog open={!!confirmingBillId} onOpenChange={(o) => !o && setConfirmingBillId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{tb.partialWarningTitle}</AlertDialogTitle>
            <AlertDialogDescription>{tb.partialWarningDescription}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.cancelButton}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirmingBillId) pay(confirmingBillId);
                setConfirmingBillId(null);
              }}
            >
              {tb.confirmPartial}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ModeShell>
  );
}

/* ─────────────────────────── vale de funcionário ─────────────────────────── */

function EmployeeMode({ entry, mutations, onBack }: { entry: ReconEntry; mutations: ReconMutations; onBack: () => void }) {
  const { locale } = useAppLocaleContext();
  const t = MESSAGES[locale].app.finance.reconciliation.actionPanel;
  const te = t.employee;
  const { employees } = useEmployees();
  const activeEmployees = useMemo(() => employees.filter((e) => e.is_active), [employees]);

  const [employeeId, setEmployeeId] = useState('');
  const [description, setDescription] = useState('');
  const [costCenterId, setCostCenterId] = useState<string | null>(null);
  // Gerada UMA vez por abertura deste modo e REUSADA em todo retry — a RPC é
  // idempotente por esta chave; trocar a chave no retry cria um 2º vale.
  const [idempotencyKey] = useState(() => crypto.randomUUID());

  const selectedEmployee = activeEmployees.find((e) => e.id === employeeId) ?? null;
  const defaultDescription = selectedEmployee ? `Vale - ${selectedEmployee.name}` : '';

  return (
    <ModeShell title={te.title} onBack={onBack} backLabel={t.candidatesBack}>
      <div className="space-y-3">
        <div>
          <Label>{te.employeeLabel}</Label>
          <SearchableSelect
            options={activeEmployees.map((e) => ({ value: e.id, label: e.name }))}
            value={employeeId}
            onValueChange={setEmployeeId}
          />
        </div>
        <div>
          <Label>{te.descriptionLabel}</Label>
          <Input value={description || defaultDescription} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div>
          <Label>{te.costCenterLabel}</Label>
          <CostCenterSelect value={costCenterId} onValueChange={setCostCenterId} />
        </div>
        <p className="text-[11px] text-muted-foreground">{te.payrollHint}</p>
        <Button
          className="w-full"
          disabled={!employeeId || mutations.createEmployeeMovement.isPending}
          onClick={() =>
            mutations.createEmployeeMovement.mutate({
              entryId: entry.id,
              employeeId,
              idempotencyKey,
              description: description || defaultDescription,
              costCenterId,
            })
          }
        >
          {mutations.createEmployeeMovement.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {te.submit}
        </Button>
      </div>
    </ModeShell>
  );
}

/* ═══════════════════════════ MODO FATURA DE CARTÃO ═══════════════════════════
 * 20261018140000_conciliacao_fatura_cartao.sql. A invariante que não pode
 * quebrar: nenhum caminho abaixo escreve `is_paid = true` numa compra —
 * "dar baixa" simplesmente não existe aqui.
 */

/** Idle (linha pendente) do modo cartão: sugestão de casamento + os destinos próprios. */
function CardIdleDestinations({
  entry,
  isCredit,
  absAmount,
  mutations,
  onClose,
  onPickMode,
}: {
  entry: ReconEntry;
  isCredit: boolean;
  absAmount: number;
  mutations: ReconMutations;
  onClose?: () => void;
  onPickMode: (mode: Mode) => void;
}) {
  const { locale, currency } = useAppLocaleContext();
  const t = MESSAGES[locale].app.finance.reconciliation.actionPanel;
  const tc = t.card;

  const purchase = entry.card_purchase;
  const hasPurchaseSuggestion = !isCredit && !!purchase.suggested_transaction_id && !purchase.ambiguous;
  const isPurchaseAmbiguous = !isCredit && purchase.ambiguous;
  const suggestedPurchase = hasPurchaseSuggestion
    ? purchase.candidates.find((c) => c.id === purchase.suggested_transaction_id) ?? purchase.candidates[0] ?? null
    : null;

  const payment = entry.card_payment;
  // `card_payment` não tem `ambiguous` no contrato: `suggested_transaction_id`
  // só vem preenchido quando há EXATAMENTE 1 candidato, então `candidate_count
  // >= 2` já é a condição de ambiguidade (ver _reconcile_card_payment_candidates).
  const hasPaymentSuggestion = isCredit && !!payment.suggested_transaction_id;
  const isPaymentAmbiguous = isCredit && payment.candidate_count >= 2;
  const suggestedPayment = hasPaymentSuggestion
    ? payment.candidates.find((c) => c.id === payment.suggested_transaction_id) ?? payment.candidates[0] ?? null
    : null;

  const cardDestinations = getOfferedDestinations('card', isCredit);

  return (
    <div className="space-y-2">
      {onClose && (
        <Button variant="ghost" size="sm" className="mb-1 -ml-2 text-muted-foreground" onClick={onClose}>
          <X className="mr-1.5 h-3.5 w-3.5" />
          {t.close}
        </Button>
      )}

      {hasPurchaseSuggestion && (
        <div className="space-y-2 rounded-md border bg-muted/30 p-2.5">
          <p className="text-xs font-medium text-foreground">{tc.suggestionPurchaseTitle}</p>
          {suggestedPurchase ? (
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm text-foreground">{suggestedPurchase.description || '—'}</p>
                <p className="text-xs text-muted-foreground">{formatDateBR(suggestedPurchase.transaction_date)}</p>
              </div>
              <p className="shrink-0 text-sm font-semibold tabular-nums text-destructive">
                {formatMoney(suggestedPurchase.amount, currency, locale)}
              </p>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">{t.suggestionValueOnly.replace('{amount}', formatMoney(absAmount, currency, locale))}</p>
          )}
          <Button
            size="sm"
            className="w-full bg-success text-success-foreground hover:bg-success/90"
            disabled={mutations.matchCardPurchase.isPending}
            onClick={() =>
              mutations.matchCardPurchase.mutate({ entryId: entry.id, financialTransactionId: purchase.suggested_transaction_id! })
            }
          >
            {mutations.matchCardPurchase.isPending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Check className="mr-1 h-3.5 w-3.5" />}
            {suggestedPurchase ? t.confirmMatchWith.replace('{description}', suggestedPurchase.description || '—') : t.confirmMatch}
          </Button>
        </div>
      )}

      {isPurchaseAmbiguous && (
        <div className="space-y-2 rounded-md border bg-muted/30 p-2.5">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
            <p className="text-xs text-muted-foreground">
              {tc.ambiguousPurchaseDescription
                .replace('{count}', String(purchase.candidate_count))
                .replace('{amount}', formatMoney(absAmount, currency, locale))}
            </p>
          </div>
          {purchase.candidates.length > 0 && (
            <Button size="sm" className="w-full bg-success text-success-foreground hover:bg-success/90" onClick={() => onPickMode('cardPurchaseCandidates')}>
              {tc.chooseMatchPurchase}
            </Button>
          )}
        </div>
      )}

      {hasPaymentSuggestion && (
        <div className="space-y-2 rounded-md border bg-muted/30 p-2.5">
          <p className="text-xs font-medium text-foreground">{tc.suggestionPaymentTitle}</p>
          {suggestedPayment ? (
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm text-foreground">{suggestedPayment.description || '—'}</p>
                <p className="text-xs text-muted-foreground">{formatDateBR(suggestedPayment.paid_date || suggestedPayment.transaction_date)}</p>
              </div>
              <p className="shrink-0 text-sm font-semibold tabular-nums text-success">
                {formatMoney(suggestedPayment.amount, currency, locale)}
              </p>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">{t.suggestionValueOnly.replace('{amount}', formatMoney(absAmount, currency, locale))}</p>
          )}
          <Button
            size="sm"
            className="w-full bg-success text-success-foreground hover:bg-success/90"
            disabled={mutations.matchCardBillPayment.isPending}
            onClick={() =>
              mutations.matchCardBillPayment.mutate({ entryId: entry.id, financialTransactionId: payment.suggested_transaction_id! })
            }
          >
            {mutations.matchCardBillPayment.isPending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Check className="mr-1 h-3.5 w-3.5" />}
            {suggestedPayment ? t.confirmMatchWith.replace('{description}', suggestedPayment.description || '—') : t.confirmMatch}
          </Button>
        </div>
      )}

      {isPaymentAmbiguous && (
        <div className="space-y-2 rounded-md border bg-muted/30 p-2.5">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
            <p className="text-xs text-muted-foreground">
              {tc.ambiguousPaymentDescription
                .replace('{count}', String(payment.candidate_count))
                .replace('{amount}', formatMoney(absAmount, currency, locale))}
            </p>
          </div>
          {payment.candidates.length > 0 && (
            <Button size="sm" className="w-full bg-success text-success-foreground hover:bg-success/90" onClick={() => onPickMode('cardPaymentCandidates')}>
              {tc.chooseMatchPayment}
            </Button>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {cardDestinations.includes('card_purchase_create') && (
          <Button variant="outline" size="sm" className="gap-1.5 hover:bg-primary hover:text-primary-foreground hover:border-primary" onClick={() => onPickMode('cardPurchaseCreate')}>
            <PlusCircle className="h-3.5 w-3.5" />
            {tc.destinations.createPurchase}
          </Button>
        )}

        {cardDestinations.includes('card_payment_pay') && (
          <Button variant="outline" size="sm" className="gap-1.5 hover:bg-info hover:text-white hover:border-info" onClick={() => onPickMode('cardPayBill')}>
            <CreditCard className="h-3.5 w-3.5" />
            {tc.destinations.payBill}
          </Button>
        )}

        <Button variant="outline" size="sm" className="gap-1.5 hover:bg-success hover:text-white hover:border-success" onClick={() => onPickMode('cardSearch')}>
          <Search className="h-3.5 w-3.5" />
          {tc.destinations.search}
        </Button>

        <Button
          variant="outline"
          size="sm"
          className={cn('gap-1.5 hover:bg-warning hover:text-white hover:border-warning', entry.sign_suspect && !entry.sign_flipped && 'border-warning text-warning')}
          disabled={mutations.flipSign.isPending}
          onClick={() => mutations.flipSign.mutate({ entryIds: [entry.id], flipped: !entry.sign_flipped })}
        >
          {mutations.flipSign.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          {t.destinations.flipSign}
        </Button>

        <Button
          variant="destructive-ghost"
          size="sm"
          className="gap-1.5"
          disabled={mutations.ignoreEntry.isPending}
          onClick={() => mutations.ignoreEntry.mutate({ entryId: entry.id })}
        >
          {mutations.ignoreEntry.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Ban className="h-3.5 w-3.5" />}
          {t.destinations.ignore}
        </Button>
      </div>

      {!isCredit && !hasPurchaseSuggestion && !isPurchaseAmbiguous && (
        <p className="text-[11px] text-muted-foreground">{tc.noAutoMatchPurchaseHint}</p>
      )}
      {isCredit && !hasPaymentSuggestion && !isPaymentAmbiguous && (
        <p className="text-[11px] text-muted-foreground">{tc.noAutoMatchPaymentHint}</p>
      )}
    </div>
  );
}

/** "Escolher compra"/"Escolher pagamento" — lista de candidatos ambíguos. */
function CardMatchMode({
  kind,
  entry,
  mutations,
  onBack,
}: {
  kind: 'purchase' | 'payment';
  entry: ReconEntry;
  mutations: ReconMutations;
  onBack: () => void;
}) {
  const { locale } = useAppLocaleContext();
  const t = MESSAGES[locale].app.finance.reconciliation.actionPanel;
  const tc = t.card;
  const candidates = kind === 'purchase' ? entry.card_purchase.candidates : entry.card_payment.candidates;
  const isPending = kind === 'purchase' ? mutations.matchCardPurchase.isPending : mutations.matchCardBillPayment.isPending;

  return (
    <ModeShell title={kind === 'purchase' ? tc.chooseMatchPurchase : tc.chooseMatchPayment} onBack={onBack} backLabel={t.candidatesBack}>
      <div className="space-y-2">
        {candidates.map((c) => (
          <CandidateRow
            key={c.id}
            candidate={c}
            actionLabel={t.confirmMatch}
            isPending={isPending}
            onAction={() =>
              kind === 'purchase'
                ? mutations.matchCardPurchase.mutate({ entryId: entry.id, financialTransactionId: c.id })
                : mutations.matchCardBillPayment.mutate({ entryId: entry.id, financialTransactionId: c.id })
            }
          />
        ))}
      </div>
    </ModeShell>
  );
}

/* ─────────────────────────── lançar a compra que falta ─────────────────────────── */

function CardCreatePurchaseMode({
  entry,
  mutations,
  onBack,
  onDone,
}: {
  entry: ReconEntry;
  mutations: ReconMutations;
  onBack: () => void;
  onDone?: () => void;
}) {
  const { locale, currency } = useAppLocaleContext();
  const t = MESSAGES[locale].app.finance.reconciliation.actionPanel;
  const tc = t.card.createPurchase;
  const { categories } = useFinancialCategories();
  const { suppliers } = useSuppliers();

  // Compra de cartão é SEMPRE 'saida' — 'ambos' entra também (63 categorias
  // ativas em produção; recusá-las já foi bug nosso em reconcile_create_transaction).
  const compatible = useMemo(() => filterCategoriesByTransactionType(categories, 'saida'), [categories]);
  const tree = useMemo(() => buildCategoryTree(compatible), [compatible]);
  const categoryGroups: SearchableSelectGroup[] = useMemo(
    () =>
      tree.roots.map((root) => ({
        heading: root.name,
        options: [
          { value: root.id, label: root.name },
          ...tree.childrenOf(root.id).map((child) => ({ value: child.id, label: child.name })),
        ],
      })),
    [tree],
  );

  const [categoryId, setCategoryId] = useState('');
  const [description, setDescription] = useState(entry.memo || entry.name || '');
  const [costCenterId, setCostCenterId] = useState<string | null>(null);
  const [supplierId, setSupplierId] = useState('');
  const [notes, setNotes] = useState('');
  const [result, setResult] = useState<CreateCardPurchaseResult | null>(null);

  const canSubmit = categoryId.trim().length > 0 && description.trim().length > 0;

  // 🔴 `credit_card_bill_date` NUNCA é calculado aqui nem mandado pro servidor:
  // é o retorno de `reconcile_create_card_purchase` (calculado no servidor)
  // que mostramos abaixo — a informação que o cliente mais quer conferir.
  if (result) {
    return (
      <ModeShell title={tc.title} onBack={onBack} backLabel={t.candidatesBack}>
        <div className="space-y-3 rounded-md border border-success/40 bg-success/5 p-3">
          <p className="flex items-center gap-2 text-sm font-semibold text-success">
            <CheckCircle2 className="h-4 w-4" />
            {tc.resultTitle}
          </p>
          <p className="text-sm text-foreground">{tc.resultBillLabel.replace('{month}', formatMonthYear(result.credit_card_bill_date))}</p>
          <p className="text-sm text-muted-foreground">{tc.resultAmountLabel.replace('{amount}', formatMoney(result.amount, currency, locale))}</p>
          <Button className="w-full" onClick={onDone ?? onBack}>
            {tc.resultClose}
          </Button>
        </div>
      </ModeShell>
    );
  }

  return (
    <ModeShell title={tc.title} onBack={onBack} backLabel={t.candidatesBack}>
      <div className="space-y-3">
        <div>
          <Label>{tc.categoryLabel}</Label>
          <SearchableSelect
            groups={categoryGroups}
            value={categoryId}
            onValueChange={setCategoryId}
            placeholder={tc.categoryPlaceholder}
          />
        </div>
        <div>
          <Label>{tc.descriptionLabel}</Label>
          <Input value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div>
          <Label>{tc.costCenterLabel}</Label>
          <CostCenterSelect value={costCenterId} onValueChange={setCostCenterId} />
        </div>
        <div>
          <Label>{tc.supplierLabel}</Label>
          <SupplierSelectField suppliers={suppliers} value={supplierId} onValueChange={setSupplierId} />
        </div>
        <div>
          <Label>{tc.notesLabel}</Label>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
        </div>
        <Button
          className="w-full"
          disabled={!canSubmit || mutations.createCardPurchase.isPending}
          onClick={() =>
            mutations.createCardPurchase.mutate(
              {
                entryId: entry.id,
                categoryId,
                description,
                costCenterId,
                supplierId: supplierId || null,
                notes: notes || null,
              },
              { onSuccess: (res) => setResult(res) },
            )
          }
        >
          {mutations.createCardPurchase.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {tc.submit}
        </Button>
      </div>
    </ModeShell>
  );
}

/* ─────────────────────────── busca manual (compras + pagamentos de fatura) ─────────────────────────── */

function CardSearchMode({ entry, mutations, onBack }: { entry: ReconEntry; mutations: ReconMutations; onBack: () => void }) {
  const { locale } = useAppLocaleContext();
  const t = MESSAGES[locale].app.finance.reconciliation.actionPanel;
  const tc = t.card.search;
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');

  useEffect(() => {
    const id = setTimeout(() => setDebounced(query.trim()), 300);
    return () => clearTimeout(id);
  }, [query]);

  const { data, isFetching } = useQuery({
    queryKey: ['recon-search-card-purchases', entry.id, debounced],
    queryFn: () => mutations.searchCardPurchases(entry.id, debounced || undefined),
  });

  return (
    <ModeShell title={tc.placeholder} onBack={onBack} backLabel={t.candidatesBack}>
      <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={tc.placeholder} />

      {isFetching ? (
        <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
      ) : (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{tc.sectionPurchases}</p>
            {(data?.purchases ?? []).length === 0 ? (
              <p className="text-xs text-muted-foreground">{tc.emptyPurchases}</p>
            ) : (
              data!.purchases.map((c) => (
                <CandidateRow
                  key={c.id}
                  candidate={c}
                  actionLabel={tc.matchButton}
                  isPending={mutations.matchCardPurchase.isPending}
                  onAction={() =>
                    mutations.matchCardPurchase.mutate({ entryId: entry.id, financialTransactionId: c.id, allowAnyDate: true })
                  }
                />
              ))
            )}
          </div>
          <div className="space-y-1.5">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{tc.sectionPayments}</p>
            {(data?.payments ?? []).length === 0 ? (
              <p className="text-xs text-muted-foreground">{tc.emptyPayments}</p>
            ) : (
              data!.payments.map((c) => (
                <CandidateRow
                  key={c.id}
                  candidate={c}
                  actionLabel={tc.matchButton}
                  isPending={mutations.matchCardBillPayment.isPending}
                  onAction={() => mutations.matchCardBillPayment.mutate({ entryId: entry.id, financialTransactionId: c.id })}
                />
              ))
            )}
          </div>
        </div>
      )}
    </ModeShell>
  );
}

/* ─────────────────────────── registrar o pagamento da fatura ─────────────────────────── */

function CardPayBillMode({
  entry,
  mutations,
  onBack,
}: {
  entry: ReconEntry;
  mutations: ReconMutations;
  onBack: () => void;
}) {
  const { locale, currency } = useAppLocaleContext();
  const t = MESSAGES[locale].app.finance.reconciliation.actionPanel;
  const tc = t.card.payBill;
  const { accounts } = useFinancialAccounts();
  // A conta pagadora nunca é um cartão (`pay_credit_card_bill` recusa
  // `v_payer_type = 'cartao'`) — e nunca É este cartão, que já está fora por
  // ser `type === 'cartao'`.
  const payerAccounts = useMemo(() => accounts.filter((a) => a.is_active && a.type !== 'cartao'), [accounts]);

  const [payerAccountId, setPayerAccountId] = useState('');
  const [confirmingBillId, setConfirmingBillId] = useState<string | null>(null);

  const { data, isFetching } = useQuery<ListCardBillsResult>({
    queryKey: ['recon-card-bills', entry.id],
    queryFn: () => mutations.listCardBills(entry.id),
  });

  const pay = (billId: string) => {
    if (!payerAccountId) return;
    mutations.cardPayBill.mutate({ entryId: entry.id, billId, paymentAccountId: payerAccountId });
  };

  return (
    <ModeShell title={tc.title} onBack={onBack} backLabel={t.candidatesBack}>
      <div className="space-y-3">
        <div>
          <Label>{tc.payerAccountLabel}</Label>
          <SearchableSelect
            options={payerAccounts.map((a) => ({ value: a.id, label: a.name }))}
            value={payerAccountId}
            onValueChange={setPayerAccountId}
            placeholder={tc.payerAccountPlaceholder}
          />
        </div>

        {isFetching ? (
          <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
        ) : (data?.bills ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">{tc.empty}</p>
        ) : (
          <div className="space-y-2">
            {data!.bills.map((bill) => (
              <div key={bill.id} className="flex items-center justify-between gap-2 rounded-md border bg-card p-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{formatMonthYear(bill.reference_month)}</p>
                  <p className="text-xs text-muted-foreground">{tc.remaining.replace('{amount}', formatMoney(bill.remaining, currency, locale))}</p>
                </div>
                <Button
                  size="sm"
                  className="shrink-0 bg-success text-success-foreground hover:bg-success/90"
                  disabled={!payerAccountId || mutations.cardPayBill.isPending}
                  onClick={() => (bill.covers_remaining ? pay(bill.id) : setConfirmingBillId(bill.id))}
                >
                  {mutations.cardPayBill.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                  {tc.submit}
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      <AlertDialog open={!!confirmingBillId} onOpenChange={(o) => !o && setConfirmingBillId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{tc.partialWarningTitle}</AlertDialogTitle>
            <AlertDialogDescription>{tc.partialWarningDescription}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.cancelButton}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirmingBillId) pay(confirmingBillId);
                setConfirmingBillId(null);
              }}
            >
              {tc.confirmPartial}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ModeShell>
  );
}
