import { useEffect, useState, type SyntheticEvent } from 'react';
import { formatReceiptMoney, type PdvReceiptFormat, type PdvReceiptSnapshot } from '@/lib/pdv/receipt/model';
import { getPdvReceiptLogoPlacement, type PdvReceiptLogoPlacement } from '@/lib/pdv/receipt/layout';
import { cn } from '@/lib/utils';
import { safeTimeZone } from '@/lib/timezone';
import dominexLogo from '@/assets/logo-black-horizontal.png';

export interface PdvReceiptPreviewProps {
  snapshot: PdvReceiptSnapshot;
  format: PdvReceiptFormat;
  className?: string;
}

const RECEIPT_SANS_FONT = 'Arial, Helvetica, ui-sans-serif, system-ui, sans-serif';

export function PdvReceiptPreview({ snapshot, format, className }: PdvReceiptPreviewProps) {
  const isA4 = format === 'a4';
  const [logoPlacement, setLogoPlacement] = useState<PdvReceiptLogoPlacement>('inline');
  const [logoFailed, setLogoFailed] = useState(false);
  useEffect(() => {
    setLogoFailed(false);
    setLogoPlacement('inline');
  }, [snapshot.company.logoUrl]);
  const logoUrl = logoFailed ? null : snapshot.company.logoUrl;
  const placeLogo = (event: SyntheticEvent<HTMLImageElement>) => {
    setLogoPlacement(getPdvReceiptLogoPlacement(event.currentTarget.naturalWidth, event.currentTarget.naturalHeight));
  };
  return (
    <article className={cn(
      'mx-auto bg-white p-4 text-[11px] leading-snug tracking-normal text-black shadow-sm ring-1 ring-black/15',
      isA4 ? 'aspect-[210/297] w-full max-w-[620px] p-8 text-[12px]' : format === '58mm' ? 'w-full max-w-[274px]' : 'w-full max-w-[360px]',
      className,
    )} style={{ fontFamily: RECEIPT_SANS_FONT }} aria-label={`Prévia do comprovante ${format}`}>
      <header
        className={cn(
          'flex gap-4 border-b-2 border-black pb-3',
          logoUrl && logoPlacement === 'stacked' ? 'flex-col items-center text-center' : 'items-start',
        )}
        data-logo-layout={logoUrl ? logoPlacement : 'none'}
      >
        {logoUrl && <img
          src={logoUrl}
          alt="Logo da empresa"
          onLoad={placeLogo}
          onError={() => setLogoFailed(true)}
          className={cn(
            'shrink-0 object-contain',
            logoPlacement === 'stacked'
              ? isA4 ? 'max-h-20 max-w-[70%]' : 'max-h-12 max-w-full'
              : isA4 ? 'max-h-16 max-w-32' : 'max-h-12 max-w-20',
          )}
        />}
        <div className="min-w-0 flex-1">
          <h3 className={cn('font-black uppercase tracking-tight', isA4 ? 'text-xl' : 'text-sm')}>{snapshot.company.name}</h3>
          {snapshot.company.document && <p>{snapshot.company.document}</p>}
          {snapshot.company.address && <p>{snapshot.company.address}</p>}
          {snapshot.company.phone && <p>{snapshot.company.phone}</p>}
        </div>
      </header>

      <div className="my-3 bg-black px-3 py-2 text-center text-white">
        <p className="text-[9px] font-bold uppercase tracking-[0.18em]">COMPROVANTE NÃO FISCAL</p>
        <p className={cn('font-black uppercase', isA4 ? 'text-2xl' : 'text-base')}>Pedido nº {snapshot.order.number}</p>
      </div>

      <dl className={cn('grid gap-x-4 gap-y-1 border border-black p-2', isA4 ? 'grid-cols-2' : 'grid-cols-1')}>
        <div><dt className="inline font-bold">Data: </dt><dd className="inline">{new Date(snapshot.order.issuedAt).toLocaleString('pt-BR', { timeZone: safeTimeZone(snapshot.company.timeZone) })}</dd></div>
        <div><dt className="inline font-bold">Operador: </dt><dd className="inline">{snapshot.order.operatorName}</dd></div>
        {snapshot.order.terminalName && <div><dt className="inline font-bold">Terminal: </dt><dd className="inline">{snapshot.order.terminalName}</dd></div>}
        {snapshot.order.customerName && <div><dt className="inline font-bold">Cliente: </dt><dd className="inline">{snapshot.order.customerName}</dd></div>}
      </dl>

      <table className="my-3 w-full border-collapse tabular-nums">
        <thead className="bg-black text-white"><tr><th className="px-2 py-1.5 text-left uppercase">Item</th><th className="px-2 py-1.5 text-center uppercase">Qtd.</th><th className="px-2 py-1.5 text-right uppercase">Total</th></tr></thead>
        <tbody>{snapshot.items.map((item, index) => <tr key={`${item.description}-${index}`} className="border-b border-black/25 align-top"><td className="px-2 py-2"><strong className="block">{item.description}</strong><span className="text-[10px]">{formatReceiptMoney(item.unitPrice)}/{item.unit}{item.discount > 0 ? ` · desc. ${formatReceiptMoney(item.discount)}` : ''}</span></td><td className="px-2 py-2 text-center">{item.quantity} {item.unit}</td><td className="px-2 py-2 text-right font-bold">{formatReceiptMoney(item.total)}</td></tr>)}</tbody>
      </table>

      <div className="space-y-1 border-t-2 border-black pt-2 text-right tabular-nums">
        <p>Subtotal <strong>{formatReceiptMoney(snapshot.totals.subtotal)}</strong></p>
        {snapshot.totals.discount > 0 && <p>Desconto <strong>-{formatReceiptMoney(snapshot.totals.discount)}</strong></p>}
        <p className={cn('mt-2 flex items-center justify-between bg-black px-3 py-2 font-black text-white', isA4 ? 'text-xl' : 'text-base')}><span>TOTAL</span><span>{formatReceiptMoney(snapshot.totals.total)}</span></p>
      </div>

      <section className="my-3 border border-black p-2 text-center"><h4 className="font-black uppercase">Pagamentos</h4>{snapshot.payments.map((payment, index) => <p key={`${payment.method}-${index}`}>{payment.method}: <strong>{formatReceiptMoney(payment.amount)}</strong>{payment.dueDate ? ` · vence ${new Date(`${payment.dueDate}T12:00:00`).toLocaleDateString('pt-BR')}` : ''}</p>)}</section>
      {snapshot.fulfillment && <section className="my-3 border border-black p-2"><p className="font-black uppercase">{snapshot.fulfillment.mode === 'retirada' ? 'Retirada' : 'Entrega'}: {snapshot.fulfillment.status}</p>{snapshot.fulfillment.address && <p>{snapshot.fulfillment.address}</p>}</section>}
      {snapshot.note && <p className="my-3 border-l-4 border-black pl-2"><strong>Observação:</strong> {snapshot.note}</p>}
      <footer className="mt-4 border-t-2 border-black pt-2 text-center">
        <p className="font-bold">Este documento não substitui nota fiscal.</p>
        <p>Reimpressão não altera pagamento, estoque ou saldo.</p>
        {!snapshot.company.whiteLabelEnabled && <div className="mt-4 border-t border-black/20 pt-3" data-dominex-branding>
          <img src={dominexLogo} alt="Dominex" className={cn('mx-auto h-auto object-contain', isA4 ? 'w-28' : 'w-20')} />
          <p className="mt-1 text-[9px] text-black/60">www.dominex.app</p>
        </div>}
      </footer>
    </article>
  );
}
