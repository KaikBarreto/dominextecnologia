import { useEffect, useMemo, useState } from 'react';
import { Loader2, Ticket } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { usePdvIssueVoucher, type PdvAfterSaleAttempt, type PdvAfterSaleReturn } from '@/hooks/usePdvAfterSale';
import { parsePdvMoneyText, pdvMoneyCentsFromNumber, pdvMoneyInputFromCents } from '@/lib/pdv/afterSaleMoney';

export function PdvVoucherDialog({ open, onOpenChange, orderId, entry, getAttempt, onCompleted }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderId: string;
  entry: PdvAfterSaleReturn;
  getAttempt: (key: string, signature: string) => PdvAfterSaleAttempt;
  onCompleted: () => void;
}) {
  const { toast } = useToast();
  const issue = usePdvIssueVoucher();
  const [amount, setAmount] = useState('');
  const [expiresOn, setExpiresOn] = useState('');
  const availableCents = pdvMoneyCentsFromNumber(entry.availableAmount);
  useEffect(() => { if (open && !amount && availableCents !== null) setAmount(pdvMoneyInputFromCents(availableCents)); }, [amount, availableCents, open]);
  const parsed = availableCents === null ? null : parsePdvMoneyText(amount, { minCents: 1, maxCents: availableCents });
  const valid = parsed !== null;
  const signature = useMemo(() => JSON.stringify({ returnId: entry.returnId, amount: parsed?.decimal ?? null, expiresOn: expiresOn || null }), [entry.returnId, expiresOn, parsed?.decimal]);
  async function submit() {
    if (!valid) return;
    const attempt = getAttempt(`voucher:${entry.returnId}`, signature);
    try {
      await issue.mutateAsync({ orderId, returnId: entry.returnId, amount: parsed.decimal, expiresOn: expiresOn || null, attemptId: attempt.id });
      toast({ title: 'Voucher gerado', description: 'O código e o saldo já aparecem no histórico da devolução.' });
      onCompleted(); onOpenChange(false);
    } catch (error) { toast({ title: 'Voucher não gerado', description: error instanceof Error ? error.message : 'Tente novamente.', variant: 'destructive' }); }
  }
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="sm:max-w-md"><DialogHeader><DialogTitle>Gerar voucher</DialogTitle><DialogDescription>O voucher fica separado do fiado e só pode ser usado pelo mesmo cliente.</DialogDescription></DialogHeader><div className="grid gap-4 py-2"><div className="rounded-xl border bg-background p-3 text-sm"><span className="text-muted-foreground">Disponível nesta devolução</span><strong className="block text-xl tabular-nums">{entry.availableAmount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</strong></div><div className="grid gap-2"><Label htmlFor="voucher-amount">Valor</Label><Input id="voucher-amount" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} /></div><div className="grid gap-2"><Label htmlFor="voucher-expiry">Validade opcional</Label><Input id="voucher-expiry" type="date" min={new Date().toISOString().slice(0, 10)} value={expiresOn} onChange={(event) => setExpiresOn(event.target.value)} /></div></div><DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button><Button disabled={!valid || issue.isPending} onClick={() => void submit()}>{issue.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Ticket className="mr-2 h-4 w-4" />}Gerar voucher</Button></DialogFooter></DialogContent></Dialog>;
}
