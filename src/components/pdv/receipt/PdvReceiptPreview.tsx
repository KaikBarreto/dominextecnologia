import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { formatReceiptMoney, getPdvReceiptApproval, getPdvReceiptCoverageLines, getPdvReceiptDocumentMetadata, getPdvReceiptNote, type PdvReceiptFormat, type PdvReceiptSnapshot } from '@/lib/pdv/receipt/model';
import { buildPdvReceiptItemBlocks, getPdvReceiptItemColumnProportions, getPdvReceiptPaymentRows, stackPdvReceiptItemColumns } from '@/lib/pdv/receipt/layout';
import { cn } from '@/lib/utils';
import { safeTimeZone } from '@/lib/timezone';
import dominexLogo from '@/assets/logo-black-horizontal.png';

export interface PdvReceiptPreviewProps {
  snapshot: PdvReceiptSnapshot;
  format: PdvReceiptFormat;
  className?: string;
}

const RECEIPT_SANS_FONT = 'Arial, Helvetica, ui-sans-serif, system-ui, sans-serif';

/** Valores monetários inteiros refluem como uma unidade; a fonte nunca é reduzida. */
function ReceiptMoney({ value }: { value: number }) {
  return <span style={{ display: 'inline-block', whiteSpace: 'nowrap', lineHeight: 1.35 }}>{formatReceiptMoney(value)}</span>;
}

/** A prévia usa as mesmas etapas, colunas e dados do PDF; nunca completa pagamentos ou retiradas. */
export function PdvReceiptPreview({ snapshot, format, className }: PdvReceiptPreviewProps) {
  const metadata = getPdvReceiptDocumentMetadata(snapshot);
  const { kind } = metadata;
  const isA4 = format === 'a4';
  const isDelivery = kind === 'delivery';
  const isCommercial = !isDelivery;
  const approval = getPdvReceiptApproval(snapshot);
  const pendingPrices = snapshot.items.some(item => item.pricePending);
  const itemBlocks = buildPdvReceiptItemBlocks(snapshot);
  const previewRef = useRef<HTMLElement>(null);
  const [previewWidth, setPreviewWidth] = useState<number | null>(null);
  useLayoutEffect(() => {
    const element=previewRef.current;
    if(!element)return;
    const measure=()=>{const width=element.getBoundingClientRect().width;if(width>0)setPreviewWidth(width);};
    measure();
    if(typeof ResizeObserver==='undefined')return;
    const observer=new ResizeObserver(measure);observer.observe(element);
    return ()=>observer.disconnect();
  }, []);
  const note = getPdvReceiptNote(snapshot);
  const [logoFailed, setLogoFailed] = useState(false);
  const companyLogo = snapshot.company.logoDataUrl || snapshot.company.logoUrl;
  useEffect(() => { setLogoFailed(false); }, [companyLogo]);
  const logoUrl = logoFailed ? null : companyLogo;
  const issuedDate = new Date(isDelivery && snapshot.withdrawal ? snapshot.withdrawal.withdrawnAt : snapshot.order.issuedAt);
  const dateOptions = { timeZone: safeTimeZone(snapshot.company.timeZone) };
  const dateText = issuedDate.toLocaleDateString('pt-BR', dateOptions);
  const timeText = issuedDate.toLocaleTimeString('pt-BR', { ...dateOptions, hour: '2-digit', minute: '2-digit' });
  const itemCellStyle = { border: 0, padding: '3px 0 5px', fontSize: isA4 ? 12 : format === '58mm' ? 12 : 13 };

  const paymentRows = getPdvReceiptPaymentRows(snapshot);
  return (
    <article ref={previewRef} className={cn(
      'mx-auto bg-white text-[12px] leading-snug tracking-normal text-black shadow-sm ring-1 ring-black/15 [overflow-wrap:anywhere]',
      isA4 ? 'min-h-[877px] w-full max-w-[620px] text-[12px]' : format === '58mm' ? 'w-full max-w-[274px] ' : 'w-full max-w-[360px] text-[13px]',
      className,
    )} style={{ fontFamily: RECEIPT_SANS_FONT, padding: isA4 ? 'min(7.6%, 47px)' : format === '58mm' ? 'min(6.9%, 19px)' : 'min(5%, 18px)' }} aria-label={`Prévia do comprovante ${format}`} data-document-kind={kind}>
      <header className="flex items-start gap-3 border-b-2 border-black pb-3 text-left" data-logo-layout={logoUrl ? 'inline' : 'none'}>
        {logoUrl && <img src={logoUrl} alt="Logo da empresa" onError={() => setLogoFailed(true)} className={cn('h-auto max-h-20 w-[30%] shrink-0 self-center object-contain object-left', isA4 && 'w-[24%]')} />}
        <div className="min-w-0 flex-1">
          <h3 className={cn('font-bold', isA4 ? 'text-sm' : 'text-sm')}>{snapshot.company.name}</h3>
          {snapshot.company.document && <p>{snapshot.company.document}</p>}
          {snapshot.company.address && <p>{snapshot.company.address}</p>}
          {snapshot.company.phone && <p>{snapshot.company.phone}</p>}
        </div>
      </header>

      <div className="my-3">
        <h4 className="font-bold uppercase" style={{fontSize:isA4?22:format==='58mm'?16:19,lineHeight:1.2}}>{isDelivery ? <>{metadata.title}<br />PEDIDO Nº {snapshot.order.number}</> : `${metadata.title} Nº ${snapshot.order.number}`}</h4>
        {!isDelivery && snapshot.order.budgetNumber != null && <p className="mt-1 text-[11px] text-black">Origem: Orçamento Nº {snapshot.order.budgetNumber}</p>}
      </div>
      <section className="my-3 text-left" style={{ border: '1px solid #828282',fontSize:12 }} data-receipt-metadata>
        <p className="px-1.5 py-1.5 font-bold" style={{ borderBottom: '1px solid #828282' }}>Cliente: {snapshot.order.customerName || 'Não informado'}</p>
        <div className="grid grid-cols-[65%_35%]">
          <p className="flex items-center px-1.5 py-1.5" style={{ borderRight: '1px solid #828282' }}><span>Operador: {(isDelivery ? snapshot.withdrawal?.operatorName : null) || snapshot.order.operatorName}{!isDelivery && snapshot.order.terminalName && <><br />{snapshot.order.terminalName}</>}</span></p>
          <p className="px-1.5 py-1.5 text-right">{dateText}<br />{timeText}</p>
        </div>
        {isDelivery && snapshot.withdrawal && <p className="px-1.5 py-2" style={{ borderTop: '1px solid #828282' }}>Registro de retirada: {snapshot.withdrawal.id}{snapshot.withdrawal.stockName && <><br />Local: {snapshot.withdrawal.stockName}</>}</p>}
      </section>

      <div className="my-3 space-y-2">
        {itemBlocks.map((block, index) => {
          const stacked = stackPdvReceiptItemColumns(isA4 && previewWidth != null && previewWidth < 500 ? '58mm' : format, block);
          const count = stacked ? 2 : block.columns.length;
          return <table key={index} className="w-full table-fixed border-collapse tabular-nums" aria-label={`Material ${index + 1}`} data-receipt-item data-receipt-stacked={stacked || undefined}>
            <colgroup>{(stacked ? [0.35,0.65] : getPdvReceiptItemColumnProportions(format,count)).map((proportion,index) => <col key={index} style={{ width: `${100 * proportion}%` }} />)}</colgroup>
            <tbody>
              <tr><td colSpan={count} className="text-left font-bold" style={itemCellStyle} data-receipt-description>{block.description}{block.discount && <p className="mt-1 font-bold">{block.discount}</p>}</td></tr>
              {stacked ? block.columns.map((column,columnIndex) => <tr key={column.label} style={columnIndex===block.columns.length-1?{borderBottom:'1px solid #828282'}:undefined}>
                <td colSpan={2} style={itemCellStyle}><div className="flex flex-wrap justify-between gap-x-2 gap-y-1"><span className={column.label==='TOTAL'?'font-bold':undefined}>{column.label}</span><span className={cn('ml-auto text-right',column.label==='TOTAL'&&'font-bold')} style={{whiteSpace:'nowrap'}}>{column.amount != null ? <ReceiptMoney value={column.amount} /> : column.value}</span></div></td>
              </tr>) : <tr style={{borderBottom:'1px solid #828282'}}>{block.columns.map((column,index) => <td key={column.label} className={cn('align-middle',index===0?'text-left':'text-right',column.label==='TOTAL'&&'font-bold')} style={{...itemCellStyle,paddingRight:index<block.columns.length-1?6:0}}><span className="mb-1 block text-black" style={{ fontSize: 11 }}>{column.label}</span><span style={{whiteSpace:'nowrap'}}>{column.amount != null ? <ReceiptMoney value={column.amount} /> : column.value}</span></td>)}</tr>}
            </tbody>
          </table>;
        })}

        {isDelivery && !itemBlocks.length && <p>Nenhum item retirado informado neste documento.</p>}
      </div>

      {isCommercial && <div className="my-3 tabular-nums" style={isA4?{width:previewWidth != null && previewWidth < 500 && formatReceiptMoney(snapshot.totals.total).length > 11 ? '100%' : '40.45%',marginLeft:'auto'}:undefined} data-receipt-summary>
        <p className="flex flex-wrap justify-between gap-1 border-b border-black/20 p-2"><span>Subtotal</span><span className="ml-auto" style={{whiteSpace:"nowrap"}}>{formatReceiptMoney(snapshot.totals.subtotal)}</span></p>
        {snapshot.totals.discount > 0 && <p className="flex flex-wrap justify-between gap-1 p-2"><span>Descontos</span><span className="ml-auto" style={{whiteSpace:"nowrap"}}>-{formatReceiptMoney(snapshot.totals.discount)}</span></p>}
        <p className="flex flex-wrap justify-between gap-1 bg-black p-2 text-base font-bold text-white"><span>{pendingPrices ? 'TOTAL A DEFINIR' : 'TOTAL'}</span><span className="ml-auto">{pendingPrices ? '—' : <ReceiptMoney value={snapshot.totals.total} />}</span></p>
      </div>}
      {kind === 'pickup' && (!paymentRows.length || !snapshot.coverage) && <div className="my-3 px-1.5">{getPdvReceiptCoverageLines(snapshot).filter(text => !text.startsWith('Fiado aprovado:') || (snapshot.coverage?.approvedCreditAmount ?? 0) > 0).map(text => <p key={text}>{text}</p>)}</div>}
      {paymentRows.length > 0 && <section className="my-3 space-y-1 text-left" data-receipt-payments aria-label="Formas de pagamento">
        <h5 className="font-bold">Formas de Pagamento:</h5>
        {paymentRows.map((payment, index) => <div key={index}><p>{payment.label}: <ReceiptMoney value={payment.amount} /></p>{payment.due && <p className="text-inherit">{payment.due}</p>}</div>)}
      </section>}


      {note && <p className="my-3 p-1.5">Observações: {note}</p>}
      {isDelivery && <section className="my-4 space-y-6 p-1.5"><p>Recebido por: {snapshot.withdrawal?.receivedBy || '__________________________________'}</p><p>Assinatura: ____________________________________</p></section>}
      {approval && <div className="my-3 mx-auto border border-black text-center font-bold" style={{width:'max-content',minWidth:isA4?100:86,maxWidth:'100%',padding:'5px 13px',fontSize:isA4?15:format==='58mm'?12:13,lineHeight:1.3}} data-receipt-approval>{approval}</div>}
      <footer className="mt-3 text-center text-[11px] text-black">
        {!snapshot.company.whiteLabelEnabled && <div className="mt-4 border-t border-black/20 pt-3" data-dominex-branding>
          <img src={dominexLogo} alt="Dominex" className="mx-auto h-auto w-20 object-contain" />
          <p className="mt-1 text-[11px] text-black">www.dominex.app</p>
        </div>}
      </footer>
    </article>
  );
}
