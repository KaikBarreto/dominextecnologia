import { csvCell } from '@/utils/movimentacoesCsvGenerator';
import {useEffect,useRef,useState} from 'react';
import {ChevronDown,ChevronLeft,ChevronRight,Download,RefreshCw} from 'lucide-react';
import {format} from 'date-fns';
import type {DateRange} from '@/components/ui/DateRangeFilter';
import {Button} from '@/components/ui/button';
import {Collapsible,CollapsibleContent,CollapsibleTrigger} from '@/components/ui/collapsible';
import {useAppLocaleContext} from '@/contexts/AppLocaleContext';
import {formatMoney} from '@/lib/format';
import {financePdvSourceLabel} from '@/lib/financePdvReconciliation';
import {useFinancePdvReconciliation,useFinancePdvReconciliationAccess,useFinancePdvReconciliationEntry} from '@/hooks/useFinancePdvReconciliation';

/** Optional comparison. The existing company report and its exports remain unchanged. */
export function FinancePdvReconciliation({range,regime,startDate,asOf}:{range?:DateRange;regime:'competencia'|'caixa';startDate?:string|null;asOf:string}) {
  const access=useFinancePdvReconciliationAccess(),{locale,currency}=useAppLocaleContext();
  const [open,setOpen]=useState(false),[offset,setOffset]=useState(0),[selected,setSelected]=useState<string|null>(null);
  const selectedFrom=range?.from ? format(range.from,'yyyy-MM-dd') : '0001-01-01';
  const from=startDate && startDate>selectedFrom ? startDate : selectedFrom;
  const selectedTo=range?.to ? format(range.to,'yyyy-MM-dd') : '9999-12-31';
  const to=regime==='caixa' && asOf<selectedTo ? asOf : selectedTo;
  const projection=regime==='competencia' ? 'dre_competence' : 'dre_cash';
  const identity=`${access.scopeKey}:${from}:${to}:${projection}`;
  const [owner,setOwner]=useState(identity);
  const [exporting,setExporting]=useState(false),[exportError,setExportError]=useState<string|null>(null);
  const current=useRef(''),mounted=useRef(true);
  current.current=JSON.stringify([identity,open,access.allowed]);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  const sameScope=owner===identity;
  useEffect(()=>{setOwner(identity);setOffset(0);setSelected(null);setOpen(false);},[identity]);
  const query=useFinancePdvReconciliation({from,to,projection,offset:sameScope?offset:0,enabled:open && sameScope && from<=to});
  const detail=useFinancePdvReconciliationEntry({eventKey:sameScope && open && from<=to ? selected : null,from,to,projection});
  if(!access.allowed) return null;
  const money=(v:number|null)=>v===null?'Não calculado':formatMoney(v,currency,locale);
  const data=query.data;
  async function exportCsv() {
    if(exporting) return;
    const captured=current.current;
    setExporting(true);setExportError(null);
    try {
      const rows=await query.exportEntries();
      if(!mounted.current || current.current!==captured) return;
      const header=['Data','Origem','Receita PDV','CMV','Despesa PDV','Fluxo parcial de vendas','Aquisição de estoque','Compra marcada como quitada','Referência'];
      const lines=[header.map(csvCell).join(';'),...rows.map(e=>[e.eventDate,financePdvSourceLabel(e.sourceRole),e.revenue,e.cmv===null?'Não informado':e.cmv,e.expense,e.cashFlow,e.purchaseAmount,e.purchasePaidAmount,e.eventKey].map(csvCell).join(';'))];
      const url=URL.createObjectURL(new Blob(['\uFEFF'+lines.join('\r\n')],{type:'text/csv;charset=utf-8;'}));
      const link=document.createElement('a');link.href=url;link.download=`Conferencia-PDV-${from}-a-${to}.csv`;link.click();setTimeout(()=>URL.revokeObjectURL(url),0);
    } catch(error) {
      if(mounted.current && current.current===captured) setExportError(error instanceof Error ? error.message : 'Não foi possível exportar a conferência. Tente novamente.');
    } finally {if(mounted.current)setExporting(false);}
  }
  return <Collapsible open={open && sameScope} onOpenChange={setOpen} className="border-b border-border pb-4">
    <CollapsibleTrigger asChild><Button variant="ghost" className="w-full justify-between whitespace-normal text-left" aria-label="Conferir vendas e compras do PDV">Conferir vendas e compras do PDV<ChevronDown className="h-4 w-4 shrink-0" /></Button></CollapsibleTrigger>
    <CollapsibleContent className="space-y-4 pt-4">
      <p className="text-sm text-muted-foreground">Compare os movimentos permitidos para seu perfil: vendas entregues do PDV e compras diretas de estoque no mesmo período. Esta conferência mostra um resultado parcial do PDV; o resultado consolidado da empresa ainda não foi conciliado.</p>
      {from>to && <p role="status" className="text-sm text-muted-foreground">Não há dias desse período dentro da vigência do relatório.</p>}
      {query.isLoading && <p role="status" className="text-sm">Carregando conferência…</p>}
      {query.isError && <div role="alert" className="flex flex-wrap items-center gap-2 text-sm"><span>{query.error.message}</span><Button size="sm" variant="outline" onClick={()=>void query.refetch()}><RefreshCw className="h-4 w-4" />Tentar novamente</Button></div>}
      {exportError && <p role="alert" className="text-sm text-destructive">{exportError}</p>}
      {data && <>
        <div className="flex justify-end"><Button size="sm" variant="outline" disabled={exporting || query.isFetching} onClick={()=>void exportCsv()}><Download className="h-4 w-4" />{exporting?'Preparando arquivo…':'Exportar conferência'}</Button></div>
        <dl className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Resultado parcial das vendas do PDV">
          {[['Vendas do PDV',data.commercial.revenue],['Custo dos materiais vendidos',data.commercial.cmv],['Despesas do PDV',data.commercial.expense],['Resultado parcial do PDV',data.commercial.result]].map(([label,value])=><div key={String(label)}><dt className="text-sm text-muted-foreground">{label}</dt><dd className="whitespace-nowrap text-lg font-bold tabular-nums">{money(value as number|null)}</dd></div>)}
        </dl>
        <div className="space-y-1 border-t border-border pt-4 text-sm"><p>{regime==='competencia'?'Compras de estoque registradas no período:':'Compras de estoque quitadas no período:'} <strong>{money(data.acquisitions.amount)}</strong>.</p>{regime==='competencia' && <p>Marcadas como quitadas: <strong>{money(data.acquisitions.fullyPaidAmount)}</strong>.</p>}<p className="text-muted-foreground">Uma compra pode ser quitada com saldo do fornecedor. Este valor não representa, sozinho, uma saída de dinheiro.</p><p className="text-muted-foreground">A compra repõe o estoque; ela não é descontada novamente do resultado parcial acima. Materiais usados em serviços, outras receitas e despesas e pagamentos parciais de compras ainda precisam ser conciliados para formar um resultado único da empresa.</p></div>
        {data.entries.length===0 ? <p className="py-4 text-sm text-muted-foreground">Nenhum movimento encontrado neste período.</p> : <ul className="divide-y divide-border" aria-label="Movimentos da conferência">{data.entries.map(entry=><li key={entry.eventKey} className="py-3"><button className="flex w-full items-center justify-between gap-3 text-left text-sm hover:underline" onClick={()=>setSelected(selected===entry.eventKey?null:entry.eventKey)} aria-expanded={selected===entry.eventKey}><span className="min-w-0 break-words">{format(new Date(`${entry.eventDate}T12:00:00`),'dd/MM/yyyy')} · {financePdvSourceLabel(entry.sourceRole)}</span><strong className="shrink-0 tabular-nums">{money(entry.scope==='inventory_acquisition'?entry.purchaseAmount:entry.revenue || entry.cashFlow || entry.expense || entry.cmv)}</strong></button>{selected===entry.eventKey && <div className="pt-2 text-sm text-muted-foreground">{detail.isLoading?'Conferindo origem…':detail.isError?detail.error.message:detail.data?<p>{detail.data.scope==='inventory_acquisition'?'Aquisição de estoque, apresentada separadamente das vendas.':`Receita ${money(detail.data.revenue)} · custo ${money(detail.data.cmv)} · despesa ${money(detail.data.expense)}.`}</p>:null}</div>}</li>)}</ul>}
        <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs text-muted-foreground">Mostrando {data.entries.length} de {data.totalCount} movimentos</p><div className="flex gap-1"><Button size="sm" variant="outline" disabled={offset===0 || query.isFetching} onClick={()=>{setOffset(Math.max(0,offset-50));setSelected(null);}}><ChevronLeft className="h-4 w-4" />Anterior</Button><Button size="sm" variant="outline" disabled={!data.hasMore || query.isFetching} onClick={()=>{setOffset(offset+50);setSelected(null);}}>Próximos<ChevronRight className="h-4 w-4" /></Button></div></div>
      </>}
    </CollapsibleContent>
  </Collapsible>;
}
