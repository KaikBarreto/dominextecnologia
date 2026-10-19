import { useEffect, useRef, useState } from 'react';
import { Loader2, Vault } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { NoticeBanner } from '@/components/ui/NoticeBanner';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useLocaleFormatters } from '@/lib/format/hooks';
import { isCofreLimitError, pdvCashErrorMessage } from '@/lib/pdv/cash-errors';
import { PdvMoneyInput } from './PdvMoneyInput';
import type { PdvCofreBalance, PdvTerminal } from '@/hooks/usePdvCashRegister';
import type { pdv } from '@/lib/i18n/messages/app/pdv';

type OpenTexts = (typeof pdv)['pt-br']['cashPanel']['openDialog'];

interface PdvOpenCashDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  texts: OpenTexts;
  terminals: PdvTerminal[];
  cofre: PdvCofreBalance | null;
  /** Quanto o último caixa fechado deixou na gaveta, quando existir. */
  lastClosedCounted?: number | null;
  /** Mostra a saída "Ajustar o saldo do cofre" (permissão financeira). */
  canAdjustCofre: boolean;
  onAdjustCofre: () => void;
  onConfirm: (args: { terminalId: string; openingAmount: number }) => Promise<void>;
}

/**
 * Abrir caixa, com A REGRA DO COFRE na tela.
 *
 * Abrir não move dinheiro: reserva. Quando o valor passa do disponível e o
 * controle estrito está ligado, a RPC RECUSA com mensagem PT-BR já pronta pro
 * operador, e a tela oferece as duas saídas que a EcoSistema acertou:
 * "Abrir com valor menor" e "Ajustar o saldo do cofre".
 */
export function PdvOpenCashDialog({
  open,
  onOpenChange,
  texts,
  terminals,
  cofre,
  lastClosedCounted,
  canAdjustCofre,
  onAdjustCofre,
  onConfirm,
}: PdvOpenCashDialogProps) {
  const { money } = useLocaleFormatters();
  const [terminalId, setTerminalId] = useState('');
  const [amount, setAmount] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [cofreBlocked, setCofreBlocked] = useState(false);
  // Trava síncrona: duplo clique não pode abrir dois caixas.
  const submitGuard = useRef(false);

  useEffect(() => {
    if (!open) return;
    setTerminalId(terminals[0]?.id ?? '');
    setAmount(0);
    setServerError(null);
    setCofreBlocked(false);
    setSubmitting(false);
    submitGuard.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const strict = cofre?.controle_estrito !== false;
  const hasCofreAccount = !!cofre?.conta_id;

  async function handleConfirm() {
    if (submitGuard.current || !terminalId) return;
    submitGuard.current = true;
    setSubmitting(true);
    setServerError(null);
    setCofreBlocked(false);
    try {
      await onConfirm({ terminalId, openingAmount: amount });
      onOpenChange(false);
    } catch (error) {
      setServerError(pdvCashErrorMessage(error));
      setCofreBlocked(isCofreLimitError(error));
    } finally {
      setSubmitting(false);
      submitGuard.current = false;
    }
  }

  const footer = (
    <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
      <Button type="button" variant="outline" disabled={submitting} onClick={() => onOpenChange(false)}>
        {texts.cancel}
      </Button>
      <Button type="button" disabled={submitting || !terminalId} onClick={handleConfirm}>
        {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        {texts.confirm}
      </Button>
    </div>
  );

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={(v) => {
        if (!v && !submitting) onOpenChange(false);
      }}
      title={texts.title}
      className="sm:max-w-[460px]"
      footer={footer}
    >
      <div className="space-y-4">
        {terminals.length > 1 && (
          <div className="space-y-1.5">
            <Label htmlFor="pdv-open-terminal">{texts.terminal}</Label>
            <Select value={terminalId} onValueChange={setTerminalId}>
              <SelectTrigger id="pdv-open-terminal">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {terminals.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="pdv-open-amount">{texts.amount}</Label>
          <PdvMoneyInput id="pdv-open-amount" value={amount} onChange={setAmount} autoFocus />
          <p className="text-xs text-muted-foreground">{texts.amountHint}</p>
          {lastClosedCounted != null && (
            <p className="text-xs text-muted-foreground">
              {texts.lastClosedHint.replace('{value}', money(Number(lastClosedCounted) || 0))}
            </p>
          )}
        </div>

        {/* A regra do cofre, escrita na tela antes de o operador errar. */}
        <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
          <p className="flex items-start gap-2 text-xs text-muted-foreground">
            <Vault className="mt-0.5 h-4 w-4 shrink-0" />
            {texts.cofreRule}
          </p>
          {hasCofreAccount ? (
            <p className="text-sm font-semibold tabular-nums">
              {texts.cofreAvailable.replace('{value}', money(cofre.disponivel))}
            </p>
          ) : (
            <p className="text-sm font-semibold">{texts.cofreMissing}</p>
          )}
          {!strict && <p className="text-xs text-muted-foreground">{texts.strictOff}</p>}
        </div>

        {serverError && <NoticeBanner variant="destructive">{serverError}</NoticeBanner>}

        {/* As duas saídas do beco sem saída. */}
        {cofreBlocked && (
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={() => {
                if (cofre) setAmount(Math.max(0, cofre.disponivel));
                setServerError(null);
                setCofreBlocked(false);
              }}
            >
              {texts.reduce}
            </Button>
            {canAdjustCofre && (
              <Button type="button" variant="outline" className="flex-1" onClick={onAdjustCofre}>
                {texts.adjustCofre}
              </Button>
            )}
          </div>
        )}
      </div>
    </ResponsiveModal>
  );
}
