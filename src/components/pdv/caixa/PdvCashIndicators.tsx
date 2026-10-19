import { ArrowDownToLine, ArrowUpFromLine, Banknote, Eye, EyeOff, Landmark, LockKeyhole } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
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
  valuesVisible: boolean;
  onToggleValues: () => void;
  onClose: () => void;
  onBleed: () => void;
  onSupply: () => void;
  money: (value: number) => string;
  dateTime: (value: string) => string;
}

/** Quantas contas aparecem nominalmente antes do "e mais N". */
const MAX_ACCOUNT_LINES = 3;

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
    <div className="grid gap-3 lg:grid-cols-2">
      {/* ── Dinheiro em caixa (card-herói saturado) ───────────────────────── */}
      <Card className="border-0 bg-primary text-primary-foreground">
        <CardContent className="flex h-full flex-col gap-3 p-4 sm:p-5">
          <div className="flex items-start justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <Banknote className="h-5 w-5 shrink-0" />
              <p className="truncate text-xs font-semibold uppercase tracking-wider">
                {cashTexts.title}
              </p>
            </div>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              aria-label={valuesVisible ? cashTexts.hide : cashTexts.show}
              onClick={onToggleValues}
              className="h-8 w-8 shrink-0 text-primary-foreground hover:bg-primary-foreground hover:text-primary"
            >
              {valuesVisible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
            </Button>
          </div>

          <p className="text-3xl font-extrabold tabular-nums sm:text-4xl">{show(drawerAmount)}</p>

          <p className="text-xs">
            {cashTexts.openedAt.replace('{datetime}', dateTime(openedAt))}
            {operatorName ? ` ${cashTexts.operator.replace('{name}', operatorName)}` : ''}
            {terminalName ? ` · ${terminalName}` : ''}
          </p>

          {/* A linha do COFRE: é o que diferencia este caixa de uma gaveta solta. */}
          <div className="mt-auto space-y-1 border-t border-primary-foreground/40 pt-3 text-xs">
            {cofre?.conta_nome ? (
              <>
                <div className="flex items-center justify-between gap-3">
                  <span>{cashTexts.cofreAvailable}</span>
                  <span className="font-bold tabular-nums">{show(cofre.disponivel)}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span>{cashTexts.cofreReserved}</span>
                  <span className="font-bold tabular-nums">{show(cofre.reservado)}</span>
                </div>
                {!cofre.controle_estrito && <p className="pt-1">{cashTexts.strictOff}</p>}
              </>
            ) : (
              <p className="flex items-center gap-1.5">
                <LockKeyhole className="h-3.5 w-3.5 shrink-0" />
                {cashTexts.cofreMissing}
              </p>
            )}
          </div>

          <Button
            type="button"
            onClick={onClose}
            className="w-full bg-primary-foreground text-primary hover:bg-primary-foreground/90"
          >
            {cashTexts.close}
          </Button>
        </CardContent>
      </Card>

      {/* ── Saldo em conta (card branco) ──────────────────────────────────── */}
      <Card>
        <CardContent className="flex h-full flex-col gap-3 p-4 sm:p-5">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-info">
              <Landmark className="h-4 w-4 text-info-foreground" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {accountTexts.title}
              </p>
              <p className="truncate text-xs text-muted-foreground">{accountTexts.description}</p>
            </div>
          </div>

          <p className="text-3xl font-extrabold tabular-nums sm:text-4xl">{show(accountsTotal)}</p>

          {accounts.length === 0 ? (
            <NoticeBanner variant="neutral">{accountTexts.empty}</NoticeBanner>
          ) : (
            <div className="mt-auto space-y-1 border-t pt-3 text-xs">
              {visibleAccounts.map((acc) => (
                <div key={acc.id} className="flex items-center justify-between gap-3">
                  <span className="truncate text-muted-foreground">{acc.name}</span>
                  <span
                    className={cn(
                      'shrink-0 font-bold tabular-nums',
                      acc.balance < 0 && 'text-destructive',
                    )}
                  >
                    {show(acc.balance)}
                  </span>
                </div>
              ))}
              {remaining > 0 && (
                <p className="text-muted-foreground">
                  {accountTexts.more.replace('{count}', String(remaining))}
                </p>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <Button type="button" variant="outline" className="gap-2" onClick={onBleed}>
              <ArrowUpFromLine className="h-4 w-4" />
              {accountTexts.bleed}
            </Button>
            <Button type="button" variant="outline" className="gap-2" onClick={onSupply}>
              <ArrowDownToLine className="h-4 w-4" />
              {accountTexts.supply}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
