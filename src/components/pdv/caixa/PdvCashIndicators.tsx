import { Banknote, CircleArrowDown, Eye, EyeOff, Landmark, LockKeyhole, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { NoticeBanner } from '@/components/ui/NoticeBanner';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import type { pdv } from '@/lib/i18n/messages/app/pdv';
import { PdvAnimatedMoney } from '@/components/pdv/caixa/PdvAnimatedMoney';

type CashCardTexts = (typeof pdv)['pt-br']['cashPanel']['cashCard'];
type AccountCardTexts = (typeof pdv)['pt-br']['cashPanel']['accountCard'];

export interface AccountBalanceLine {
  id: string;
  name: string;
  balance: number;
}

interface PdvCashIndicatorsProps {
  cashTexts: CashCardTexts;
  accountTexts: AccountCardTexts;
  /** Esperado na gaveta AGORA (abertura + vendas em dinheiro + suprimentos − sangrias). */
  drawerAmount: number;
  openedAt: string;
  operatorName: string | null;
  terminalName: string | null;
  cofre: { disponivel: number; reservado: number; conta_nome: string | null; controle_estrito: boolean } | null;
  accounts: AccountBalanceLine[];
  accountsTotal: number;
  /** Só gestores de contas veem saldos do cofre e das contas bancárias. */
  canManageBankAccounts: boolean;
  isDrawerLoading: boolean;
  isCofreLoading: boolean;
  isAccountsLoading: boolean;
  isCofreUnavailable: boolean;
  isAccountsUnavailable: boolean;
  unavailableText: string;
  valuesVisible: boolean;
  onToggleValues: () => void;
  onClose: () => void;
  onBleed: () => void;
  onSupply: () => void;
  money: (value: number) => string;
  dateTime: (value: string) => string;
}

/** Quantas contas aparecem nominalmente antes do "e mais N". */
const MAX_ACCOUNT_LINES = 4;
const ACCOUNT_TONES = [
  'bg-violet-600',
  'bg-orange-500',
  'bg-blue-600',
  'bg-emerald-600',
] as const;

/**
 * Os dois cards de indicador do topo do caixa.
 *
 * Régua: o card-herói é SATURADO (`bg-primary`) com `text-primary-foreground`
 * (nunca `text-white`: a primária é a cor do tenant e no tema escuro ela é
 * quase branca). O card de contas é BRANCO com o ícone branco direto em cima de
 * um bloco saturado, sem círculo translúcido atrás.
 */
export function PdvCashIndicators({
  cashTexts,
  accountTexts,
  drawerAmount,
  openedAt,
  operatorName,
  terminalName,
  cofre,
  accounts,
  accountsTotal,
  canManageBankAccounts,
  isDrawerLoading,
  isCofreLoading,
  isAccountsLoading,
  isCofreUnavailable,
  isAccountsUnavailable,
  unavailableText,
  valuesVisible,
  onToggleValues,
  onClose,
  onBleed,
  onSupply,
  money,
  dateTime,
}: PdvCashIndicatorsProps) {
  const visibleAccounts = accounts.slice(0, MAX_ACCOUNT_LINES);
  const remaining = accounts.length - visibleAccounts.length;

  return (
    <div className="grid w-full gap-4 lg:grid-cols-2">
      <section className="flex min-w-0 flex-col justify-between rounded-2xl bg-primary p-5 text-primary-foreground shadow-sm sm:p-6 lg:min-h-[260px]">
        <div>
          <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-primary-foreground/80">
            <Banknote className="h-5 w-5" />
            {cashTexts.title}
          </h2>
          <div className="mt-4 flex min-w-0 items-center gap-2">
            <p className="min-w-0 truncate text-4xl font-extrabold tracking-tight tabular-nums sm:text-5xl xl:text-6xl">
              {isDrawerLoading ? (
                <Skeleton className="h-12 w-52 bg-primary-foreground/20 sm:h-14" />
              ) : (
                <PdvAnimatedMoney value={drawerAmount} visible={valuesVisible} money={money} />
              )}
            </p>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              aria-label={valuesVisible ? cashTexts.hide : cashTexts.show}
              onClick={onToggleValues}
              className="h-9 w-9 shrink-0 text-primary-foreground hover:bg-primary-foreground/15 hover:text-primary-foreground"
            >
              {valuesVisible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
            </Button>
          </div>
          <p className="mt-2 text-xs text-primary-foreground/75">
            {cashTexts.openedAt.replace('{datetime}', dateTime(openedAt))}
            {operatorName ? ` ${cashTexts.operator.replace('{name}', operatorName)}` : ''}
            {terminalName ? ` · ${terminalName}` : ''}
          </p>

          {canManageBankAccounts && isCofreLoading && (
            <div className="mt-5 space-y-2">
              <Skeleton className="h-4 w-full bg-primary-foreground/20" />
              <Skeleton className="h-4 w-4/5 bg-primary-foreground/20" />
            </div>
          )}

          {canManageBankAccounts && !isCofreLoading && isCofreUnavailable && (
            <p className="mt-4 text-xs font-medium text-primary-foreground/80">
              {unavailableText}
            </p>
          )}

          {canManageBankAccounts && !isCofreLoading && !isCofreUnavailable && (
            <div className="mt-4 space-y-1.5 text-xs sm:text-sm">
              {cofre?.conta_nome ? (
                <>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-primary-foreground/75">{cashTexts.cofreAvailable}</span>
                    <span className="font-bold tabular-nums">
                      <PdvAnimatedMoney value={cofre.disponivel} visible={valuesVisible} money={money} />
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-primary-foreground/75">{cashTexts.cofreReserved}</span>
                    <span className="font-bold tabular-nums">
                      <PdvAnimatedMoney value={cofre.reservado} visible={valuesVisible} money={money} />
                    </span>
                  </div>
                  {!cofre.controle_estrito && (
                    <p className="pt-1 text-xs text-primary-foreground/75">{cashTexts.strictOff}</p>
                  )}
                </>
              ) : (
                <p className="flex items-center gap-1.5 text-primary-foreground/75">
                  <LockKeyhole className="h-3.5 w-3.5 shrink-0" />
                  {cashTexts.cofreMissing}
                </p>
              )}
            </div>
          )}
        </div>

        <button
          type="button"
          disabled={isDrawerLoading || isCofreUnavailable}
          onClick={onClose}
          className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg border border-primary-foreground/30 bg-primary-foreground/10 py-2.5 text-[13px] font-semibold uppercase tracking-widest text-primary-foreground transition-colors hover:border-red-600 hover:bg-red-600 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-foreground focus-visible:ring-offset-2 focus-visible:ring-offset-primary disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-primary-foreground/30 disabled:hover:bg-primary-foreground/10"
        >
          {cashTexts.close}
        </button>
      </section>

      {canManageBankAccounts && (
        <section className="flex min-w-0 flex-col justify-between rounded-2xl border bg-card p-5 shadow-sm sm:p-6 lg:min-h-[260px]">
          <div>
            <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              <Landmark className="h-5 w-5" />
              {accountTexts.title}
            </h2>
            <p className="mt-4 min-w-0 truncate text-4xl font-extrabold tracking-tight tabular-nums sm:text-5xl xl:text-6xl">
              {isAccountsLoading ? (
                <Skeleton className="h-12 w-52 sm:h-14" />
              ) : isAccountsUnavailable ? (
                '—'
              ) : (
                <PdvAnimatedMoney value={accountsTotal} visible={valuesVisible} money={money} />
              )}
            </p>

            {isAccountsLoading ? (
              <div className="mt-5 flex gap-2">
                <Skeleton className="h-6 w-28 rounded-full" />
                <Skeleton className="h-6 w-36 rounded-full" />
              </div>
            ) : isAccountsUnavailable ? (
              <div className="mt-4">
                <NoticeBanner variant="warning">{unavailableText}</NoticeBanner>
              </div>
            ) : accounts.length === 0 ? (
              <div className="mt-4">
                <NoticeBanner variant="neutral">{accountTexts.empty}</NoticeBanner>
              </div>
            ) : (
              <div className="mt-5 flex flex-wrap gap-1.5">
                {visibleAccounts.map((acc, index) => (
                  <span
                    key={acc.id}
                    className={cn(
                      'max-w-full truncate rounded-full px-2.5 py-1 text-[10px] font-bold text-white',
                      ACCOUNT_TONES[index % ACCOUNT_TONES.length],
                    )}
                    title={`${acc.name}: ${valuesVisible ? money(acc.balance) : '•••••'}`}
                  >
                    {acc.name}&nbsp;{' '}
                    <PdvAnimatedMoney value={acc.balance} visible={valuesVisible} money={money} />
                  </span>
                ))}
                {remaining > 0 && (
                  <span className="rounded-full bg-muted px-2.5 py-1 text-[10px] font-semibold text-muted-foreground">
                    {accountTexts.more.replace('{count}', String(remaining))}
                  </span>
                )}
              </div>
            )}
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2 sm:flex">
            <Button
              type="button"
              variant="outline"
              disabled={isDrawerLoading || isAccountsLoading || isAccountsUnavailable || isCofreUnavailable}
              className="min-h-11 gap-1.5 text-[11px] font-semibold uppercase tracking-wider sm:min-h-0"
              onClick={onBleed}
            >
              <CircleArrowDown className="h-4 w-4" />
              {accountTexts.bleed}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={isDrawerLoading || isAccountsLoading || isAccountsUnavailable || isCofreUnavailable}
              className="min-h-11 gap-1.5 text-[11px] font-semibold uppercase tracking-wider sm:min-h-0"
              onClick={onSupply}
            >
              <Plus className="h-4 w-4" />
              {accountTexts.supply}
            </Button>
          </div>
        </section>
      )}
    </div>
  );
}
