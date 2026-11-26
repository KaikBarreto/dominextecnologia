import { useEffect, useState } from 'react';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { fetchOsCommercialDocument } from '@/hooks/useOsCommercial';
import { selectReceiptPayment, type OsReceipt } from '@/lib/osCommercial';
import { downloadOsReceipt, paymentMethodLabel } from '@/utils/osReceiptPdf';

export function OsReceiptDialog({ osId, publicMode, open, onOpenChange }: {
  osId: string; publicMode: boolean; open: boolean; onOpenChange: (next: boolean) => void;
}) {
  const [receipt, setReceipt] = useState<OsReceipt | null>(null);
  const [selection, setSelection] = useState('all');
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();
  useEffect(() => {
    if (!open) return;
    let alive = true;
    setState('loading'); setReceipt(null); setSelection('all');
    void fetchOsCommercialDocument(osId, publicMode).then(doc => {
      if (!alive) return;
      setReceipt(doc?.receipt ?? null); setState(doc?.receipt ? 'ready' : 'error');
    }).catch(() => { if (alive) setState('error'); });
    return () => { alive = false; };
  }, [open, osId, publicMode]);
  const money = (amount: number) => amount.toLocaleString('pt-BR', { style: 'currency', currency: receipt?.currency || 'BRL' });
  const chosen = receipt ? selectReceiptPayment(receipt, selection) : null;
  const download = async () => {
    setSaving(true);
    try {
      const doc = await fetchOsCommercialDocument(osId, publicMode);
      if (!doc?.receipt) throw new Error('Indisponível');
      await downloadOsReceipt(selectReceiptPayment(doc.receipt, selection));
      onOpenChange(false);
    } catch { toast({ variant: 'destructive', title: 'Recibo indisponível', description: 'Confira sua conexão e o histórico. O pagamento pode ter sido estornado.' }); }
    finally { setSaving(false); }
  };
  return <ResponsiveModal open={open} onOpenChange={onOpenChange} title="Gerar recibo" description="Escolha um recebimento ou reúna todos os pagamentos confirmados desta OS." className="sm:max-w-xl"
    footer={<div className="flex w-full justify-end gap-3"><Button variant="cancel" onClick={() => onOpenChange(false)}>Fechar</Button><Button disabled={!chosen || saving || state !== 'ready'} onClick={() => void download()}>{saving ? 'Gerando…' : 'Baixar recibo'}</Button></div>}>
    {state === 'loading' && <p role="status">Consultando recebimentos…</p>}
    {state === 'error' && <p role="alert">Nenhum recebimento confirmado disponível. Atualize a página e confira o histórico.</p>}
    {state === 'ready' && chosen && <div className="space-y-6">
      <div className="space-y-2"><Label htmlFor="receipt-payment">Pagamentos no recibo</Label><Select value={selection} onValueChange={setSelection}><SelectTrigger id="receipt-payment" className="h-auto min-h-12 text-left [&>span]:whitespace-normal"><SelectValue /></SelectTrigger><SelectContent>
        <SelectItem value="all">Todos os recebimentos · {money(receipt!.received)}</SelectItem>
        {receipt!.payments.map((p, index) => <SelectItem key={p.reference} value={p.reference}>{index + 1}. {p.paid_date.slice(0, 10).split('-').reverse().join('/')} · {paymentMethodLabel(p.method)} · {money(p.amount)}</SelectItem>)}
      </SelectContent></Select></div>
      <div className="border-y py-5"><p className="text-sm text-muted-foreground">{selection === 'all' ? 'Total comprovado neste recibo' : chosen.is_partial ? 'Pagamento parcial deste recibo' : 'Pagamento deste recibo'}</p><p className="mt-1 break-words text-3xl font-bold tabular-nums">{money(chosen.received)}</p></div>
      <p className="text-sm text-muted-foreground">O documento inclui a identificação da empresa, do cliente e os itens de referência da OS. Cada pagamento mantém sua data e forma de recebimento.</p>
    </div>}
  </ResponsiveModal>;
}
