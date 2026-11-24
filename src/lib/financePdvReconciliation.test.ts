import {describe,it,expect} from 'vitest';
import {parseFinancePdvReconciliation,financePdvCivilDate,financePdvSourceLabel} from './financePdvReconciliation';
const fixture=()=>({snapshot:'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',scope:'company_shadow',coverage_status:'incomplete',company_result:null,company_cash_flow:null,projection:'dre_competence',from:'2026-11-14',to:'2026-11-15',total_count:2,limit:50,offset:0,has_more:false,
 commercial:{revenue:65,cmv:30,expense:0,result:35,cash_flow:0},acquisitions:{amount:422,fully_paid_amount:22,count:2},entries:[
  {event_key:'dre_competence:delivery_v2:sale',event_date:'2026-11-15',source_role:'delivery_v2',source_id:'sale',source_scope:'pdv_commercial',revenue:65,cmv:30,expense:0,cash_flow:0,purchase_amount:0,purchase_paid_amount:0},
  {event_key:'dre_competence:inventory_acquisition:purchase',event_date:'2026-11-14',source_role:'inventory_acquisition',source_id:'purchase',source_scope:'inventory_acquisition',revenue:0,cmv:0,expense:0,cash_flow:0,purchase_amount:422,purchase_paid_amount:22}]});
describe('conferência financeira PDV',()=>{
 it('mantém receita por entrega, aquisição e pagamento separados sem inventar lucro global',()=>{
  const data=parseFinancePdvReconciliation(fixture());
  expect(data.commercial).toEqual({revenue:65,cmv:30,expense:0,result:35,cashFlow:0});
  expect(data.acquisitions).toEqual({amount:422,fullyPaidAmount:22,count:2});
  expect(data.companyResult).toBeNull();expect(data.companyCashFlow).toBeNull();
 });
 it('preserva custo desconhecido e não o transforma em lucro integral',()=>{
  const data=fixture();data.commercial.cmv=null;data.commercial.result=null;data.entries[0].cmv=null;
  expect(parseFinancePdvReconciliation(data).commercial.result).toBeNull();
 });
 it.each([['company_result',999],['company_cash_flow',58],['coverage_status','complete']])('não aceita %s como total global corrigido', (field,value)=>{
  expect(()=>parseFinancePdvReconciliation({...fixture(),[field]:value})).toThrow(/incompleta/);
 });
 it('recusa linhas duplicadas que poderiam dobrar receita/CMV',()=>{
  const data=fixture();data.entries[1]=data.entries[0];
  expect(()=>parseFinancePdvReconciliation(data)).toThrow();
 });
 it('recusa paginação/contagem e linhas de outro período',()=>{
  expect(()=>parseFinancePdvReconciliation({...fixture(),has_more:true})).toThrow();
  const data=fixture();data.entries[0].event_date='2026-11-16';expect(()=>parseFinancePdvReconciliation(data)).toThrow();
 });
 it.each(['2026-02-30','2026-1-01','2026-11-14T15:00:00Z'])('rejeita data civil inválida %s', value=>expect(()=>financePdvCivilDate(value)).toThrow());
 it('preserva primeiro/último dia sem converter fuso',()=>{
  const data=parseFinancePdvReconciliation(fixture());expect(data.entries.map(e=>e.eventDate)).toEqual(['2026-11-15','2026-11-14']);
 });
 it('não exibe códigos internos novos como copy de origem',()=>expect(financePdvSourceLabel('SQL_INTERNAL_FUTURE')).toBe('Outro movimento da loja'));
});

describe('exportação integral da conferência',()=>{
 it('busca todas as páginas sem duplicar linhas',async()=>{
  const {loadFinancePdvExport}=await import('./financePdvReconciliation');
  const a=parseFinancePdvReconciliation({...fixture(),limit:1,has_more:true,entries:fixture().entries.slice(0,1)});
  const b=parseFinancePdvReconciliation({...fixture(),limit:1,offset:1,entries:fixture().entries.slice(1)});
  const offsets:number[]=[];
  const rows=await loadFinancePdvExport(async offset=>{offsets.push(offset);return offset===0?a:b;},()=>true);
  expect(offsets).toEqual([0,1]);expect(rows).toHaveLength(2);
 });
 it('não exporta arquivo parcial se as fontes mudarem entre páginas',async()=>{
  const {loadFinancePdvExport}=await import('./financePdvReconciliation');
  const a=parseFinancePdvReconciliation({...fixture(),limit:1,has_more:true,entries:fixture().entries.slice(0,1)});
  const b=parseFinancePdvReconciliation({...fixture(),snapshot:'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',limit:1,offset:1,entries:fixture().entries.slice(1)});
  await expect(loadFinancePdvExport(async offset=>offset===0?a:b,()=>true)).rejects.toThrow(/mudaram/);
 });
 it('cancela exportação se filtro, identidade ou permissão mudar',async()=>{
  const {loadFinancePdvExport}=await import('./financePdvReconciliation');let current=true;
  await expect(loadFinancePdvExport(async()=>{current=false;return parseFinancePdvReconciliation(fixture());},()=>current)).rejects.toThrow(/mudou/);
 });
});
