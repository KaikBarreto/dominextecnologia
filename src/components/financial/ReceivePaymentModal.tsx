import { useState, useEffect, useMemo } from 'react';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useFinancialAccounts } from '@/hooks/useFinancialAccounts';
import { Wallet, Landmark, CreditCard } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export interface ReceivePaymentResult {
  account_id: string;
  payment_method: string;
  paid_date: string;
  fee_amount: number;
  notes?: string;
  /** Quanto está sendo recebido neste evento. Quando ausente, equivale ao total restante (= amount - amount_received). */
  amount_received?: number;
  /** Novo vencimento do saldo restante (YYYY-MM-DD). Só vem preenchido em recebimento parcial. */
  new_due_date?: string;
}

interface ReceivePaymentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Valor total da conta (mãe). */
  amount: number;
  /** Quanto já foi recebido em recebimentos parciais anteriores. Default 0. */
  amountReceived?: number;
  /** Habilita o fluxo de recebimento parcial. Default false (mantém comportamento atual). */
  allowPartial?: boolean;
  /** Total de parcelas da transação. Se > 1, o campo "Valor recebido" fica desabilitado (regra: parcelado não usa parcial). */
  installmentTotal?: number;
  /** Vencimento atual da conta — usado pra calcular default do "novo vencimento" (atual + 30 dias). */
  currentDueDate?: string;
  title?: string;
  description?: string;
  defaultMethod?: string;
  onConfirm: (result: ReceivePaymentResult) => Promise<void> | void;
  isSubmitting?: boolean;
}

const PAYMENT_METHODS = [
  { value: 'dinheiro', label: 'Dinheiro' },
  { value: 'pix', label: 'PIX' },
  { value: 'debito', label: 'Cartão de Débito' },
  { value: 'credito_avista', label: 'Cartão de Crédito (à vista)' },
  { value: 'credito_parcelado', label: 'Cartão de Crédito (parcelado)' },
  { value: 'boleto', label: 'Boleto' },
  { value: 'transferencia', label: 'Transferência' },
  { value: 'cheque', label: 'Cheque' },
];

function fmt(v: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
}

/** Soma N dias a uma data YYYY-MM-DD e devolve YYYY-MM-DD (sem deslocar timezone). */
function addDaysISO(dateStr: string | undefined, days: number): string {
  const base = dateStr ? new Date(dateStr + 'T12:00:00') : new Date();
  base.setDate(base.getDate() + days);
  return base.toISOString().split('T')[0];
}

function parseDecimal(v: string): number {
  if (!v) return 0;
  // aceita "1.234,56" ou "1234.56" — remove pontos de milhar, troca vírgula por ponto
  const normalized = v.replace(/\./g, '').replace(',', '.');
  const n = Number(normalized);
  return Number.isFinite(n) ? n : 0;
}

function getAccIcon(type: string) {
  if (type === 'caixa') return Wallet;
  if (type === 'cartao') return CreditCard;
  return Landmark;
}

export function ReceivePaymentModal({
  open, onOpenChange, amount,
  amountReceived = 0,
  allowPartial = false,
  installmentTotal = 1,
  currentDueDate,
  title = 'Como foi recebido?',
  description, defaultMethod = 'pix', onConfirm, isSubmitting,
}: ReceivePaymentModalProps) {
  const { accounts } = useFinancialAccounts();
  const activeAccounts = useMemo(() => accounts.filter(a => a.is_active), [accounts]);

  // Saldo que falta receber (total - já recebido).
  const restante = useMemo(() => Math.max(0, Number((amount - amountReceived).toFixed(2))), [amount, amountReceived]);
  const isParcelada = (installmentTotal ?? 1) > 1;
  const partialEnabled = allowPartial && !isParcelada;

  const [accountId, setAccountId] = useState<string>('');
  const [method, setMethod] = useState(defaultMethod);
  const [paidDate, setPaidDate] = useState(new Date().toISOString().split('T')[0]);
  const [feeAmount, setFeeAmount] = useState('');
  const [notes, setNotes] = useState('');
  // Valor recebido (string pra deixar o input livre — convertido no submit/validação).
  const [valorRecebidoStr, setValorRecebidoStr] = useState<string>('');
  // Novo vencimento do saldo restante (só usado quando parcial).
  const [novoVencimento, setNovoVencimento] = useState<string>('');

  useEffect(() => {
    if (open) {
      setMethod(defaultMethod);
      setPaidDate(new Date().toISOString().split('T')[0]);
      setFeeAmount('');
      setNotes('');
      // Default = o que falta receber (formatado pt-BR).
      setValorRecebidoStr(restante.toFixed(2).replace('.', ','));
      // Default = vencimento atual + 30 dias.
      setNovoVencimento(addDaysISO(currentDueDate, 30));
      if (!accountId && activeAccounts[0]) setAccountId(activeAccounts[0].id);
    }
  }, [open, defaultMethod, restante, currentDueDate]); // eslint-disable-line

  const valorRecebido = useMemo(() => parseDecimal(valorRecebidoStr), [valorRecebidoStr]);
  const fee = parseDecimal(feeAmount);
  const liquid = valorRecebido - fee;
  // No fluxo legado (allowPartial=false): valor recebido = amount inteiro.
  const valorEfetivo = partialEnabled ? valorRecebido : amount;
  const restanteApos = Math.max(0, Number((restante - valorEfetivo).toFixed(2)));
  const isPartial = partialEnabled && valorEfetivo > 0 && valorEfetivo < restante;

  // Validação do valor recebido (só quando parcial habilitado).
  const valorInvalido = partialEnabled && (valorEfetivo <= 0 || valorEfetivo > restante);
  let valorErro: string | null = null;
  if (partialEnabled) {
    if (valorEfetivo <= 0) valorErro = 'Informe um valor maior que zero.';
    else if (valorEfetivo > restante) valorErro = `Valor não pode ser maior que o restante (${fmt(restante)}).`;
  }

  const novoVencimentoInvalido = isPartial && !novoVencimento;

  const handleSubmit = async () => {
    if (!accountId) return;
    if (valorInvalido) return;
    if (novoVencimentoInvalido) return;

    await onConfirm({
      account_id: accountId,
      payment_method: method,
      paid_date: paidDate,
      fee_amount: fee,
      notes: notes.trim() || undefined,
      // Só envia amount_received se o fluxo parcial estiver habilitado E o valor diferir do restante.
      // Quando = restante, deixa undefined pro hook usar o caminho de quitação total (UPDATE direto na mãe).
      amount_received: partialEnabled && valorEfetivo < restante ? valorEfetivo : undefined,
      new_due_date: isPartial ? novoVencimento : undefined,
    });
  };

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description ?? `Valor: ${fmt(amount)}`}
    >
      <div className="space-y-4">
        {/* Valor recebido — primeiro campo lógico, só renderiza quando parcial habilitado */}
        {partialEnabled && (
          <div>
            <Label>Valor recebido *</Label>
            <Input
              type="text"
              inputMode="decimal"
              placeholder="0,00"
              value={valorRecebidoStr}
              onChange={e => setValorRecebidoStr(e.target.value)}
              disabled={isParcelada}
              className={cn(valorErro && 'border-destructive focus-visible:ring-destructive')}
            />
            {isParcelada ? (
              <p className="text-xs text-muted-foreground mt-1">
                Conta parcelada — recebimento parcial não está disponível.
              </p>
            ) : valorErro ? (
              <p className="text-xs text-destructive mt-1">{valorErro}</p>
            ) : (
              <p className="text-xs text-muted-foreground mt-1">
                Restante a receber: <span className="font-medium">{fmt(restante)}</span>.
                Informe um valor menor para registrar um recebimento parcial.
              </p>
            )}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Forma de pagamento *</Label>
            <Select value={method} onValueChange={setMethod}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {PAYMENT_METHODS.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Data do recebimento *</Label>
            <Input type="date" value={paidDate} onChange={e => setPaidDate(e.target.value)} />
          </div>
        </div>

        <div>
          <Label>Caixa / Conta bancária *</Label>
          <Select value={accountId} onValueChange={setAccountId}>
            <SelectTrigger>
              <SelectValue placeholder="Selecione um caixa ou conta" />
            </SelectTrigger>
            <SelectContent>
              {activeAccounts.map(a => {
                const Icon = getAccIcon(a.type);
                return (
                  <SelectItem key={a.id} value={a.id}>
                    <span className="flex items-center gap-2">
                      <span className="rounded-full p-1" style={{ backgroundColor: a.color }}>
                        <Icon className="h-3 w-3 text-white" />
                      </span>
                      {a.type === 'caixa' ? `${a.name} (dinheiro)` : a.name}
                    </span>
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
          {activeAccounts.length === 0 && (
            <p className="text-xs text-destructive mt-1">Cadastre um caixa ou conta primeiro.</p>
          )}
        </div>

        <div>
          <Label>Tarifa de máquina/gateway (R$)</Label>
          <Input
            type="text"
            inputMode="decimal"
            placeholder="0,00"
            value={feeAmount}
            onChange={e => setFeeAmount(e.target.value)}
          />
          <p className="text-xs text-muted-foreground mt-1">
            Será lançado como despesa em "Tarifas e Taxas" (deduzida da receita líquida no DRE).
          </p>
        </div>

        {/* Novo vencimento do saldo restante — só quando há saldo restante após este recebimento */}
        {isPartial && (
          <div>
            <Label>Novo vencimento do saldo restante *</Label>
            <Input
              type="date"
              value={novoVencimento}
              onChange={e => setNovoVencimento(e.target.value)}
              className={cn(novoVencimentoInvalido && 'border-destructive focus-visible:ring-destructive')}
            />
            <p className="text-xs text-muted-foreground mt-1">
              Saldo de <span className="font-medium">{fmt(restanteApos)}</span> ficará pendente com este novo vencimento.
            </p>
          </div>
        )}

        {fee > 0 && (
          <Card className="p-3 bg-muted/30 border-warning/30">
            <div className="flex justify-between text-sm">
              <span>Valor bruto recebido</span><span className="font-medium">{fmt(valorEfetivo)}</span>
            </div>
            <div className="flex justify-between text-sm text-destructive">
              <span>Tarifa</span><span>− {fmt(fee)}</span>
            </div>
            <div className="flex justify-between text-sm font-semibold pt-1 border-t mt-1">
              <span>Líquido na conta</span><span className="text-success">{fmt(liquid)}</span>
            </div>
          </Card>
        )}

        <div>
          <Label>Observação</Label>
          <Textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)} />
        </div>

        {/* Resumo fixo do rodapé — sempre visível quando parcial habilitado */}
        {partialEnabled && (
          <Card className="p-3 bg-muted/40 border-border space-y-1.5">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Valor da conta</span>
              <span className="font-medium">{fmt(amount)}</span>
            </div>
            {amountReceived > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Já recebido</span>
                <span className="font-medium">{fmt(amountReceived)}</span>
              </div>
            )}
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Recebendo agora</span>
              <span className="font-medium">{fmt(valorEfetivo)}</span>
            </div>
            <div className="flex justify-between text-sm font-semibold pt-1.5 border-t">
              <span>Restante após este recebimento</span>
              <span className={cn(restanteApos === 0 ? 'text-success' : 'text-primary')}>
                {fmt(restanteApos)}
              </span>
            </div>
          </Card>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!accountId || isSubmitting || valorInvalido || novoVencimentoInvalido}
            className="bg-success hover:bg-success/90 text-white"
          >
            {isSubmitting ? 'Confirmando...' : 'Confirmar recebimento'}
          </Button>
        </div>
      </div>
    </ResponsiveModal>
  );
}
