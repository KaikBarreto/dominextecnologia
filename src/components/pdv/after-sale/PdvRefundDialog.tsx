import { useEffect, useMemo, useState } from 'react';
import { Loader2, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { usePdvRequestRefund, type PdvAfterSaleAttempt, type PdvAfterSaleReturn, type PdvAfterSaleWorkspace } from '@/hooks/usePdvAfterSale';
import { parsePdvMoneyText, pdvMoneyCentsFromNumber, pdvMoneyInputFromCents } from '@/lib/pdv/afterSaleMoney';

const methodLabel: Record<string, string> = { dinheiro: 'Dinheiro', pix: 'Pix', transferencia: 'Transferência', debito: 'Cartão de débito', credito: 'Cartão de crédito' };

export function PdvRefundDialog({ open, onOpenChange, orderId, entry, workspace, getAttempt, onCompleted }: {
  open: boolean; onOpenChange: (open: boolean) => void; orderId: string; entry: PdvAfterSaleReturn; workspace: PdvAfterSaleWorkspace;
  getAttempt: (key: string, signature: string) => PdvAfterSaleAttempt; onCompleted: () => void;
}) {
  const { toast } = useToast(); const request = usePdvRequestRefund();
  const [paymentId, setPaymentId] = useState(''); const [amount, setAmount] = useState(''); const [reason, setReason] = useState(''); const [optionId, setOptionId] = useState('');
  const payment = entry.eligiblePayments.find((item) => item.paymentId === paymentId) ?? null;
  useEffect(() => { if (open && !paymentId && entry.eligiblePayments[0]) setPaymentId(entry.eligiblePayments[0].paymentId); }, [entry.eligiblePayments, open, paymentId]);
  const paymentAvailableCents = payment ? pdvMoneyCentsFromNumber(payment.availableAmount) : null;
  const returnAvailableCents = pdvMoneyCentsFromNumber(entry.availableAmount);
  const availableCents = paymentAvailableCents === null || returnAvailableCents === null ? null : Math.min(paymentAvailableCents, returnAvailableCents);
  useEffect(() => { if (payment && availableCents !== null) { setAmount(pdvMoneyInputFromCents(availableCents)); setOptionId(''); } }, [availableCents, payment]);
  const parsed = availableCents === null ? null : parsePdvMoneyText(amount, { minCents: 1, maxCents: availableCents });
  const options = payment?.method === 'dinheiro' ? workspace.cashOptions.map((item) => ({ id: item.sessionId, label: item.label })) : workspace.accountOptions.map((item) => ({ id: item.accountId, label: item.label }));
  const valid = Boolean(payment && parsed && reason.trim().length >= 3 && optionId);
  const cash = payment?.method === 'dinheiro' ? workspace.cashOptions.find((item) => item.sessionId === optionId) ?? null : null;
  const accountId = (cash?.accountId ?? optionId) || null;
  const cashSessionId = cash?.sessionId ?? null;
  const signature = useMemo(() => JSON.stringify({ returnId: entry.returnId, paymentId, amount: parsed?.decimal ?? null, reason: reason.trim(), accountId, cashSessionId }), [accountId, cashSessionId, entry.returnId, parsed?.decimal, paymentId, reason]);
  async function submit() { if (!payment || !parsed || !accountId || !valid) return; const attempt = getAttempt(`refund:${entry.returnId}`, signature);
    try { await request.mutateAsync({ orderId, returnId: entry.returnId, paymentId, amount: parsed.decimal, reason, accountId, cashSessionId, attemptId: attempt.id }); toast({ title: payment.method === 'dinheiro' ? 'Reembolso concluído' : 'Reembolso solicitado', description: payment.method === 'dinheiro' ? 'O dinheiro e a gaveta foram atualizados.' : 'Confirme depois da operação no provedor.' }); onCompleted(); onOpenChange(false); }
    catch (error) { toast({ title: 'Reembolso não registrado', description: error instanceof Error ? error.message : 'Tente novamente.', variant: 'destructive' }); }
  }
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="sm:max-w-lg"><DialogHeader><DialogTitle>Reembolsar valor</DialogTitle><DialogDescription>Escolha uma forma realmente paga. Pix e cartão ficam pendentes até a confirmação externa.</DialogDescription></DialogHeader><div className="grid gap-4 py-2"><div className="grid gap-2"><Label>Forma original</Label><Select value={paymentId} onValueChange={setPaymentId}><SelectTrigger><SelectValue placeholder="Escolha o pagamento" /></SelectTrigger><SelectContent>{entry.eligiblePayments.map((item) => <SelectItem key={item.paymentId} value={item.paymentId}>{methodLabel[item.method]} · disponível {item.availableAmount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</SelectItem>)}</SelectContent></Select></div><div className="grid gap-2"><Label htmlFor="refund-amount">Valor</Label><Input id="refund-amount" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} /></div><div className="grid gap-2"><Label>Origem do reembolso</Label><Select value={optionId} onValueChange={setOptionId}><SelectTrigger><SelectValue placeholder={options.length ? 'Escolha a gaveta ou conta' : 'Nenhuma opção disponível'} /></SelectTrigger><SelectContent>{options.map((item) => <SelectItem key={item.id} value={item.id}>{item.label}</SelectItem>)}</SelectContent></Select></div><div className="grid gap-2"><Label htmlFor="refund-reason">Motivo</Label><Textarea id="refund-reason" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Ex.: devolução solicitada pelo cliente" maxLength={500} /></div></div><DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button><Button disabled={!valid || request.isPending} onClick={() => void submit()}>{request.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Undo2 className="mr-2 h-4 w-4" />}Registrar</Button></DialogFooter></DialogContent></Dialog>;
}
