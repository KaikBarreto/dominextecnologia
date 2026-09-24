import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { buildAccountOptions } from '@/components/financial/accountSelectOptions';
import { Layers, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import type { FinancialTransaction } from '@/types/database';
import type { FinancialAccount } from '@/hooks/useFinancialAccounts';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';
import { formatMoney } from '@/lib/format';
import { todayInTz } from '@/lib/timezone';
import { isPaidDateAllowedInTz } from '@/lib/dre-regime';
import { summarizeBatchSelection } from '@/lib/finance-batch-payment';

function parseLocalDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

export interface BatchPayConfirmPayload {
  accountId: string;
  /** `YYYY-MM-DD` no fuso da EMPRESA. */
  paidDate: string;
  paymentMethod: string;
}

/** Lado do lote. Muda a copy inteira, nunca a mecânica (a RPC é a mesma). */
export type BatchModalMode = 'pay' | 'receive';

interface BatchPayModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * `pay` = contas a pagar, `receive` = contas a receber. O lote é SEMPRE de um
   * lado só (o servidor recusa a mistura), então o modo também serve de
   * lembrete de qual seleção está na tela.
   */
  mode?: BatchModalMode;
  /** Contas selecionadas (já filtradas pelas regras de elegibilidade). */
  transactions: FinancialTransaction[];
  /** Contas caixa/banco ATIVAS. Cartão não entra: quem quita cartão é a fatura. */
  accounts: FinancialAccount[];
  onConfirm: (payload: BatchPayConfirmPayload) => Promise<void> | void;
  isSubmitting?: boolean;
}

/**
 * Modal de QUITAÇÃO EM LOTE — contas a pagar (`pay`) ou a receber (`receive`).
 *
 * Uma conta bancária, uma data e uma forma de pagamento pro lote inteiro, que é
 * exatamente o que faz as N contas virarem UMA linha do extrato. Nenhum
 * lançamento novo nasce: a RPC só marca as N como quitadas sob o mesmo carimbo.
 *
 * Do lado do RECEBIMENTO não existe campo de tarifa de propósito: a tarifa da
 * maquininha nasce como lançamento FILHO (`buildReceiptFeeRow`) e o lote não
 * cria linha nenhuma. Quem recebe em lote recebe o valor cheio; recebimento com
 * tarifa continua sendo feito um a um.
 *
 * Conta de CARTÃO nunca aparece na lista de opções: despesa de cartão só pesa
 * no bolso quando a fatura é quitada, então um lote "no cartão" inventaria uma
 * saída de caixa que não aconteceu (e dinheiro não "entra" em cartão). O
 * servidor também recusa.
 */
export function BatchPayModal({
  open,
  onOpenChange,
  mode = 'pay',
  transactions,
  accounts,
  onConfirm,
  isSubmitting,
}: BatchPayModalProps) {
  const { locale, currency, timezone } = useAppLocaleContext();
  const fin = MESSAGES[locale].app.finance;
  const isReceive = mode === 'receive';
  const t = isReceive ? fin.accounts.batchReceive : fin.accounts.batchPay;
  // Rótulos dos campos: do lado do recebimento vêm do modal de recebimento
  // individual, pra o usuário ler exatamente as mesmas palavras nos dois
  // caminhos ("Data do recebimento", e não "Data do pagamento").
  const fields = isReceive
    ? {
      account: fin.receivePayment.accountLabel,
      accountPlaceholder: fin.receivePayment.accountPlaceholder,
      accountSearch: fin.receivePayment.accountSearchPlaceholder,
      noAccount: fin.receivePayment.noAccountHint,
      method: fin.receivePayment.paymentMethodLabel,
      date: fin.receivePayment.receivedDateLabel,
      dateFuture: fin.receivePayment.validations.dateFuture,
      methods: fin.receivePayment.paymentMethods,
    }
    : {
      account: fin.accounts.payExpenseModal.paidWith,
      accountPlaceholder: fin.accounts.payExpenseModal.selectAccount,
      accountSearch: fin.accounts.payExpenseModal.searchAccount,
      noAccount: fin.accounts.payExpenseModal.noAccountWarning,
      method: fin.accounts.payExpenseModal.paymentMethod,
      date: fin.accounts.payExpenseModal.paymentDate,
      dateFuture: fin.accounts.payExpenseModal.paymentDateFuture,
      methods: {
        dinheiro: fin.accounts.payExpenseModal.paymentMethods.cash,
        pix: fin.accounts.payExpenseModal.paymentMethods.pix,
        cartao_debito: fin.accounts.payExpenseModal.paymentMethods.debit,
        boleto: fin.accounts.payExpenseModal.paymentMethods.boleto,
        transferencia: fin.accounts.payExpenseModal.paymentMethods.transfer,
        cheque: fin.accounts.payExpenseModal.paymentMethods.check,
      },
    };
  // Verde no dinheiro que entra, vermelho no que sai — mesma régua do extrato.
  const accentBg = isReceive ? 'bg-success' : 'bg-primary';
  const amountColor = isReceive ? 'text-success' : 'text-destructive';
  const fmt = (v: number) => formatMoney(v, currency, locale);

  const [accountId, setAccountId] = useState('');
  const [paidDate, setPaidDate] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('pix');

  // Só contas caixa/banco ATIVAS entram no select (nunca cartão).
  const accountOptions = useMemo(
    () => buildAccountOptions(
      accounts.filter((a) => a.is_active && a.type !== 'cartao') as any,
      { cashSuffix: fin.transactionList.cashSuffix, includeCard: false },
    ),
    [accounts, fin.transactionList.cashSuffix],
  );

  // Reabrir o modal sempre parte de "hoje" no fuso DA EMPRESA. `toISOString()`
  // aqui gravaria o dia seguinte a partir das 21h (UTC-3) e jogaria a despesa
  // pro mês errado no regime de Caixa.
  useEffect(() => {
    if (!open) return;
    setPaidDate(todayInTz(timezone));
    setPaymentMethod('pix');
    setAccountId((prev) => (prev && accounts.some((a) => a.id === prev) ? prev : (accounts.find((a) => a.is_active && a.type !== 'cartao')?.id ?? '')));
  }, [open, timezone, accounts]);

  const { count, total } = useMemo(() => summarizeBatchSelection(transactions), [transactions]);

  const dateAllowed = !!paidDate && isPaidDateAllowedInTz(paidDate, timezone);
  const canConfirm = !!accountId && dateAllowed && count > 0 && !isSubmitting;

  const summaryText = (count === 1 ? t.modal.summaryOne : t.modal.summaryMany)
    .replace('{count}', String(count))
    .replace('{total}', fmt(total));

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      title={t.modal.title}
      description={summaryText}
      footer={
        <div className="flex justify-end gap-3">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
            className="min-h-11 rounded-xl"
          >
            {fin.accounts.actions.cancel}
          </Button>
          <Button
            disabled={!canConfirm}
            className="min-h-11 rounded-xl"
            onClick={async () => {
              if (!canConfirm) return;
              await onConfirm({ accountId, paidDate, paymentMethod });
            }}
          >
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {count === 1 ? t.modal.confirmOne : t.modal.confirm.replace('{count}', String(count))}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Total do lote em destaque: é o número que o usuário vai conferir
            contra a linha do extrato do banco. */}
        <div className={cn('flex items-center gap-3 rounded-2xl p-4 text-white', accentBg)}>
          {/* Ícone branco direto no fundo saturado, sem círculo atrás. */}
          <Layers className="h-6 w-6 shrink-0" />
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-wider opacity-90 leading-tight">{t.total}</p>
            <p className="text-xl font-bold tabular-nums leading-tight truncate">{fmt(total)}</p>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>{fields.account}</Label>
          <SearchableSelect
            options={accountOptions}
            value={accountId}
            onValueChange={setAccountId}
            placeholder={fields.accountPlaceholder}
            searchPlaceholder={fields.accountSearch}
            className="w-full justify-between font-normal"
          />
          {accountOptions.length === 0 && (
            <p className="text-xs text-destructive">{fields.noAccount}</p>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>{fields.method}</Label>
            <Select value={paymentMethod} onValueChange={setPaymentMethod}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="dinheiro">{fields.methods.dinheiro}</SelectItem>
                <SelectItem value="pix">{fields.methods.pix}</SelectItem>
                <SelectItem value="cartao_debito">{fields.methods.cartao_debito}</SelectItem>
                <SelectItem value="boleto">{fields.methods.boleto}</SelectItem>
                <SelectItem value="transferencia">{fields.methods.transferencia}</SelectItem>
                <SelectItem value="cheque">{fields.methods.cheque}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>{fields.date}</Label>
            {/* Não existe pagamento no futuro: `max` barra o calendário nativo e
                o `disabled` do Confirmar é quem garante (dá pra digitar a data
                na mão). O servidor recusa de novo, no fuso da empresa. */}
            <Input
              type="date"
              max={todayInTz(timezone)}
              value={paidDate}
              onChange={(e) => setPaidDate(e.target.value)}
            />
            {paidDate && !dateAllowed && (
              <p className="text-xs text-destructive">{fields.dateFuture}</p>
            )}
          </div>
        </div>

        <p className="text-xs text-muted-foreground">{t.modal.singleEventHint}</p>

        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <h4 className="text-xs font-bold uppercase tracking-widest text-foreground/70">
              {t.modal.listTitle}
            </h4>
            <Badge className={cn('text-white text-[10px] px-1.5 py-0', accentBg)}>{count}</Badge>
          </div>
          {/* Lista rolável: 500 contas cabem no lote, então a altura é limitada
              e o rodapé do modal (com o Confirmar) continua sempre visível. */}
          <div className="max-h-56 overflow-y-auto rounded-xl border divide-y">
            {transactions.map((txn) => (
              <div key={txn.id} className="flex items-center justify-between gap-3 px-3 py-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{txn.description}</p>
                  {txn.due_date && (
                    <p className="text-[11px] text-muted-foreground">
                      {fin.accounts.table.dueDate}: {format(parseLocalDate(txn.due_date), 'dd/MM/yyyy', { locale: ptBR })}
                    </p>
                  )}
                </div>
                <span className={cn('text-sm font-semibold tabular-nums whitespace-nowrap', amountColor)}>
                  {fmt(Number(txn.amount))}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </ResponsiveModal>
  );
}
