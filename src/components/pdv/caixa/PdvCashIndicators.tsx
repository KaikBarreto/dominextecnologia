import { Banknote, CircleArrowDown, Eye, EyeOff, Landmark, LockKeyhole, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { NoticeBanner } from '@/components/ui/NoticeBanner';
import { cn } from '@/lib/utils';
import type { pdv } from '@/lib/i18n/messages/app/pdv';

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
  valuesVisible,
  onToggleValues,
  onClose,
  onBleed,
  onSupply,
  money,
  dateTime,
}: PdvCashIndicatorsProps) {
  const hidden = '•••••';
  const show = (value: number) => (valuesVisible ? money(value) : hidden);
  const visibleAccounts = accounts.slice(0, MAX_ACCOUNT_LINES);
  const remaining = accounts.length - visibleAccounts.length;

  return (
    <div className="flex flex-col gap-5 lg:flex-row">
      <section className="flex min-w-0 flex-col justify-between lg:min-h-[220px] lg:w-[440px] lg:shrink-0">
        <div>
          <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            <Banknote className="h-5 w-5" />
            {cashTexts.title}
          </h2>
          <div className="mt-3 flex items-center gap-1">
            <p className="text-4xl font-extrabold tracking-tight tabular-nums lg:text-5xl">
              {show(drawerAmount)}
            </p>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              aria-label={valuesVisible ? cashTexts.hide : cashTexts.show}
              onClick={onToggleValues}
              className="h-8 w-8 shrink-0"
            >
              {valuesVisible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
            </Button>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {cashTexts.openedAt.replace('{datetime}', dateTime(openedAt))}
            {operatorName ? ` ${cashTexts.operator.replace('{name}', operatorName)}` : ''}
            {terminalName ? ` · ${terminalName}` : ''}
          </p>

          {canManageBankAccounts && (
            <div className="mt-4 space-y-1.5 text-xs sm:text-sm">
              {cofre?.conta_nome ? (
                <>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">{cashTexts.cofreAvailable}</span>
                    <span className="font-bold tabular-nums">{show(cofre.disponivel)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">{cashTexts.cofreReserved}</span>
                    <span className="font-bold tabular-nums">{show(cofre.reservado)}</span>
                  </div>
                  {!cofre.controle_estrito && (
                    <p className="pt-1 text-xs text-muted-foreground">{cashTexts.strictOff}</p>
                  )}
                </>
              ) : (
                <p className="flex items-center gap-1.5 text-muted-foreground">
                  <LockKeyhole className="h-3.5 w-3.5 shrink-0" />
                  {cashTexts.cofreMissing}
                </p>
              )}
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={onClose}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-muted/60 py-2.5 text-[13px] font-semibold uppercase tracking-widest text-foreground transition-colors hover:border-red-600 hover:bg-red-600 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          {cashTexts.close}
        </button>
      </section>

      {canManageBankAccounts && (
        <section className="flex min-w-0 flex-1 flex-col justify-between lg:min-h-[220px] lg:border-l lg:pl-6">
          <div>
            <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              <Landmark className="h-5 w-5" />
              {accountTexts.title}
            </h2>
            <p className="mt-3 text-3xl font-extrabold tracking-tight tabular-nums lg:text-4xl">
              {show(accountsTotal)}
            </p>

            {accounts.length === 0 ? (
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
                    title={`${acc.name}: ${show(acc.balance)}`}
                  >
                    {acc.name}&nbsp; {show(acc.balance)}
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
              className="min-h-11 gap-1.5 text-[11px] font-semibold uppercase tracking-wider sm:min-h-0"
              onClick={onBleed}
            >
              <CircleArrowDown className="h-4 w-4" />
              {accountTexts.bleed}
            </Button>
            <Button
              type="button"
              variant="outline"
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
