import { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import { pdvCashErrorMessage } from '@/lib/pdv/cash-errors';
import { PdvMoneyInput } from './PdvMoneyInput';
import type { pdv } from '@/lib/i18n/messages/app/pdv';

type MovementTexts = (typeof pdv)['pt-br']['cashPanel']['movementDialog'];

/** Valor do item "não sai do cofre" (o Radix Select não aceita value vazio). */
const NO_ACCOUNT = '__none__';

interface PdvCashMovementDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kind: 'sangria' | 'suprimento';
  texts: MovementTexts;
  /** Contas elegíveis (banco e dinheiro, sem cartão e sem a própria conta do cofre). */
  accounts: Array<{ id: string; name: string }>;
  /** Esperado na gaveta agora, pra o operador não pedir sangria maior que o que tem. */
  drawerAmount: number;
  /** Só quem tem permissão financeira escolhe conta (a perna gera lançamento). */
  canChooseAccount: boolean;
  onConfirm: (args: {
    kind: 'sangria' | 'suprimento';
    amount: number;
    toAccountId: string | null;
    reason: string | null;
  }) => Promise<void>;
}

/**
 * Sangria e suprimento.
 *
 * COM conta escolhida, a RPC gera o PAR de transferência (mesmo
 * `transfer_pair_id`, categoria "Transferência entre contas"), exatamente como
 * o `transfer()` do Financeiro: é movimento de BALANÇO, não receita nem
 * despesa. SEM conta, não existe lançamento nenhum (o dinheiro não saiu do
 * cofre, só da gaveta) e muda apenas o esperado da conferência.
 */
export function PdvCashMovementDialog({
  open,
  onOpenChange,
  kind,
  texts,
  accounts,
  drawerAmount,
  canChooseAccount,
  onConfirm,
}: PdvCashMovementDialogProps) {
  const { money } = useLocaleFormatters();
  const [amount, setAmount] = useState(0);
  const [accountId, setAccountId] = useState<string>(NO_ACCOUNT);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const submitGuard = useRef(false);

  const isBleed = kind === 'sangria';

  useEffect(() => {
    if (!open) return;
    setAmount(0);
    setAccountId(NO_ACCOUNT);
    setReason('');
    setServerError(null);
    setSubmitting(false);
    submitGuard.current = false;
  }, [open, kind]);

  async function handleConfirm() {
    if (submitGuard.current || amount <= 0) return;
    submitGuard.current = true;
    setSubmitting(true);
    setServerError(null);
    try {
      await onConfirm({
        kind,
        amount,
        toAccountId: accountId === NO_ACCOUNT ? null : accountId,
        reason: reason.trim() || null,
      });
      onOpenChange(false);
    } catch (error) {
      setServerError(pdvCashErrorMessage(error));
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
      <Button type="button" disabled={submitting || amount <= 0} onClick={handleConfirm}>
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
      title={isBleed ? texts.bleedTitle : texts.supplyTitle}
      description={isBleed ? texts.bleedDescription : texts.supplyDescription}
      className="sm:max-w-[440px]"
      footer={footer}
    >
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="pdv-mov-amount">{texts.amount}</Label>
          <PdvMoneyInput id="pdv-mov-amount" value={amount} onChange={setAmount} autoFocus />
          <p className="text-xs text-muted-foreground">
            {texts.inDrawer.replace('{value}', money(drawerAmount))}
          </p>
        </div>

        {canChooseAccount && accounts.length > 0 && (
          <div className="space-y-1.5">
            <Label htmlFor="pdv-mov-account">
              {isBleed ? texts.accountBleed : texts.accountSupply}
            </Label>
            <Select value={accountId} onValueChange={setAccountId}>
              <SelectTrigger id="pdv-mov-account">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_ACCOUNT}>{texts.accountNone}</SelectItem>
                {accounts.map((acc) => (
                  <SelectItem key={acc.id} value={acc.id}>
                    {acc.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{texts.accountHint}</p>
          </div>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="pdv-mov-reason">{texts.reason}</Label>
          <Input
            id="pdv-mov-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={texts.reasonPlaceholder}
          />
        </div>

        {serverError && <NoticeBanner variant="destructive">{serverError}</NoticeBanner>}
      </div>
    </ResponsiveModal>
  );
}
