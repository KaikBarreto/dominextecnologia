import { cloneGoodsDraftForReissue, goodsDocumentRecovery } from './pdvNfce';
import { describe, it, expect } from 'vitest';
import { shouldAskPdvNfce, pdvNfceStatus } from './pdvNfce';
import { goodsRejectionGuidance } from './goodsRejectionGuidance';
import { goodsFiscalError } from './goodsErrors';
import { canonicalGoodsSourceTotals, goodsOutcome, sourceFinancialsMatch } from '../../../supabase/functions/_shared/fiscal-goods-policy';

describe('ponte NFC-e e venda confirmada', () => {
  it.each([[true,'ask',true,false,true], [false,'ask',true,false,false], [true,'off',true,false,false], [true,'automatic',true,false,false], [true,'ask',false,false,false], [true,'ask',true,true,false]] as const)('pergunta respeita configuração/confirmação/existência: %s %s %s %s', (enabled, mode, confirmed, exists, result) => {
    expect(shouldAskPdvNfce(enabled, mode, confirmed, exists)).toBe(result);
  });
  it('situação incerta orienta consulta, sem autorização inferida', () => {
    expect(pdvNfceStatus('uncertain')).toBe('Situação incerta — consultar');
    expect(pdvNfceStatus(null)).toBe('Não solicitada');
    expect(goodsOutcome({ outcome: 'accepted' }).status).toBe('uncertain');
    expect(goodsOutcome({ outcome: 'rejected' })).toEqual({status:'rejected',official:null});
    expect(goodsOutcome({ situacaoOficial:'cancelada',outcome:'authorized' }).status).toBe('cancelled');
  });
  it.each(['unauthorized','module_inactive','forbidden','certificate_required','production_blocked','resultado_incerto','source_mismatch','document_changed','number_reservation_failed'])('traduz código %s sem expor detalhes internos', error => {
    expect(goodsFiscalError({error,message:'SQLSTATE 42501 public.secret_rpc token=private'})).not.toMatch(/SQLSTATE|42501|secret_rpc|token=/);
  });
  it.each(['sefaz_230','sefaz_231','sefaz_590','sefaz_591','sefaz_696','sefaz_778','sefaz_779','unexpected'])('traduz rejeição %s em causa e orientação sem código interno', code => { expect(goodsRejectionGuidance(code)).not.toContain(code); expect(goodsRejectionGuidance(code)).toMatch(/Revise|Confira|Corrija/); });
  it('fallback de validação bloqueia detalhes de banco', () => {
    expect(goodsFiscalError({error:'validation_failed',message:'constraint nfce_documents SQLSTATE 23505'})).not.toContain('23505');
    expect(goodsFiscalError({error:'validation_failed',message:'Item 1: NCM precisa ter 8 dígitos.'})).toContain('NCM');
    expect(goodsFiscalError({error:'dados_invalidos',message:'Item 1: informe o cBenef do Paraná.'})).toContain('cBenef');
    expect(goodsFiscalError({error:'dados_invalidos',message:'SQLSTATE 42501 public.secret'})).not.toContain('42501');
  });
  const sourceItems = [{id:'item-a',inventory_id:'material-a',quantity:2,unit_price:10,total:18}];
  const sourcePayments = [{method:'dinheiro',amount:18,change_amount:2}];
  const draft = {items:[{sourceItemId:'item-a',inventoryId:'material-a',quantity:2,unitPrice:10,total:18}], payments:[{method:'01',amount:20,change:2}]};
  it('mantém desconto, pagamento bruto e troco da venda no contrato fiscal', () => {
    expect(sourceFinancialsMatch(draft,18,sourceItems,sourcePayments)).toBe(true);
    expect(sourceFinancialsMatch({...draft,payments:[{method:'01',amount:18,change:2}]},18,sourceItems,sourcePayments)).toBe(false);
    expect(sourceFinancialsMatch({...draft,items:[{...draft.items[0],quantity:3}]},18,sourceItems,sourcePayments)).toBe(false);
    expect(sourceFinancialsMatch({...draft,items:[{...draft.items[0],sourceItemId:'item-b'}]},18,sourceItems,sourcePayments)).toBe(false);
  });
  it('fiado, saldo e voucher preservam a cobertura e não viram dinheiro', () => {
    for (const [method,code] of [['fiado','05'],['saldo_cliente','05'],['voucher','12']]) {
      expect(sourceFinancialsMatch({...draft,payments:[{method:code,amount:18,change:0,deferred:method==='fiado'}]},18,sourceItems,[{method,amount:18,change_amount:0}])).toBe(true);
    }
  });
});

describe('rateio fiscal por item preserva fonte comercial',()=>{
 const sources=[{id:'a',inventory_id:'ma',quantity:1,unit_price:25,total:25},{id:'b',inventory_id:'mb',quantity:1,unit_price:40,total:40}];
 const payment=[{method:'dinheiro',amount:60,change_amount:0}];
 it('rejeita redistribuir desconto entre bases tributárias com mesmo total agregado',()=>{
  const items=[{sourceItemId:'a',inventoryId:'ma',quantity:1,unitPrice:25,total:25},{sourceItemId:'b',inventoryId:'mb',quantity:1,unitPrice:40,total:35}];
  expect(sourceFinancialsMatch({items,payments:[{method:'01',amount:60,change:0}]},60,sources,payment)).toBe(false);
  expect(sourceFinancialsMatch({items:items.map((i,index)=>({...i,total:index===0?23.08:36.92})),payments:[{method:'01',amount:60,change:0}]},60,sources,payment)).toBe(true);
 });
 it('preserva centavos e itens zerados sem resíduo negativo',()=>{
  expect(canonicalGoodsSourceTotals(sources,60)).toEqual([23.08,36.92]);
  const five=Array.from({length:5},()=>({total:1}));expect(canonicalGoodsSourceTotals(five,4.97)).toEqual([0.99,0.99,0.99,1,1]);
  expect(canonicalGoodsSourceTotals([{total:0},{total:1}],0.99)).toEqual([0,0.99]);
  expect(canonicalGoodsSourceTotals([{total:1}],2)).toBeNull();
 });
});

describe('recuperação fiscal antes do envio',()=>{
 it('oferece o mesmo envio assinado e revisão local, sem recuperar estados incertos',()=>{
  expect(goodsDocumentRecovery({status:'signed',access_key:'0'.repeat(44)})?.action).toBe('resume');
  expect(goodsDocumentRecovery({status:'rejected'})?.action).toBe('reissue');
  expect(goodsDocumentRecovery({status:'rejected',access_key:'0'.repeat(44)})?.action).toBe('reissue');
  expect(goodsDocumentRecovery({status:'preparing',updated_at:'2020-01-01'} )?.action).toBe('revise');
  for(const status of ['uncertain','transmitting','authorized','cancelled','cancellation_pending'])expect(goodsDocumentRecovery({status})).toBeNull();
  expect(goodsDocumentRecovery({status:'preparing',updated_at:new Date().toISOString()})).toBeNull();
 });
 it('clona a rejeitada como nova nota sem mutar nem reaproveitar identificadores fiscais',()=>{
  const rejected={id:'rejected-a',number:15,numero:15,accessKey:'1'.repeat(44),access_key:'2'.repeat(44),chave:'3'.repeat(44),protocol:'protocol-a',protocolo:'protocol-b',operationId:'operation-a',operation_id:'operation-b',party:{name:'Cliente teste'}};
  const cloned=cloneGoodsDraftForReissue(rejected);
  expect(cloned).toEqual({id:null,party:{name:'Cliente teste'}});
  expect(rejected).toEqual(expect.objectContaining({id:'rejected-a',number:15,accessKey:'1'.repeat(44),party:{name:'Cliente teste'}}));
  expect(cloned.party).not.toBe(rejected.party);
 });
});
