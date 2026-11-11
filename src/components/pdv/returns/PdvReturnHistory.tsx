import { useRef, useState } from 'react';
import { History, Loader2, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ResponsiveDialog } from '@/components/ui/responsive-dialog';
import { useToast } from '@/hooks/use-toast';
import { stablePdvReturnAttempt, usePdvReverseReturn, type PdvReturnHistoryEntry, type PdvStableAttempt } from '@/hooks/usePdvReturns';

const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const date = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeZone: 'UTC' });

export function PdvReturnHistory({ orderId, entries, canReverse, onCompleted }: { orderId: string; entries: PdvReturnHistoryEntry[]; canReverse: boolean; onCompleted?: () => void }) {
  const { toast } = useToast();
  const mutation = usePdvReverseReturn();
  const [selected, setSelected] = useState<PdvReturnHistoryEntry | null>(null);
  const [reason, setReason] = useState('');
  const attempt = useRef<PdvStableAttempt | null>(null);

  async function reverse() {
    if (!selected) return;
    const signature = JSON.stringify({ returnId: selected.id, reason: reason.trim() });
    attempt.current = stablePdvReturnAttempt(attempt.current, signature, () => crypto.randomUUID());
    try {
      await mutation.mutateAsync({ orderId, returnId: selected.id, reason, attemptId: attempt.current.id });
      toast({ title: 'Devolução desfeita', description: 'A compensação foi registrada no histórico.' });
      setSelected(null);
      setReason('');
      onCompleted?.();
    } catch (error) {
      toast({ title: 'Não foi possível desfazer', description: error instanceof Error ? error.message : 'Tente novamente.', variant: 'destructive' });
    }
  }

  return <>
    <section className="space-y-3" aria-label="Histórico de devoluções">
      <div className="flex items-center gap-2"><History className="h-4 w-4 text-muted-foreground" /><h3 className="font-semibold">Histórico de devoluções</h3></div>
      {!entries.length ? <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">Nenhuma devolução registrada neste pedido.</p> : <div className="divide-y rounded-xl border">{entries.map((entry) => <article key={entry.id} className="flex flex-wrap items-center justify-between gap-3 p-4"><div><div className="flex flex-wrap items-center gap-2"><strong>{entry.eventKind === 'return' ? 'Devolução' : 'Compensação'}</strong><span className="text-sm text-muted-foreground">{date.format(new Date(`${entry.occurredOn}T00:00:00Z`))}</span></div><p className="mt-1 text-sm text-muted-foreground">{entry.reason} · {entry.quantity} unidade(s)</p></div><div className="flex items-center gap-2"><strong className="tabular-nums">{money.format(Math.abs(entry.commercialTotal))}</strong>{canReverse && entry.canReverse && <Button size="sm" variant="outline" onClick={() => { setSelected(entry); setReason(''); attempt.current = null; }}><Undo2 className="mr-2 h-4 w-4" />Desfazer</Button>}</div></article>)}</div>}
    </section>
    <ResponsiveDialog open={Boolean(selected)} onOpenChange={(next) => { if (!next) setSelected(null); }} title="Desfazer devolução" description="Uma compensação será adicionada ao histórico; o registro original será preservado." footer={<div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><Button variant="outline" onClick={() => setSelected(null)}>Voltar</Button><Button variant="destructive" onClick={() => void reverse()} disabled={!reason.trim() || mutation.isPending}>{mutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Undo2 className="mr-2 h-4 w-4" />}Confirmar compensação</Button></div>}><label className="block space-y-1 py-3 text-sm font-medium">Motivo<Textarea aria-label="Motivo para desfazer a devolução" maxLength={500} value={reason} onChange={(event) => { setReason(event.target.value); attempt.current = null; }} /></label></ResponsiveDialog>
  </>;
}
