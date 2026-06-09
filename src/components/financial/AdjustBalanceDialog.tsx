import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { ArrowDownCircle, ArrowUpCircle, Loader2 } from 'lucide-react';
import { useFinancial } from '@/hooks/useFinancial';
import { useFinancialAccounts, type FinancialAccount } from '@/hooks/useFinancialAccounts';
import { useToast } from '@/hooks/use-toast';
import { formatBRL } from '@/utils/currency';
import { ADJUSTMENT_CATEGORY } from '@/lib/finance-constants';
import { cn } from '@/lib/utils';

/** Data de hoje (YYYY-MM-DD) no fuso de São Paulo — o padrão de data do app. */
function todayBR(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

interface AdjustBalanceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Conta cujo saldo será ajustado. Null fecha o dialog. */
  account: FinancialAccount | null;
}

/**
 * "Ajustar saldo" de uma conta/caixa: o usuário informa o saldo que a conta
 * DEVERIA ter e o sistema gera UMA transação de ajuste pela diferença (entrada
 * se faltou, saída se sobrou) na categoria reservada "Ajuste de saldo". Como o
 * saldo da conta deriva das transações, depois do lançamento ele passa a bater
 * o valor desejado. A transação de ajuste é excluída do DRE (conciliação, não
 * é receita/despesa real). Cartão não tem ajuste — só contas/caixa.
 */
export function AdjustBalanceDialog({ open, onOpenChange, account }: AdjustBalanceDialogProps) {
  const { balances } = useFinancialAccounts();
  const { createTransaction } = useFinancial();
  const { toast } = useToast();

  // Saldo atual derivado das transações (fallback no saldo inicial).
  const currentBalance = account
    ? (balances[account.id] ?? Number(account.initial_balance ?? 0))
    : 0;

  // Novo saldo desejado, em reais (não centavos — o input usa máscara BRL).
  const [targetBalance, setTargetBalance] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  // Trava de reentrância síncrona: duplo-clique não pode gerar dois ajustes.
  const submitGuard = useRef(false);

  // Ao abrir, pré-preenche o campo com o saldo atual (ponto de partida natural).
  useEffect(() => {
    if (open && account) {
      setTargetBalance(currentBalance);
      submitGuard.current = false;
      setSubmitting(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, account?.id]);

  // Máscara de moeda BRL: mesmo padrão do AccountFormDialog (dígitos → centavos).
  const handleCurrencyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/\D/g, '');
    setTargetBalance(parseInt(raw || '0', 10) / 100);
  };

  const targetDisplay = targetBalance
    ? targetBalance.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : '';

  const delta = targetBalance - currentBalance;
  const isNeutral = Math.abs(delta) < 0.005;
  const isEntrada = delta > 0;

  const handleConfirm = async () => {
    if (!account) return;
    // Trava síncrona — cobre duplo-clique e qualquer redisparo antes do estado atualizar.
    if (submitGuard.current) return;

    if (isNeutral) {
      toast({ title: 'O saldo já está nesse valor', description: 'Nenhum ajuste foi necessário.' });
      onOpenChange(false);
      return;
    }

    submitGuard.current = true;
    setSubmitting(true);
    try {
      const today = todayBR();
      await createTransaction.mutateAsync({
        transaction_type: delta > 0 ? 'entrada' : 'saida',
        amount: Math.abs(delta),
        account_id: account.id,
        category: ADJUSTMENT_CATEGORY,
        description: ADJUSTMENT_CATEGORY,
        transaction_date: today,
        paid_date: today,
        is_paid: true,
      });
      toast({
        title: 'Saldo ajustado!',
        description: `Novo saldo da conta: R$ ${formatBRL(targetBalance)}.`,
      });
      onOpenChange(false);
    } catch {
      // O hook createTransaction já exibe o toast de erro.
    } finally {
      setSubmitting(false);
      submitGuard.current = false;
    }
  };

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={(v) => { if (!v && !submitting) onOpenChange(false); }}
      title={account ? `Ajustar saldo · ${account.name}` : 'Ajustar saldo'}
      className="sm:max-w-[440px]"
    >
      {account && (
        <div className="space-y-4">
          {/* Saldo atual da conta */}
          <div className="rounded-lg border bg-muted/30 px-4 py-3 flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Saldo atual</span>
            <span className={cn('text-base font-bold tabular-nums', currentBalance >= 0 ? 'text-success' : 'text-destructive')}>
              R$ {formatBRL(currentBalance)}
            </span>
          </div>

          {/* Novo saldo desejado */}
          <div className="space-y-1.5">
            <Label>Saldo em conta (R$)</Label>
            <Input
              placeholder="0,00"
              value={targetDisplay}
              onChange={handleCurrencyChange}
              inputMode="numeric"
              autoFocus
            />
            <p className="text-xs text-muted-foreground">
              Informe quanto a conta realmente tem. O sistema lança a diferença automaticamente.
            </p>
          </div>

          {/* Preview do ajuste */}
          {isNeutral ? (
            <div className="rounded-lg border border-dashed px-4 py-3 text-sm text-muted-foreground text-center">
              O saldo já está nesse valor.
            </div>
          ) : (
            <div className={cn(
              'rounded-lg border px-4 py-3 flex items-center gap-3',
              isEntrada ? 'border-success/40 bg-success/5' : 'border-destructive/40 bg-destructive/5'
            )}>
              {isEntrada ? (
                <ArrowUpCircle className="h-5 w-5 text-success shrink-0" />
              ) : (
                <ArrowDownCircle className="h-5 w-5 text-destructive shrink-0" />
              )}
              <p className="text-sm">
                Será lançado um ajuste de{' '}
                <span className={cn('font-bold', isEntrada ? 'text-success' : 'text-destructive')}>
                  {isEntrada ? '+' : '−'}R$ {formatBRL(Math.abs(delta))}
                </span>{' '}
                <span className="text-muted-foreground">({isEntrada ? 'entrada' : 'saída'})</span>.
              </p>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-1">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
              Cancelar
            </Button>
            <Button type="button" onClick={handleConfirm} disabled={submitting || isNeutral}>
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Ajustando...
                </>
              ) : (
                'Confirmar ajuste'
              )}
            </Button>
          </div>
        </div>
      )}
    </ResponsiveModal>
  );
}
