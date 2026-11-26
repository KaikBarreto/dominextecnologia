import { cn } from '@/lib/utils';
import { osCommercialLineTotal, type OsCommercialSummary as Summary } from '@/lib/osCommercial';
export function OsCommercialSummary({ summary, document = false }: { summary: Summary; document?: boolean }) {
  const money = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: summary.currency || 'BRL' });
  return <section data-pdf-section aria-label="Resumo de valores" className={cn('space-y-4 border-t pt-6', document ? 'border-slate-200 text-slate-900' : 'border-border text-foreground')}>
    <h2 className="text-base font-bold">Resumo de serviços e produtos</h2>
    {summary.items.map((item, index) => <div key={index} data-pdf-section className="flex flex-wrap items-start justify-between gap-x-6 gap-y-1 border-b border-slate-100 pb-3 text-sm">
      <div className="min-w-0 flex-1 basis-44"><p className="break-words font-semibold">{item.description}</p><p className={cn('mt-1 text-xs', document ? 'text-slate-500' : 'text-muted-foreground')}>{item.quantity.toLocaleString('pt-BR')} × {money(item.unit_price)}</p></div>
      <p className="font-semibold tabular-nums">{money(osCommercialLineTotal(item))}</p>
    </div>)}
    {summary.adjustment !== 0 && <div className="flex flex-wrap justify-between gap-3 text-sm"><span>Ajustes e descontos</span><span>{money(summary.adjustment)}</span></div>}
    <div className="flex flex-wrap justify-between gap-3 border-t border-slate-300 pt-4 text-lg font-bold"><span>Total do serviço</span><span className="tabular-nums">{money(summary.total)}</span></div>
    <p className={cn('text-xs', document ? 'text-slate-500' : 'text-muted-foreground')}>O resumo informa os valores do serviço. O recibo fica disponível após a confirmação do recebimento.</p>
  </section>;
}
