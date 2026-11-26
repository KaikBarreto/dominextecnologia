import type { PortalPayment } from '@/hooks/usePortalPaymentReceipts';
/**
 * PortalChargesSection — seção de cobranças compartilhada entre o Portal do
 * Cliente (CustomerPortal) e o Portal do Contrato (PmocPublicPortal).
 *
 * Regras de UI:
 *  - Lançamentos em linhas com separadores, sem cards.
 *  - BADGE de status = preenchido/saturado + texto branco. Nunca outline.
 *  - Botão "Pagar" só aparece quando: classify != 'paid' E tem public_short_code.
 *  - Empty state: componente EmptyState com ícone discreto.
 *  - i18n: recebe strings via prop `t` (4 locales — pt-br base, sem fallback no
 *    componente; o fallback é feito pelo deepMerge do sistema i18n).
 */

import { CreditCard, Calendar, FileDown } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { formatDate, formatMoney } from '@/lib/format';
import { classifyTenantChargeStatus } from '@/utils/tenantChargeStatus';
import { EmptyState } from '@/components/mobile/EmptyState';

// ─────────────────────────────────────────────────────────────────────────────
// Tipos
// ─────────────────────────────────────────────────────────────────────────────

export interface PortalChargeItem {
  value: number | null;
  status: string | null;
  due_date: string | null;
  description: string | null;
  billing_type: string | null;
  public_short_code: string | null;
}

/** Strings i18n que o componente precisa — consumidas via MESSAGES[locale] no pai. */
export interface PortalChargesSectionMessages {
  chargesEmpty: string;
  chargeStatusPaid: string;
  chargeStatusPending: string;
  chargeStatusOverdue: string;
  chargeStatusRefunded: string;
  chargeStatusOther: string;
  chargeDueLabel: string;
  chargePayBtn: string;
}

interface Props {
  receiptPayments?: PortalPayment[];
  downloadingReceipt?: string | null;
  onReceipt?: (payment: PortalPayment) => void;
  charges: PortalChargeItem[];
  /**
   * Strings i18n já resolvidas para o locale ativo.
   * Se omitido, usa o fallback em pt-br embutido (não depender em produção).
   */
  t?: PortalChargesSectionMessages;
  locale?: string;
  currency?: string;
  timezone?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Mapeamento de status → classe de badge (saturado + texto branco)
// ─────────────────────────────────────────────────────────────────────────────

const BADGE_CLASS = {
  paid:     'bg-success text-white border-transparent',
  pending:  'bg-warning text-white border-transparent',
  overdue:  'bg-destructive text-white border-transparent',
  refunded: 'bg-muted-foreground text-white border-transparent',
  other:    'bg-slate-600 text-white border-transparent',
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// Componente
// ─────────────────────────────────────────────────────────────────────────────

export function PortalChargesSection({ charges, t, locale = 'pt-br', currency = 'BRL', timezone = 'America/Sao_Paulo', receiptPayments, downloadingReceipt, onReceipt }: Props) {
  // Fallback pt-br embutido pra não quebrar se `t` não vier (nunca deve acontecer
  // em produção — o pai sempre passa as strings do MESSAGES resolvido).
  const msg: PortalChargesSectionMessages = t ?? {
    chargesEmpty: 'Nenhuma cobrança no momento',
    chargeStatusPaid: 'Pago',
    chargeStatusPending: 'Pendente',
    chargeStatusOverdue: 'Vencido',
    chargeStatusRefunded: 'Estornado',
    chargeStatusOther: 'Outro',
    chargeDueLabel: 'Vencimento',
    chargePayBtn: 'Pagar',
  };

  const statusLabel = (classification: ReturnType<typeof classifyTenantChargeStatus>): string => {
    switch (classification) {
      case 'paid':     return msg.chargeStatusPaid;
      case 'pending':  return msg.chargeStatusPending;
      case 'overdue':  return msg.chargeStatusOverdue;
      case 'refunded': return msg.chargeStatusRefunded;
      default:         return msg.chargeStatusOther;
    }
  };

  if (charges.length === 0) {
    return (
      <EmptyState
        size="compact"
        icon={<CreditCard className="h-8 w-8" />}
        title={msg.chargesEmpty}
      />
    );
  }

  return (
    <div className="space-y-3">
      {charges.map((charge, i) => {
        const confirmedPayment = charge.public_short_code ? receiptPayments?.find(p => p.kind === 'charge' && p.public_short_code === charge.public_short_code) : null;
        const classification = confirmedPayment ? 'paid' : classifyTenantChargeStatus(charge.status ?? '');
        const badgeClass = BADGE_CLASS[classification];
        const label = statusLabel(classification);
        const isPaid = classification === 'paid';
        const payment = isPaid ? confirmedPayment : null;
        const canPay = (classification === 'pending' || classification === 'overdue') && !!charge.public_short_code;
        const payHref = `/pagar/${charge.public_short_code}`;
        const formattedValue = charge.value != null
          ? formatMoney(charge.value, currency, locale as any)
          : null;
        const formattedDue = charge.due_date
          ? formatDate(charge.due_date, locale as any, timezone)
          : null;

        return (
          <div key={charge.public_short_code ?? i} className="border-b border-border py-4">
              {/* Linha superior: valor + badge de status */}
              <div className="flex items-center justify-between gap-2 flex-wrap">
                {formattedValue != null && (
                  <span className="text-base font-bold tabular-nums">
                    {formattedValue}
                  </span>
                )}
                <Badge className={cn('text-xs shrink-0', badgeClass)}>
                  {label}
                </Badge>
              </div>

              {/* Descrição */}
              {charge.description && (
                <p className="mt-1.5 text-sm text-muted-foreground line-clamp-2">
                  {charge.description}
                </p>
              )}

              {/* Vencimento */}
              {formattedDue && (
                <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                  <Calendar className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  {msg.chargeDueLabel}: {formattedDue}
                </p>
              )}

              {payment && onReceipt && <div className="mt-3 border-t pt-3"><Button variant="outline" size="sm" className="gap-2" disabled={!!downloadingReceipt} onClick={() => onReceipt(payment)}><FileDown className="h-4 w-4" />Gerar recibo</Button></div>}
              {/* CTA Pagar (só quando não pago e tem código) */}
              {canPay && (
                <div className="mt-3 pt-3 border-t border-border">
                  <a href={payHref} target="_blank" rel="noopener noreferrer">
                    <Button size="sm" className="gap-1.5 text-xs">
                      <CreditCard className="h-3.5 w-3.5" />
                      {msg.chargePayBtn}
                    </Button>
                  </a>
                </div>
              )}
          </div>
        );
      })}
    </div>
  );
}
