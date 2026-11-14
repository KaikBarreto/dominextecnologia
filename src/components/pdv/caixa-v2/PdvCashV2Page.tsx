import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Banknote, DollarSign, Eye, EyeOff, History, Home, MoreHorizontal, PlusCircle, ReceiptText, RefreshCw, Scale, Store, TrendingDown, TrendingUp, Vault } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { NoticeBanner } from '@/components/ui/NoticeBanner';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { PdvCashIndicators } from '@/components/pdv/caixa/PdvCashIndicators';
import { useFinancialAccounts } from '@/hooks/useFinancialAccounts';
import { usePdvCashSessionDetailV2 } from '@/hooks/usePdvCashSessionDetailV2';
import { usePdvReceiptSettings } from '@/hooks/usePdvReceiptSettings';
import { useToast } from '@/hooks/use-toast';
import { openPdvOrderReceipt } from '@/components/pdv/receipt/PdvOrderReceiptButton';
import { DEFAULT_PDV_RECEIPT_SETTINGS, type PdvReceiptFormat } from '@/lib/pdv/receipt/model';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { useLocaleFormatters } from '@/lib/format/hooks';
import { MESSAGES } from '@/lib/i18n/messages';
import { localizeAppPath } from '@/lib/i18n/appRouteSlugs';
import {
  usePdvCashSessionsV2,
  usePdvCashV2AttemptRegistry,
  type PdvCashCloseV2Result,
  type PdvCashHistoryFilters,
  type PdvCashV2EventKind,
} from '@/hooks/usePdvCashSessionsV2';
import { PdvCashV2CloseDialog, PdvCashV2EventDialog, PdvCashV2OpenDialog } from './PdvCashV2Dialogs';
import { PdvFirstCashSetupDialog } from '@/components/pdv/caixa/PdvFirstCashSetupDialog';
import { buildPdvSaleCashPath } from './pdvSaleContext';
import { buildPdvPurchaseCashPath } from './pdvPurchaseContext';
import { cn } from '@/lib/utils';

interface Props {
  cashAccountId: string | null;
  allowNewSessions: boolean;
  userId: string;
  canManageOthers: boolean;
  canViewTreasury: boolean;
  canManageFinance: boolean;
  canCoverPdvOrders: boolean;
  canManageSettings: boolean;
}

const VALUES_VISIBLE_KEY = 'pdv_cash_values_visible';
type CashMovementEntry = ReturnType<typeof usePdvCashSessionDetailV2>['entries'][number];

export function PdvCashV2Page({ cashAccountId, allowNewSessions, userId, canManageOthers, canViewTreasury, canManageFinance, canManageSettings }: Props) {
  const navigate = useNavigate();
  const { locale } = useAppLocaleContext();
  const { money, dateTime } = useLocaleFormatters();
  const texts = MESSAGES[locale].app.pdv.cashPanel;
  const attemptRegistry = usePdvCashV2AttemptRegistry();
  const historyFilters = useMemo<PdvCashHistoryFilters>(() => ({ terminalId: null, operatorId: null, page: 0, pageSize: 1 }), []);
  const cash = usePdvCashSessionsV2({ enabled: true, cashAccountId, userId, canManageOthers, history: historyFilters });
  const accountsState = useFinancialAccounts();
  const receiptSettings = usePdvReceiptSettings();
  const [selected, setSelected] = useState<'home' | string>('home');
  const [openDialog, setOpenDialog] = useState(false);
  const [firstCashSetupOpen, setFirstCashSetupOpen] = useState(false);
  const [eventKind, setEventKind] = useState<PdvCashV2EventKind | null>(null);
  const [closeDialog, setCloseDialog] = useState(false);
  const [lastClose, setLastClose] = useState<PdvCashCloseV2Result | null>(null);
  const [closedElsewhereNotice, setClosedElsewhereNotice] = useState<string | null>(null);
  const [valuesVisible, setValuesVisible] = useState(true);

  const ownSession = cash.openSessions.find((session) => session.openedBy === userId) ?? null;
  const focusedSession = selected === 'home' ? null : cash.openSessions.find((session) => session.id === selected) ?? null;
  const detail = usePdvCashSessionDetailV2(focusedSession?.id ?? null);

  useEffect(() => {
    try { if (localStorage.getItem(VALUES_VISIBLE_KEY) === '0') setValuesVisible(false); } catch { /* opcional */ }
  }, []);
  useEffect(() => {
    if (!canManageOthers && ownSession && selected === 'home') setSelected(ownSession.id);
  }, [canManageOthers, ownSession, selected]);
  useEffect(() => {
    if (selected !== 'home' && !cash.openSessions.some((session) => session.id === selected)) {
      setClosedElsewhereNotice('O caixa selecionado foi fechado ou deixou de estar disponível. Escolha outro caixa para continuar.');
      setSelected(canManageOthers ? 'home' : (ownSession?.id ?? 'home'));
    }
  }, [canManageOthers, cash.openSessions, ownSession?.id, selected]);

  const snapshot = cash.snapshot;
  const currentUserHasSession = Boolean(ownSession);
  const canOpen = allowNewSessions && Boolean(cashAccountId) && !currentUserHasSession && cash.terminals.length > 0 && !snapshot?.reconciliationRequired;
  const canStartOpening = canOpen || (
    allowNewSessions
    && Boolean(cashAccountId)
    && !currentUserHasSession
    && cash.terminals.length === 0
    && canManageSettings
    && !snapshot?.reconciliationRequired
  );
  const terminalName = focusedSession ? cashDisplayName(cash.terminals.find((item) => item.id === focusedSession.terminalId)) : null;
  const focusedTerminal = focusedSession
    ? cash.terminals.find((item) => item.id === focusedSession.terminalId) ?? null
    : null;
  const canAct = Boolean(focusedSession && (focusedSession.openedBy === userId || canManageOthers));
  const salePath = focusedSession && focusedTerminal?.stockId
    ? buildPdvSaleCashPath(localizeAppPath('/pdv/venda', locale), {
        sessionId: focusedSession.id,
        terminalId: focusedTerminal.id,
        stockId: focusedTerminal.stockId,
      })
    : null;
  const purchasePath = focusedSession && focusedTerminal?.stockId
    ? buildPdvPurchaseCashPath(localizeAppPath('/pdv/compra', locale), {
        sessionId: focusedSession.id,
        terminalId: focusedTerminal.id,
        stockId: focusedTerminal.stockId,
      })
    : null;
  const accountLines = useMemo(() => (canViewTreasury ? accountsState.accounts : [])
    .filter((account) => account.is_active && account.type !== 'cartao' && account.id !== cashAccountId)
    .map((account) => ({ id: account.id, name: account.name, balance: accountsState.balances[account.id] ?? Number(account.initial_balance ?? 0) })),
  [accountsState.accounts, accountsState.balances, canViewTreasury, cashAccountId]);
  const accountsTotal = useMemo(() => accountLines.reduce((total, account) => total + account.balance, 0), [accountLines]);

  function toggleValues() {
    setValuesVisible((current) => {
      const next = !current;
      try { localStorage.setItem(VALUES_VISIBLE_KEY, next ? '1' : '0'); } catch { /* opcional */ }
      return next;
    });
  }

  if (cash.isLoading) return <div className="space-y-5"><PageHeader title="Caixa" subtitle="Carregando os caixas abertos" icon={Banknote} /><Skeleton className="h-11 w-full" /><div className="grid gap-3 lg:grid-cols-2"><Skeleton className="h-56" /><Skeleton className="h-56" /></div></div>;
  if (cash.isError) return <CashLoadError onRetry={() => void cash.refetch()} />;

  return (
    <div className="space-y-5 pb-8" data-pdv-ui>
      <PageHeader title="Caixa" subtitle="Venda e acompanhe cada caixa sem misturar operadores." icon={Banknote} actions={<div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => navigate(localizeAppPath('/pdv/caixas', locale))}><History className="h-4 w-4" /> Histórico</Button><Button disabled={!canStartOpening} onClick={() => { setClosedElsewhereNotice(null); if (cash.terminals.length === 0) setFirstCashSetupOpen(true); else setOpenDialog(true); }}><PlusCircle className="h-4 w-4" /> Abrir caixa</Button></div>} />

      {snapshot?.reconciliationRequired ? <NoticeBanner variant="destructive">Há uma diferença antiga para conferir. Nenhum novo movimento foi liberado.</NoticeBanner> : null}
      {!allowNewSessions ? <NoticeBanner variant="warning">Finalize os caixas abertos antes de mudar o modo do PDV.</NoticeBanner> : null}
      {closedElsewhereNotice ? <NoticeBanner variant="warning">{closedElsewhereNotice}</NoticeBanner> : null}
      {lastClose ? <NoticeBanner variant={lastClose.difference === 0 ? 'success' : 'warning'}>Caixa fechado: esperado {money(lastClose.expectedAmount)}, contado {money(lastClose.countedAmount)} e diferença {money(lastClose.difference)}.</NoticeBanner> : null}

      <nav aria-label="Caixas abertos" className="flex gap-2 overflow-x-auto border-b pb-2">
        {canManageOthers ? <CashNavButton active={selected === 'home'} icon={<Home className="h-4 w-4" />} onClick={() => { setClosedElsewhereNotice(null); setSelected('home'); }}>Início</CashNavButton> : null}
        {cash.openSessions.map((session) => {
          const terminal = cash.terminals.find((item) => item.id === session.terminalId);
          const operator = session.openedBy ? cash.operators[session.openedBy] : null;
          return <CashNavButton key={session.id} active={selected === session.id} icon={<Banknote className="h-4 w-4" />} onClick={() => { setClosedElsewhereNotice(null); setSelected(session.id); }}>{cashDisplayName(terminal)}{operator ? ` · ${operator}` : ''}{session.openedBy === userId ? ' (você)' : ''}</CashNavButton>;
        })}
      </nav>

      {selected === 'home' || !focusedSession ? (
        <CashHome sessions={cash.openSessions} terminals={cash.terminals} operators={cash.operators} snapshot={snapshot} canViewTreasury={canViewTreasury} canManageSettings={canManageSettings} money={money} dateTime={dateTime} onSelect={(sessionId) => { setClosedElsewhereNotice(null); setSelected(sessionId); }} onSetup={() => setFirstCashSetupOpen(true)} />
      ) : (
        <div className="space-y-6">
            <PdvCashIndicators
              cashTexts={texts.cashCard} accountTexts={texts.accountCard} drawerAmount={detail.detail?.position ?? focusedSession.openingAmount}
              openedAt={focusedSession.openedAt} operatorName={focusedSession.openedBy ? cash.operators[focusedSession.openedBy] ?? null : null} terminalName={terminalName}
              cofre={snapshot ? { disponivel: snapshot.available ?? 0, reservado: snapshot.custody, conta_nome: snapshot.accountName, controle_estrito: true } : null}
              accounts={accountLines} accountsTotal={accountsTotal} canManageBankAccounts={canViewTreasury} isDrawerLoading={detail.isLoading || detail.isError}
              isCofreLoading={false} isAccountsLoading={accountsState.isLoading || accountsState.isLoadingBalances} isCofreUnavailable={!snapshot}
              isAccountsUnavailable={accountsState.isError || accountsState.isErrorBalances} unavailableText="Não foi possível carregar estes valores."
              valuesVisible={valuesVisible} onToggleValues={toggleValues} onClose={() => setCloseDialog(true)} onBleed={() => setEventKind('withdrawal')} onSupply={() => setEventKind('supply')} money={money} dateTime={dateTime}
            />
            <div className="grid grid-cols-4 gap-2 sm:gap-3" aria-label="Ações do caixa">
              <CashAction icon={DollarSign} label="Nova venda" tone="sale" disabled={!canAct || !salePath} onClick={() => { if (salePath) navigate(salePath); }} />
              <CashAction icon={Scale} label="Nova compra" tone="purchase" disabled={!canAct || !purchasePath} onClick={() => { if (purchasePath) navigate(purchasePath); }} />
              <CashAction icon={TrendingDown} label="Nova despesa" tone="expense" disabled={!canAct || !canManageFinance} onClick={() => setEventKind('cash_payment')} />
              <CashAction icon={TrendingUp} label="Nova receita" tone="revenue" disabled={!canAct || !canManageFinance} onClick={() => setEventKind('cash_receipt')} />
            </div>
            <CashBreakdown detail={detail.detail} loading={detail.isLoading} error={detail.isError} valuesVisible={valuesVisible} money={money} onRetry={() => void detail.refetch()} />
            <CashMovements entries={detail.entries} isLoading={detail.isLoading} isError={detail.isError} valuesVisible={valuesVisible} money={money} dateTime={dateTime} receiptFormat={receiptSettings.data?.defaultFormat ?? DEFAULT_PDV_RECEIPT_SETTINGS.defaultFormat} onRetry={() => void detail.refetch()} />
        </div>
      )}

      {cashAccountId ? <PdvCashV2OpenDialog open={openDialog} onOpenChange={setOpenDialog} terminals={cash.terminals} available={snapshot?.available ?? null} canViewTreasury={canViewTreasury} cashAccountId={cashAccountId} attemptRegistry={attemptRegistry} money={money} onConfirm={async ({ terminalId, openingAmount, attemptId }) => { const result = await cash.openSession.mutateAsync({ terminalId, cashAccountId, openingAmount, attemptId }); setSelected(result.sessionId); }} /> : null}
      <PdvFirstCashSetupDialog open={firstCashSetupOpen} onOpenChange={setFirstCashSetupOpen} onCreated={async () => { await cash.refetch(); setOpenDialog(true); }} />
      <PdvCashV2EventDialog open={eventKind !== null} onOpenChange={(open) => !open && setEventKind(null)} kind={eventKind ?? 'supply'} session={focusedSession} attemptRegistry={attemptRegistry} onConfirm={async ({ kind, amount, description, notes, attemptId }) => { if (!focusedSession) throw new Error('Selecione um caixa aberto.'); await cash.recordEvent.mutateAsync({ sessionId: focusedSession.id, cashAccountId: focusedSession.cashAccountId, kind, amount, description, notes, attemptId }); await detail.refetch(); }} />
      <PdvCashV2CloseDialog open={closeDialog} onOpenChange={setCloseDialog} session={focusedSession} expectedAmount={detail.detail?.position ?? null} money={money} attemptRegistry={attemptRegistry} onConfirm={async ({ countedAmount, notes, attemptId }) => { if (!focusedSession) throw new Error('Selecione um caixa aberto.'); const result = await cash.closeSession.mutateAsync({ sessionId: focusedSession.id, cashAccountId: focusedSession.cashAccountId, countedAmount, notes, attemptId }); setLastClose(result); setSelected('home'); return result; }} />
    </div>
  );
}

function CashNavButton({ active, icon, onClick, children }: { active: boolean; icon: React.ReactNode; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" aria-current={active ? 'page' : undefined} onClick={onClick} className={cn('flex shrink-0 items-center gap-2 whitespace-nowrap rounded-lg border px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2', active ? 'border-primary bg-primary text-primary-foreground shadow-sm' : 'border-border bg-background text-muted-foreground hover:border-primary hover:bg-primary hover:text-primary-foreground')}>{icon}{children}</button>;
}

function CashHome({ sessions, terminals, operators, snapshot, canViewTreasury, canManageSettings, money, dateTime, onSelect, onSetup }: {
  sessions: ReturnType<typeof usePdvCashSessionsV2>['openSessions']; terminals: ReturnType<typeof usePdvCashSessionsV2>['terminals']; operators: Record<string, string>;
  snapshot: ReturnType<typeof usePdvCashSessionsV2>['snapshot']; canViewTreasury: boolean; canManageSettings: boolean; money: (value: number) => string;
  dateTime: (value: string | Date | null | undefined) => string; onSelect: (id: string) => void; onSetup: () => void;
}) {
  const [valuesVisible, setValuesVisible] = useState(true);
  const visibleValue = (value: number | null | undefined) => valuesVisible && value != null ? money(value) : '•••••';
  return <div className="space-y-5">
    <section className="space-y-4 border-y py-5" aria-label="Resumo dos caixas">
      <div className="flex items-center justify-between gap-3">
        <div><h2 className="text-xs font-semibold uppercase tracking-[0.14em]">Resumo do dinheiro</h2><p className="mt-1 text-xs text-muted-foreground">{canViewTreasury && snapshot ? `Conta usada pelo PDV: ${snapshot.accountName}` : 'Somente valores que seu perfil pode consultar.'}</p></div>
        {canViewTreasury && <Button type="button" variant="ghost" size="sm" onClick={() => setValuesVisible((current) => !current)} aria-label={valuesVisible ? 'Ocultar valores' : 'Mostrar valores'}>{valuesVisible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}<span className="hidden sm:inline">{valuesVisible ? 'Ocultar' : 'Mostrar'}</span></Button>}
      </div>
      <div className="grid grid-cols-2 gap-x-5 gap-y-5 lg:grid-cols-4">
        <HomeMetric icon={Vault} label="Saldo total em dinheiro" value={canViewTreasury && snapshot ? visibleValue(snapshot.balance) : 'Acesso restrito'} tone="blue" />
        <HomeMetric icon={Banknote} label="Separado nos caixas" value={canViewTreasury && snapshot ? visibleValue(snapshot.custody) : 'Acesso restrito'} tone="orange" />
        <HomeMetric icon={DollarSign} label="Livre para abrir caixas" value={canViewTreasury && snapshot?.available != null ? visibleValue(snapshot.available) : 'Acesso restrito'} tone="green" />
        <HomeMetric icon={Scale} label="Caixas abertos" value={String(snapshot?.openSessions ?? sessions.length)} tone="purple" />
      </div>
      {canViewTreasury && snapshot ? <p className="text-xs text-muted-foreground">Ao abrir um caixa, parte do saldo fica separada para aquela gaveta. Ao fechar, volta a ficar livre.</p> : null}
    </section>

    <section className="space-y-3">
      <div><h2 className="font-bold">Caixas abertos</h2><p className="text-sm text-muted-foreground">Escolha um caixa para ver somente as movimentações dele.</p></div>
      {terminals.length === 0 ? <div className="rounded-lg border border-dashed bg-background px-4 py-10 text-center"><Store className="mx-auto h-10 w-10 text-muted-foreground" /><p className="mt-3 font-semibold">Nenhum caixa cadastrado</p><p className="mt-1 text-sm text-muted-foreground">Na primeira abertura, escolha o nome e o estoque deste caixa.</p>{canManageSettings ? <Button type="button" className="mt-4" onClick={onSetup}><PlusCircle className="h-4 w-4" /> Abrir caixa</Button> : null}</div> : sessions.length === 0 ? <div className="rounded-lg border border-dashed bg-background px-4 py-10 text-center"><Banknote className="mx-auto h-10 w-10 text-muted-foreground" /><p className="mt-3 font-semibold">Nenhum caixa aberto</p><p className="mt-1 text-sm text-muted-foreground">Use “Abrir caixa” para começar.</p></div> : <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{sessions.map((session) => {
        const operator = session.openedBy ? operators[session.openedBy] ?? 'Operador' : 'Operador';
        const cashName = cashDisplayName(terminals.find((item) => item.id === session.terminalId));
        return <button key={session.id} type="button" onClick={() => onSelect(session.id)} className="rounded-xl border bg-background p-4 text-left transition-colors hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"><span className="flex items-start justify-between gap-3"><strong className="block">{cashName}</strong><span className="rounded-md bg-emerald-600 px-2 py-1 text-[10px] font-bold uppercase text-white">Aberto</span></span><span className="mt-3 block text-sm text-muted-foreground">{operator} · aberto em {dateTime(session.openedAt)}</span>{canViewTreasury ? <span className="mt-3 block text-sm"><span className="text-muted-foreground">Dinheiro inicial: </span><strong className="tabular-nums">{money(session.openingAmount)}</strong></span> : null}</button>;
      })}</div>}
    </section>
  </div>;
}

function cashDisplayName(terminal: { name: string } | null | undefined) {
  const name = terminal?.name.trim();
  return name || 'Caixa 01';
}

function HomeMetric({ icon: Icon, label, value, tone }: { icon: typeof Banknote; label: string; value: string; tone: 'blue' | 'orange' | 'green' | 'purple' }) {
  const tones = {
    blue: 'text-blue-600 dark:text-blue-400',
    orange: 'text-orange-600 dark:text-orange-400',
    green: 'text-emerald-600 dark:text-emerald-400',
    purple: 'text-violet-600 dark:text-violet-400',
  }[tone];
  return <div className="min-w-0"><p className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground"><Icon className={cn('h-4 w-4', tones)} />{label}</p><p className={cn('mt-2 break-words text-2xl font-extrabold tabular-nums', tones)}>{value}</p></div>;
}

function CashBreakdown({ detail, loading, error, valuesVisible, money, onRetry }: { detail: ReturnType<typeof usePdvCashSessionDetailV2>['detail']; loading: boolean; error: boolean; valuesVisible: boolean; money: (value: number) => string; onRetry: () => void }) {
  if (loading) return <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">{[0, 1, 2, 3].map((item) => <Skeleton key={item} className="h-20" />)}</div>;
  if (error || !detail) return <NoticeBanner variant="destructive" action="Tentar novamente" onClick={onRetry}>Não foi possível carregar o resumo deste caixa.</NoticeBanner>;
  const mask = (value: number) => valuesVisible ? money(value) : '•••••';
  return <section className="space-y-4 border-y py-5"><h2 className="text-xs font-semibold uppercase tracking-[0.14em]">Resumo do caixa atual</h2><div className="grid grid-cols-2 gap-x-5 gap-y-5 lg:grid-cols-4"><BreakdownValue label="Dinheiro inicial" value={mask(detail.openingAmount)} tone="text-blue-600 dark:text-blue-400" /><BreakdownValue label="Entradas em dinheiro" value={mask(detail.cashReceipts + detail.supplies)} tone="text-emerald-600 dark:text-emerald-400" /><BreakdownValue label="Saídas em dinheiro" value={mask(detail.cashPayments + detail.withdrawals + detail.refunds)} tone="text-red-600 dark:text-red-400" /><BreakdownValue label="Dinheiro na gaveta" value={mask(detail.position)} /></div></section>;
}

function BreakdownValue({ label, value, tone }: { label: string; value: string; tone?: string }) { return <div className="min-w-0"><p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p><p className={cn('mt-1 break-words text-xl font-extrabold tabular-nums sm:text-2xl', tone)}>{value}</p></div>; }

function CashMovements({ entries, isLoading, isError, valuesVisible, money, dateTime, receiptFormat, onRetry }: { entries: ReturnType<typeof usePdvCashSessionDetailV2>['entries']; isLoading: boolean; isError: boolean; valuesVisible: boolean; money: (value: number) => string; dateTime: (value: string | Date | null | undefined) => string; receiptFormat: PdvReceiptFormat; onRetry: () => void }) {
  const [query, setQuery] = useState('');
  const [receiptLoadingId, setReceiptLoadingId] = useState<string | null>(null);
  const { toast } = useToast();
  const generateReceipt = (entry: ReturnType<typeof usePdvCashSessionDetailV2>['entries'][number]) => {
    if (!entry.orderId) return;
    setReceiptLoadingId(entry.id);
    void openPdvOrderReceipt(entry.orderId, receiptFormat).catch((error) => {
      toast({ variant: 'destructive', title: 'Não foi possível gerar o comprovante', description: error instanceof Error ? error.message : 'Tente novamente.' });
    }).finally(() => setReceiptLoadingId(null));
  };
  const filtered = entries.filter((entry) => `${entry.description ?? ''} ${entry.notes ?? ''} ${entry.kind}`.toLocaleLowerCase('pt-BR').includes(query.trim().toLocaleLowerCase('pt-BR')));
  if (isLoading) return <div className="space-y-2"><Skeleton className="h-12" /><Skeleton className="h-16" /><Skeleton className="h-16" /></div>;
  if (isError) return <NoticeBanner variant="destructive" action="Tentar novamente" onClick={onRetry}>Não foi possível carregar as movimentações.</NoticeBanner>;
  return <section className="space-y-4"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="font-bold">Movimentações do caixa</h2><p className="text-sm text-muted-foreground">Entradas e saídas deste caixa, sem misturar outros operadores.</p></div><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar movimentação" className="sm:w-72" /></div>{filtered.length === 0 ? <div className="rounded-lg border border-dashed bg-background py-10 text-center text-sm text-muted-foreground">Nenhuma movimentação encontrada.</div> : <>
    <div className="space-y-2 md:hidden">{filtered.map((entry) => { const incoming = entry.amount >= 0; const label = movementLabel(entry.kind); const canReceipt = entry.kind === 'cash_receipt' && !!entry.orderId; return <article key={entry.id} className="space-y-3 border-b bg-background py-3"><div className="flex items-center justify-between gap-2"><span className={cn('w-fit rounded-full px-2 py-1 text-[10px] font-bold uppercase text-white', incoming ? 'bg-emerald-600' : 'bg-red-600')}>{label}</span><span className="flex items-center gap-1"><span className="text-xs text-muted-foreground">{dateTime(entry.createdAt)}</span>{canReceipt && <MovementActionsMenu entry={entry} loading={receiptLoadingId === entry.id} onReceipt={generateReceipt} />}</span></div><div><p className="font-semibold">{entry.description || label}</p>{entry.notes && <p className="mt-1 text-xs text-muted-foreground">{entry.notes}</p>}</div><div className="flex items-center justify-between border-t pt-2 text-sm"><span className="text-muted-foreground">{incoming ? 'Entrada' : 'Saída'}</span><strong className={cn('tabular-nums', !incoming && 'text-red-600')}>{valuesVisible ? money(Math.abs(entry.amount)) : '•••••'}</strong></div></article>; })}</div>
    <div className="hidden overflow-hidden rounded-lg border md:block"><Table><TableHeader><TableRow><TableHead>Data e hora</TableHead><TableHead>Tipo</TableHead><TableHead>Descrição</TableHead><TableHead>Observação</TableHead><TableHead className="text-right">Entrada</TableHead><TableHead className="text-right">Saída</TableHead><TableHead className="w-16 text-right">Ações</TableHead></TableRow></TableHeader><TableBody>{filtered.map((entry) => { const incoming = entry.amount >= 0; const label = movementLabel(entry.kind); const canReceipt = entry.kind === 'cash_receipt' && !!entry.orderId; return <TableRow key={entry.id}><TableCell className="whitespace-nowrap text-xs text-muted-foreground">{dateTime(entry.createdAt)}</TableCell><TableCell><span className={cn('inline-flex rounded-full px-2 py-1 text-[10px] font-bold uppercase text-white', incoming ? 'bg-emerald-600' : 'bg-red-600')}>{label}</span></TableCell><TableCell className="font-medium">{entry.description || label}</TableCell><TableCell className="max-w-64 truncate text-muted-foreground">{entry.notes || '—'}</TableCell><TableCell className="text-right font-semibold tabular-nums">{incoming ? (valuesVisible ? money(Math.abs(entry.amount)) : '•••••') : '—'}</TableCell><TableCell className="text-right font-semibold tabular-nums text-red-600">{!incoming ? (valuesVisible ? money(Math.abs(entry.amount)) : '•••••') : '—'}</TableCell><TableCell className="text-right">{canReceipt ? <MovementActionsMenu entry={entry} loading={receiptLoadingId === entry.id} onReceipt={generateReceipt} /> : '—'}</TableCell></TableRow>; })}</TableBody></Table></div>
  </>}</section>;
}

function MovementActionsMenu({ entry, loading, onReceipt }: { entry: CashMovementEntry; loading: boolean; onReceipt: (entry: CashMovementEntry) => void }) {
  const movementName = entry.description || movementLabel(entry.kind);
  return <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <Button type="button" variant="ghost" size="icon" className="h-8 w-8" aria-label={`Ações da movimentação ${movementName}`}>
        <MoreHorizontal className="h-4 w-4" />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end">
      <DropdownMenuLabel>Ações</DropdownMenuLabel>
      <DropdownMenuItem disabled={loading} onSelect={() => onReceipt(entry)}>
        <ReceiptText className="mr-2 h-4 w-4" />{loading ? 'Gerando...' : 'Gerar comprovante'}
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>;
}

function movementLabel(kind: ReturnType<typeof usePdvCashSessionDetailV2>['entries'][number]['kind']) {
  return {
    opening: 'Abertura', cash_receipt: 'Receita', cash_payment: 'Despesa', supply: 'Adição',
    withdrawal: 'Retirada', refund: 'Estorno', closing_return: 'Fechamento', shortage: 'Falta',
    surplus: 'Sobra', reversal: 'Reversão',
  }[kind];
}

function CashAction({ icon: Icon, label, tone, disabled = false, title, onClick }: { icon: typeof DollarSign; label: string; tone: 'sale' | 'purchase' | 'expense' | 'revenue'; disabled?: boolean; title?: string; onClick: () => void }) {
  const tones = {
    sale: { button: 'sm:bg-emerald-600 sm:hover:bg-emerald-700 dark:sm:bg-emerald-700 dark:sm:hover:bg-emerald-600', icon: 'bg-emerald-600 dark:bg-emerald-700' },
    purchase: { button: 'sm:bg-blue-600 sm:hover:bg-blue-700 dark:sm:bg-blue-700 dark:sm:hover:bg-blue-600', icon: 'bg-blue-600 dark:bg-blue-700' },
    expense: { button: 'sm:bg-red-600 sm:hover:bg-red-700 dark:sm:bg-red-700 dark:sm:hover:bg-red-600', icon: 'bg-red-600 dark:bg-red-700' },
    revenue: { button: 'sm:bg-teal-600 sm:hover:bg-teal-700 dark:sm:bg-teal-700 dark:sm:hover:bg-teal-600', icon: 'bg-teal-600 dark:bg-teal-700' },
  }[tone];
  return <button type="button" disabled={disabled} title={title} aria-label={title ? `${label}. ${title}` : label} onClick={onClick} data-tone={tone} className={cn('flex min-w-0 flex-col items-center gap-1.5 py-2 transition-transform active:scale-95 disabled:cursor-not-allowed focus-visible:rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:h-24 sm:justify-center sm:gap-2 sm:rounded-lg sm:py-0 sm:shadow-sm', disabled ? 'sm:border sm:border-border sm:bg-background sm:text-foreground sm:shadow-none' : cn('sm:text-white', tones.button))}><span className={cn('flex h-14 w-14 max-w-full items-center justify-center rounded-2xl text-white shadow-sm sm:h-auto sm:w-auto sm:bg-transparent sm:shadow-none', disabled ? 'border border-border bg-background text-foreground shadow-none' : tones.icon)}><Icon className="h-6 w-6" /></span><span className="text-center text-[10px] font-medium leading-tight sm:text-[13px] sm:font-semibold sm:uppercase sm:tracking-[0.12em]">{label}</span></button>;
}

function CashLoadError({ onRetry }: { onRetry: () => void }) {
  return <div className="space-y-5"><PageHeader title="Caixa" subtitle="Cada caixa separado por operador" icon={Banknote} /><Card><CardContent className="flex flex-col items-center gap-3 py-10 text-center"><AlertTriangle className="h-11 w-11 text-destructive" /><h2 className="font-bold text-destructive">Não foi possível carregar os caixas</h2><p className="text-sm text-muted-foreground">Nenhuma operação foi liberada enquanto os dados não forem confirmados.</p><Button variant="outline" onClick={onRetry}><RefreshCw className="h-4 w-4" /> Tentar novamente</Button></CardContent></Card></div>;
}
