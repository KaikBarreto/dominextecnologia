import { describe, it, expect } from 'vitest';
import { shouldAskPdvNfce, pdvNfceStatus } from './pdvNfce';
import { goodsRejectionGuidance } from './goodsRejectionGuidance';
import { goodsFiscalError } from './goodsErrors';
import { goodsOutcome, sourceFinancialsMatch } from '../../../supabase/functions/_shared/fiscal-goods-policy';

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
  it.each(['unauthorized','module_inactive','forbidden','certificate_required','production_blocked','resultado_incerto','source_mismatch'])('traduz código %s sem expor detalhes internos', error => {
    expect(goodsFiscalError({error,message:'SQLSTATE 42501 public.secret_rpc token=private'})).not.toMatch(/SQLSTATE|42501|secret_rpc|token=/);
  });
  it.each(['sefaz_230','sefaz_231','sefaz_590','sefaz_591','sefaz_778','sefaz_779','unexpected'])('traduz rejeição %s em causa e orientação sem código interno', code => { expect(goodsRejectionGuidance(code)).not.toContain(code); expect(goodsRejectionGuidance(code)).toMatch(/Revise|Confira|Corrija/); });
  it('fallback de validação bloqueia detalhes de banco', () => {
    expect(goodsFiscalError({error:'validation_failed',message:'constraint nfce_documents SQLSTATE 23505'})).not.toContain('23505');
    expect(goodsFiscalError({error:'validation_failed',message:'Item 1: NCM precisa ter 8 dígitos.'})).toContain('NCM');
  });
  const sourceItems = [{id:'item-a',inventory_id:'material-a',quantity:2,unit_price:10}];
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
      expect(sourceFinancialsMatch({...draft,payments:[{method:code,amount:18,change:0}]},18,sourceItems,[{method,amount:18,change_amount:0}])).toBe(true);
    }
  });
});
