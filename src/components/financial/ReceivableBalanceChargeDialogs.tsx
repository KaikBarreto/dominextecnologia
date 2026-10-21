/**
 * Diálogos do "Cobrar o saldo" de uma conta a receber.
 *
 * Renderizar UMA vez por tela, fora da lista (são portais), alimentados pelo
 * estado de `useReceivableBalanceCharge`. São três:
 *
 *   1. SUBSTITUIR a cobrança — confirmação que diz os DOIS valores ("isso
 *      cancela a cobrança atual de R$ X e emite uma nova de R$ Y"). É de dois
 *      passos de propósito: cancela e só depois cria. A edge de criação nunca
 *      mata cobrança por conta própria.
 *   2. Depois do recebimento, com cobrança viva na conta — as duas saídas:
 *      cobrar só o que falta, ou encerrar a cobrança (recebi tudo por fora).
 *   3. O ChargeDialog de sempre, com `source = receivable`: valor TRAVADO no
 *      saldo, vencimento escolhido pelo gestor.
 *
 * `ResponsiveModal` nos dois primeiros: no celular viram drawer de baixo, e a
 * decisão tem botão por linha (nada de três botões disputando 390px).
 */
import { Button } from '@/components/ui/button';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { NoticeBanner } from '@/components/ui/NoticeBanner';
import { Loader2 } from 'lucide-react';
import { ChargeDialog } from './ChargeDialog';
import type { ReceivableBalanceCharge } from './useReceivableBalanceCharge';

export function ReceivableBalanceChargeDialogs({ charge }: { charge: ReceivableBalanceCharge }) {
  const { t, money, replaceTarget, afterReceipt, chargeTarget } = charge;

  return (
    <>
      {/* ── 1. Substituir a cobrança (cancela a atual, emite a do saldo) ───── */}
      <ResponsiveModal
        open={!!replaceTarget}
        onOpenChange={(open) => { if (!open) charge.cancelReplace(); }}
        title={t.replaceDialog.title}
        footer={
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              variant="outline"
              className="w-full sm:w-auto"
              onClick={charge.cancelReplace}
              disabled={charge.isReplacing}
            >
              {t.replaceDialog.cancel}
            </Button>
            <Button
              className="w-full sm:w-auto"
              onClick={charge.confirmReplace}
              disabled={charge.isReplacing}
            >
              {charge.isReplacing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t.replaceDialog.working}
                </>
              ) : (
                t.replaceDialog.confirm
              )}
            </Button>
          </div>
        }
      >
        {replaceTarget && (
          <div className="space-y-3 pb-2">
            {/* Os DOIS valores, por extenso: o que morre e o que nasce. */}
            <NoticeBanner variant="warning">
              {t.replaceDialog.body
                .replace('{current}', money(replaceTarget.liveCharge.value))
                .replace('{next}', money(replaceTarget.balance))}
            </NoticeBanner>
            <p className="text-sm text-muted-foreground">{t.replaceDialog.note}</p>
            {replaceTarget.liveCharge.invoiceUrl && (
              <a
                href={replaceTarget.liveCharge.invoiceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block text-sm font-medium text-primary underline underline-offset-2"
              >
                {t.viewAction}
              </a>
            )}
          </div>
        )}
      </ResponsiveModal>

      {/* ── 2. Depois do recebimento: as duas saídas ────────────────────────── */}
      <ResponsiveModal
        open={!!afterReceipt}
        onOpenChange={(open) => { if (!open) charge.dismissAfterReceipt(); }}
        title={t.afterReceipt.title}
        footer={afterReceipt ? (
          // Um botão por LINHA, no rodapé fixo: em 390px três ações lado a lado
          // quebravam o rótulo no meio, e no drawer o rodapé fica fora do
          // scroll (a decisão nunca fica escondida embaixo do texto).
          <div className="flex flex-col gap-2">
            {afterReceipt.balanceAfter > 0 && afterReceipt.customerId && (
              <Button className="w-full" onClick={charge.chargeRemainingAfterReceipt}>
                {t.afterReceipt.chargeRemaining.replace('{balance}', money(afterReceipt.balanceAfter))}
              </Button>
            )}
            <Button
              variant="destructive"
              className="w-full"
              onClick={charge.closeChargeAfterReceipt}
              disabled={charge.isReplacing}
            >
              {charge.isReplacing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t.replaceDialog.working}
                </>
              ) : (
                t.afterReceipt.closeCharge
              )}
            </Button>
            <Button variant="outline" className="w-full" onClick={charge.dismissAfterReceipt}>
              {t.afterReceipt.keep}
            </Button>
          </div>
        ) : undefined}
      >
        {afterReceipt && (
          <div className="pb-2">
            <NoticeBanner variant="warning">
              {afterReceipt.balanceAfter > 0
                ? t.afterReceipt.bodyWithBalance
                    .replace('{received}', money(afterReceipt.receivedNow))
                    .replace('{balance}', money(afterReceipt.balanceAfter))
                    .replace('{charge}', money(afterReceipt.liveCharge.value))
                : t.afterReceipt.bodyNoBalance
                    .replace('{charge}', money(afterReceipt.liveCharge.value))}
            </NoticeBanner>
          </div>
        )}
      </ResponsiveModal>

      {/* ── 3. Emitir a cobrança do saldo ───────────────────────────────────── */}
      {chargeTarget && (
        <ChargeDialog
          open
          onOpenChange={(open) => { if (!open) charge.closeChargeDialog(); }}
          presetCustomerId={chargeTarget.customerId}
          lockCustomer
          presetAmount={chargeTarget.balance}
          presetDescription={chargeTarget.description ?? undefined}
          presetDueDate={chargeTarget.dueDate}
          source={{ type: 'receivable', id: chargeTarget.receivableId }}
          onLiveChargeConflict={charge.handleLiveChargeConflict}
        />
      )}
    </>
  );
}
