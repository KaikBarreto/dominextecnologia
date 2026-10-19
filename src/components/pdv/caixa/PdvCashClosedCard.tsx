import { Lock, Unlock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { pdv } from '@/lib/i18n/messages/app/pdv';

type ClosedTexts = (typeof pdv)['pt-br']['cashPanel']['closed'];

export interface LastClosedSummary {
  terminalName: string | null;
  operatorName: string | null;
  openedAt: string;
  closedAt: string | null;
  countedAmount: number | null;
  difference: number | null;
}

interface PdvCashClosedCardProps {
  texts: ClosedTexts;
  canOpen: boolean;
  /** Motivo em PT-BR quando o botão está desabilitado. */
  disabledReason?: string | null;
  onOpen: () => void;
  lastClosed?: LastClosedSummary | null;
  money: (value: number) => string;
  dateTime: (value: string) => string;
}

/**
 * Estado CAIXA FECHADO: card grande e clicável que convida a abrir o turno.
 *
 * Régua de UI: card de ESTADO é BRANCO, com cor saturada só no ícone e no
 * título. Nada de fundo pastel nem de círculo translúcido atrás do ícone.
 */
export function PdvCashClosedCard({
  texts,
  canOpen,
  disabledReason,
  onOpen,
  lastClosed,
  money,
  dateTime,
}: PdvCashClosedCardProps) {
  return (
    <div className="space-y-4">
      <Card
        role={canOpen ? 'button' : undefined}
        tabIndex={canOpen ? 0 : undefined}
        onClick={canOpen ? onOpen : undefined}
        onKeyDown={
          canOpen
            ? (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onOpen();
                }
              }
            : undefined
        }
        className={cn(
          'text-center transition-colors',
          canOpen && 'cursor-pointer hover:border-primary focus-visible:border-primary focus-visible:outline-none',
        )}
      >
        <CardContent className="flex flex-col items-center gap-3 px-4 py-10 sm:py-14">
          <Lock className="h-12 w-12 text-primary" />
          <h2 className="text-xl font-bold text-primary sm:text-2xl">{texts.title}</h2>
          <p className="max-w-md text-sm text-muted-foreground">{texts.description}</p>
          <Button
            type="button"
            size="lg"
            className="mt-2 gap-2"
            disabled={!canOpen}
            onClick={(e) => {
              e.stopPropagation();
              onOpen();
            }}
          >
            <Unlock className="h-4 w-4" />
            {texts.open}
          </Button>
          {!canOpen && disabledReason && (
            <p className="max-w-md text-xs text-muted-foreground">{disabledReason}</p>
          )}
        </CardContent>
      </Card>

      {lastClosed && (
        <Card>
          <CardContent className="space-y-3 p-4">
            <h3 className="text-sm font-bold">{texts.lastTitle}</h3>
            <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
              {lastClosed.terminalName && (
                <Row label={texts.lastTerminal} value={lastClosed.terminalName} />
              )}
              {lastClosed.operatorName && (
                <Row label={texts.lastOperator} value={lastClosed.operatorName} />
              )}
              <Row
                label={texts.lastWindow}
                value={
                  lastClosed.closedAt
                    ? `${dateTime(lastClosed.openedAt)} → ${dateTime(lastClosed.closedAt)}`
                    : dateTime(lastClosed.openedAt)
                }
              />
              <Row
                label={texts.lastCounted}
                value={money(Number(lastClosed.countedAmount) || 0)}
              />
              <Row
                label={texts.lastDifference}
                value={money(Number(lastClosed.difference) || 0)}
                valueClassName={
                  Number(lastClosed.difference) === 0
                    ? undefined
                    : Number(lastClosed.difference) > 0
                      ? 'text-success'
                      : 'text-destructive'
                }
              />
            </dl>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Row({
  label,
  value,
  valueClassName,
}: {
  label: string;
  value: string;
  valueClassName?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 sm:justify-start">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={cn('font-semibold tabular-nums sm:ml-auto', valueClassName)}>{value}</dd>
    </div>
  );
}
