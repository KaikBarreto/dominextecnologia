/**
 * "Cobrar o saldo" de uma conta a receber — estado e decisões, num lugar só.
 *
 * Origem (chamado de 21/10/2026): o cliente recebeu R$ 253,60 de uma conta de
 * R$ 352,60 e não tinha como emitir o boleto dos R$ 99,00 que faltavam LIGADO
 * àquela conta. Criou cobranças soltas e o mesmo pagamento foi contado duas
 * vezes.
 *
 * O que mora aqui:
 *   · a régua (via `@/lib/receivable-balance-charge`, função pura e testada) —
 *     este hook não decide nada por conta própria;
 *   · a cobrança ligada a cada conta (via `useReceivableCharges`), pro selo de
 *     status e pra saber se a ação é "cobrar" ou "substituir";
 *   · a SUBSTITUIÇÃO em dois passos: cancelar a cobrança atual
 *     (`tenant-asaas-delete-charge`) e só depois emitir a nova. A edge de
 *     criação nunca mata cobrança sozinha, é decisão do gestor;
 *   · a decisão de DEPOIS do recebimento parcial: cobrar só o que falta ou
 *     encerrar a cobrança (recebi tudo por fora).
 *
 * Os diálogos ficam em `ReceivableBalanceChargeDialogs` — montar UMA vez por
 * tela, fora da lista (são portais).
 */
import { useMemo, useState } from 'react';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';
import { formatMoney } from '@/lib/format';
import { todayInTz } from '@/lib/timezone';
import { useToast } from '@/hooks/use-toast';
import { useCompanyModules } from '@/hooks/useCompanyModules';
import { useTenantPaymentAccount } from '@/hooks/useTenantPaymentAccount';
import { useTenantCharges, type CreateChargeApiError } from '@/hooks/useTenantCharges';
import {
  useReceivableCharges,
  type ReceivableCharge,
  type ReceivableChargeSubject,
} from '@/hooks/useReceivableCharges';
import {
  getReceivableBalance,
  getReceivableChargeAvailability,
  getReceivableChargeTone,
  resolveReceivableChargeDueDate,
  type ReceivableChargeAvailability,
  type ReceivableChargeCandidate,
} from '@/lib/receivable-balance-charge';
import type { DetailOnlineCharge } from './FinancialTransactionDetailsPanel';

/** Recorte da conta a receber que o fluxo inteiro precisa enxergar. */
export interface ReceivableChargeRow extends ReceivableChargeSubject, ReceivableChargeCandidate {
  id: string;
  description?: string | null;
  due_date?: string | null;
}


/** A ação de cobrança de uma linha da lista, já traduzida e já decidida. */
export interface ReceivableChargeAction {
  /** Rótulo do item de menu. Quando `disabled`, É o motivo do bloqueio. */
  label: string;
  disabled: boolean;
  /** Motivo por escrito, pro painel de detalhe. Null quando não há bloqueio. */
  reason: string | null;
}

/** Conta escolhida pra emitir a cobrança do saldo (abre o ChargeDialog). */
interface ChargeTarget {
  receivableId: string;
  customerId: string;
  /** Valor TRAVADO da cobrança: o saldo em aberto da conta. */
  balance: number;
  description: string | null;
  dueDate: string;
}

/** Substituição pendente: cancelar esta cobrança e emitir a do saldo. */
interface ReplaceTarget {
  receivableId: string;
  customerId: string;
  liveCharge: { id: string; value: number; dueDate: string | null; invoiceUrl: string | null };
  balance: number;
  description: string | null;
  dueDate: string;
}

/** Decisão pendente depois de lançar recebimento numa conta com cobrança viva. */
interface AfterReceiptTarget {
  receivableId: string;
  customerId: string | null;
  liveCharge: { id: string; value: number; dueDate: string | null; invoiceUrl: string | null };
  /** Quanto acabou de ser lançado nesta conta. */
  receivedNow: number;
  /** Saldo que sobrou DEPOIS deste recebimento (0 = conta quitada). */
  balanceAfter: number;
  description: string | null;
  dueDate: string;
}

export function useReceivableBalanceCharge(rows: ReceivableChargeRow[]) {
  const { locale, currency, timezone } = useAppLocaleContext();
  const t = MESSAGES[locale].app.finance.accounts.onlineCharge;
  const money = (value: number) => formatMoney(value, currency, locale);
  const { toast } = useToast();
  const todayIso = todayInTz(timezone);

  // Mesmo gate do resto da cobrança online: módulo ligado + conta de
  // recebimento ativa. Sem isso, a ação nem aparece.
  const { hasModule } = useCompanyModules();
  const { isActive: isPaymentActive } = useTenantPaymentAccount();
  const enabled = hasModule('cobrancas') && isPaymentActive;

  const { chargeByReceivable, liveChargeByReceivable } = useReceivableCharges(rows, enabled);
  // `enabled: false`: aqui só usamos a mutation de excluir. Sem isso, montar
  // este hook puxaria `tenant_charges` da empresa inteira só pra existir um
  // botão na lista.
  const { remove } = useTenantCharges({ enabled: false });

  const rowById = useMemo(() => new Map(rows.map((row) => [row.id, row])), [rows]);

  const [chargeTarget, setChargeTarget] = useState<ChargeTarget | null>(null);
  const [replaceTarget, setReplaceTarget] = useState<ReplaceTarget | null>(null);
  const [afterReceipt, setAfterReceipt] = useState<AfterReceiptTarget | null>(null);

  const availabilityFor = (row: ReceivableChargeRow): ReceivableChargeAvailability => {
    const live = liveChargeByReceivable.get(row.id);
    return getReceivableChargeAvailability(row, {
      hasLiveCharge: !!live,
      // A conta é o ESPELHO da cobrança viva (o elo veio do
      // `tenant_charge_id` dela). Só nesse caso cancelar pode apagar a conta.
      liveChargeIsReceivableMirror: !!live?.linkedByReceivable,
    });
  };

  /**
   * A ação de cobrança desta linha, ou null quando ela não deve aparecer.
   *
   * Quando a régua bloqueia com motivo que a linha NÃO explica sozinha, o item
   * aparece DESABILITADO e o `label` passa a ser o próprio MOTIVO: no toque não
   * existe tooltip, e um "Cobrar o saldo" apagado sem explicação não diz nada a
   * ninguém. O mesmo texto vai também pro painel de detalhe (`reason`).
   */
  const actionFor = (row: ReceivableChargeRow): ReceivableChargeAction | null => {
    if (!enabled) return null;
    const verdict = availabilityFor(row);
    if (verdict.kind === 'chargeable') return { label: t.chargeBalanceAction, disabled: false, reason: null };
    if (verdict.kind === 'replace') return { label: t.replaceAction, disabled: false, reason: null };
    if (verdict.silent) return null;
    const reason = t.blocked[verdict.reason];
    return { label: reason, disabled: true, reason };
  };

  /** Selo de status da cobrança ligada à conta (ou null quando não há). */
  const onlineChargeBadgeFor = (row: ReceivableChargeRow): DetailOnlineCharge | null => {
    const charge = chargeByReceivable.get(row.id);
    if (!charge) return null;
    const tone = getReceivableChargeTone(charge.status);
    return { statusLabel: t.status[tone], tone };
  };

  const chargeToTarget = (charge: ReceivableCharge) => ({
    id: charge.id,
    value: charge.value,
    dueDate: charge.dueDate,
    invoiceUrl: charge.invoiceUrl,
  });

  /** Clique na ação: emite direto, ou pede a substituição explícita. */
  const start = (row: ReceivableChargeRow) => {
    const verdict = availabilityFor(row);
    const dueDate = resolveReceivableChargeDueDate(row.due_date, todayIso);
    if (verdict.kind === 'chargeable') {
      setChargeTarget({
        receivableId: row.id,
        customerId: verdict.customerId,
        balance: verdict.balance,
        description: row.description ?? null,
        dueDate,
      });
      return;
    }
    if (verdict.kind === 'replace') {
      const live = liveChargeByReceivable.get(row.id);
      if (!live) return;
      setReplaceTarget({
        receivableId: row.id,
        customerId: verdict.customerId,
        liveCharge: chargeToTarget(live),
        balance: verdict.balance,
        description: row.description ?? null,
        dueDate,
      });
    }
  };

  /**
   * Chamado DEPOIS de lançar recebimento numa conta que tem cobrança viva.
   * Sem isto a tela de recebimento não sabia nada de cobrança, e foi
   * exatamente aí que o cliente se perdeu: lançou o parcial, o boleto antigo
   * seguiu vivo e o mesmo dinheiro entrou duas vezes.
   *
   * `receivedNow` é o que acabou de entrar; `amountReceivedBefore` é o que já
   * havia antes. O saldo é calculado aqui, e não lido da lista, porque a lista
   * ainda pode estar com o número velho no instante seguinte à mutação.
   */
  const askAfterReceipt = (input: {
    receivable: ReceivableChargeRow;
    receivedNow: number;
    amountReceivedBefore: number;
    /**
     * Novo vencimento que o operador deu ao SALDO neste recebimento parcial.
     * É o melhor padrão pra cobrança do que falta: o vencimento antigo é o da
     * parcela que acabou de ser paga.
     */
    newDueDate?: string | null;
  }) => {
    if (!enabled) return;
    const { receivable, receivedNow, amountReceivedBefore } = input;
    const live = liveChargeByReceivable.get(receivable.id);
    if (!live) return;
    const amount = Number(receivable.amount ?? 0);
    const balanceAfter = Math.max(0, Number((amount - amountReceivedBefore - receivedNow).toFixed(2)));
    setAfterReceipt({
      receivableId: receivable.id,
      customerId: receivable.customer_id ?? null,
      liveCharge: chargeToTarget(live),
      receivedNow,
      balanceAfter,
      description: receivable.description ?? null,
      dueDate: resolveReceivableChargeDueDate(input.newDueDate || receivable.due_date, todayIso),
    });
  };

  /** "Cobrar só o que falta": cai na MESMA substituição em dois passos. */
  const chargeRemainingAfterReceipt = () => {
    if (!afterReceipt || !afterReceipt.customerId || afterReceipt.balanceAfter <= 0) return;
    setReplaceTarget({
      receivableId: afterReceipt.receivableId,
      customerId: afterReceipt.customerId,
      liveCharge: afterReceipt.liveCharge,
      balance: afterReceipt.balanceAfter,
      description: afterReceipt.description,
      dueDate: afterReceipt.dueDate,
    });
    setAfterReceipt(null);
  };

  /** "Encerrar a cobrança": recebi tudo por fora, o link não deve mais pagar. */
  const closeChargeAfterReceipt = async () => {
    if (!afterReceipt) return;
    try {
      const result = await remove.mutateAsync({ charge_id: afterReceipt.liveCharge.id });
      toast({ title: t.afterReceipt.closeSuccess });
      // Cancelar a cobrança NÃO apaga a conta a receber (a régua `keep_it` do
      // servidor preserva recebível com recebimento lançado). Se o servidor
      // avisar que o lançamento ficou pra trás, o aviso não pode ser silencioso.
      if (result.financeWarning) {
        toast({ variant: 'destructive', title: t.afterReceipt.closeErrorTitle, description: result.financeWarning });
      }
      setAfterReceipt(null);
    } catch (err) {
      toast({
        variant: 'destructive',
        title: t.afterReceipt.closeErrorTitle,
        description: err instanceof Error ? err.message : undefined,
      });
    }
  };

  /** Passo 1 da substituição: cancela a atual. Passo 2 abre o ChargeDialog. */
  const confirmReplace = async () => {
    if (!replaceTarget) return;
    try {
      const result = await remove.mutateAsync({ charge_id: replaceTarget.liveCharge.id });
      if (result.financeWarning) {
        toast({ variant: 'destructive', title: t.replaceDialog.errorTitle, description: result.financeWarning });
      }
      setChargeTarget({
        receivableId: replaceTarget.receivableId,
        customerId: replaceTarget.customerId,
        balance: replaceTarget.balance,
        description: replaceTarget.description,
        dueDate: replaceTarget.dueDate,
      });
      setReplaceTarget(null);
    } catch (err) {
      // Falhou cancelar: NÃO seguimos pra criação. Duas cobranças vivas pro
      // mesmo dinheiro é justamente o bug que esta tela vem fechar.
      toast({
        variant: 'destructive',
        title: t.replaceDialog.errorTitle,
        description: err instanceof Error ? err.message : undefined,
      });
    }
  };

  /**
   * A edge recusou a criação porque apareceu cobrança viva entre abrir a tela
   * e clicar em gerar. Reabre o fluxo de substituição com os dados que o
   * servidor mandou, em vez de deixar o usuário num toast sem saída.
   */
  const handleLiveChargeConflict = (error: CreateChargeApiError) => {
    const live = error.liveCharge;
    const target = chargeTarget;
    if (!live || !target) return;
    const row = rowById.get(target.receivableId);
    setReplaceTarget({
      receivableId: target.receivableId,
      customerId: target.customerId,
      liveCharge: {
        id: live.id,
        value: live.value,
        dueDate: live.due_date,
        invoiceUrl: live.invoice_url,
      },
      balance: error.balance != null && error.balance > 0
        ? error.balance
        : (row ? getReceivableBalance(row) : target.balance),
      description: target.description,
      dueDate: target.dueDate,
    });
    setChargeTarget(null);
  };

  return {
    /** Cobrança online disponível nesta empresa (módulo + conta ativa). */
    enabled,
    money,
    t,
    availabilityFor,
    actionFor,
    onlineChargeBadgeFor,
    liveChargeByReceivable,
    start,
    askAfterReceipt,
    // estado dos diálogos (consumido por ReceivableBalanceChargeDialogs)
    chargeTarget,
    closeChargeDialog: () => setChargeTarget(null),
    handleLiveChargeConflict,
    replaceTarget,
    cancelReplace: () => setReplaceTarget(null),
    confirmReplace,
    isReplacing: remove.isPending,
    afterReceipt,
    dismissAfterReceipt: () => setAfterReceipt(null),
    chargeRemainingAfterReceipt,
    closeChargeAfterReceipt,
  };
}

export type ReceivableBalanceCharge = ReturnType<typeof useReceivableBalanceCharge>;
