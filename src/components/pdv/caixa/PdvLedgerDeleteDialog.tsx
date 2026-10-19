import { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { normalizePaymentMethod } from '@/lib/finance-payment-methods';
import type { PdvLedgerEntry, PdvReversalEffect, PdvReversalPlan } from '@/lib/pdv/cash';
import { round2 } from '@/lib/pdv/cash';
import type { pdv } from '@/lib/i18n/messages/app/pdv';

type HistoryTexts = (typeof pdv)['pt-br']['cashPanel']['history'];

interface PdvLedgerDeleteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  texts: HistoryTexts;
  entry: PdvLedgerEntry | null;
  plan: PdvReversalPlan | null;
  money: (value: number) => string;
  isPending: boolean;
  /** `reason` só é usado no cancelamento de venda (a RPC recebe o motivo). */
  onConfirm: (reason: string | null) => void;
}

/**
 * Confirmação de "desfazer" uma linha do histórico do caixa.
 *
 * A régua é a frase do CEO: "revertendo todos os efeitos como se nunca tivesse
 * existido". Então a confirmação NÃO pergunta "tem certeza?" — ela LISTA, item
 * por item, o que vai ser desfeito (estoque volta, lançamento cancelado, fiado
 * ajustado, esperado da gaveta cai). Quem decide é o operador, com o efeito na
 * frente dos olhos.
 *
 * `AlertDialog` da casa já vira drawer no mobile (ver `ui/alert-dialog.tsx`),
 * então não há caminho separado pra 390px.
 */
export function PdvLedgerDeleteDialog({
  open,
  onOpenChange,
  texts,
  entry,
  plan,
  money,
  isPending,
  onConfirm,
}: PdvLedgerDeleteDialogProps) {
  const [reason, setReason] = useState('');

  // Motivo não vaza de uma exclusão pra outra.
  useEffect(() => {
    if (open) setReason('');
  }, [open, entry?.key]);

  const isSale = entry?.kind === 'venda';
  /**
   * Sangria/suprimento desfeito pela RPC `pdv_revert_cash_movement`. Ela aceita
   * motivo (vira `cancelled_reason` no movimento), então o campo aparece aqui
   * também — "desfiz porque digitei 500 em vez de 50" é a informação que o
   * gestor vai procurar no fechamento.
   */
  const isMovement = plan?.path === 'revert_movement';
  const showReason = isSale || isMovement;

  /**
   * Quanto o esperado da gaveta cai: só a parte paga EM DINHEIRO. O histórico
   * do caixa só conta pedido `pago`/`entregue`, então cancelar tira a venda da
   * conta do esperado — e é a perna de dinheiro que some da gaveta.
   */
  const cashImpact = round2(
    (entry?.detail?.payments ?? [])
      .filter((p) => (normalizePaymentMethod(p.method) ?? p.method) === 'dinheiro')
      .reduce((sum, p) => sum + (Number(p.amount) || 0), 0),
  );

  /**
   * Quanto o esperado da gaveta muda ao desfazer sangria/suprimento: o valor
   * CHEIO do movimento, porque é exatamente ele que entrou na conta do esperado
   * (`esperado = abertura + vendas em dinheiro + suprimentos − sangrias`).
   */
  const movementImpact = round2(Number(entry?.amount) || 0);

  const effectText: Record<PdvReversalEffect, string> = {
    stock: texts.effectStock,
    finance_cancelled: texts.effectFinanceCancelled,
    finance_deleted: texts.effectFinanceDeleted,
    credit_ledger: texts.effectCreditLedger,
    drawer: texts.effectDrawer.replace('{value}', money(cashImpact)),
    drawer_mirror_stays: texts.effectDrawerMirrorStays,
    movement_cancelled: texts.effectMovementCancelled,
    movement_finance_pair: texts.effectMovementFinancePair,
    drawer_restore: texts.effectDrawerRestore.replace('{value}', money(movementImpact)),
    drawer_reduce: texts.effectDrawerReduce.replace('{value}', money(movementImpact)),
  };

  // Venda paga 100% no cartão/pix não mexe na gaveta: a linha não aparece.
  const effects = (plan?.effects ?? []).filter((e) => e !== 'drawer' || cashImpact > 0);

  return (
    <AlertDialog
      open={open}
      onOpenChange={(v) => {
        if (!isPending) onOpenChange(v);
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <div className="flex justify-center sm:justify-start">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-destructive">
              <AlertTriangle className="h-5 w-5 text-white" />
            </span>
          </div>
          <AlertDialogTitle>
            {isSale
              ? texts.deleteSaleTitle.replace('{reference}', entry?.reference ?? '')
              : isMovement
                ? entry?.kind === 'suprimento'
                  ? texts.deleteSupplyTitle
                  : texts.deleteBleedTitle
                : texts.deleteTransactionTitle}
          </AlertDialogTitle>
          <AlertDialogDescription>{texts.deleteIntro}</AlertDialogDescription>
        </AlertDialogHeader>

        <ul className="space-y-1.5 text-sm">
          {effects.map((effect) => (
            <li key={effect} className="flex gap-2">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-destructive" />
              <span>{effectText[effect]}</span>
            </li>
          ))}
        </ul>

        {showReason && (
          <div className="space-y-1.5 pt-1">
            <Label htmlFor="pdv-ledger-delete-reason">{texts.deleteReason}</Label>
            <Input
              id="pdv-ledger-delete-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={
                isMovement
                  ? texts.deleteReasonMovementPlaceholder
                  : texts.deleteReasonPlaceholder
              }
              maxLength={200}
            />
          </div>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>{texts.deleteCancel}</AlertDialogCancel>
          <AlertDialogAction
            // Vermelho SATURADO com texto branco: ação destrutiva por token,
            // nunca o azul padrão do botão primário.
            className="bg-destructive text-white hover:bg-destructive/90"
            disabled={isPending}
            onClick={(e) => {
              e.preventDefault();
              onConfirm(reason.trim() ? reason.trim() : null);
            }}
          >
            {isSale
              ? texts.deleteConfirmSale
              : isMovement
                ? texts.deleteConfirmMovement
                : texts.deleteConfirmTransaction}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
