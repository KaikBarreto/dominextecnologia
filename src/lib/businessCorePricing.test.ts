import {describe, expect, it, vi} from 'vitest';
import {customCommercialModulesForCore, loadBusinessCoreBasePrice, parseBusinessCoreBasePrice, requiredCustomModulesForCore} from './businessCorePricing';
import {buildCoreCommercialFeatures, corePlanFeatures, planBelongsToCore} from './businessCoreCatalog';

describe('catálogo dos kits', () => {
  it('não cobra PDV no kit Loja nem Serviços no kit Serviços', () => {
    expect(customCommercialModulesForCore('retail', ['pdv'])).toEqual(['basic','finance_advanced','pricing_advanced']);
    expect(customCommercialModulesForCore('services', ['service_operations','pdv']))
      .toEqual(['basic','finance_advanced','pricing_advanced','customer_portal','video_questions','pdv']);
  });
  it('só oferece os recursos dependentes de Serviços depois do adicional', () => {
    expect(() => customCommercialModulesForCore('retail', ['contracts'])).toThrow(/kit Serviços/);
    expect(customCommercialModulesForCore('retail', ['customer_portal','video_questions'])).not.toContain('video_questions');
    expect(requiredCustomModulesForCore('retail')).not.toContain('customer_portal');
    expect(customCommercialModulesForCore('retail', ['service_operations','contracts']))
      .toEqual(['basic','finance_advanced','pricing_advanced','customer_portal','video_questions','service_operations','contracts']);
  });
  it('catálogo sem preço não significa kit gratuito', async () => {
    const rpc = vi.fn().mockResolvedValue({data:{business_core:'retail',base_price:null,configured:false},error:null});
    expect(await loadBusinessCoreBasePrice({rpc},'retail')).toBeNull();
    expect(rpc).toHaveBeenCalledWith('get_business_core_base_price_v1',{p_business_core:'retail'});
    rpc.mockResolvedValue({data:null,error:{code:'42P01'}});
    await expect(loadBusinessCoreBasePrice({rpc},'retail')).rejects.toThrow('Não foi possível consultar');
  });
  it.each([0,-1,Number.NaN,Number.POSITIVE_INFINITY,'100',null])('recusa preço configurado inválido %s', price => {
    expect(() => parseBusinessCoreBasePrice({business_core:'retail',base_price:price,configured:true},'retail')).toThrow();
  });
  it('não aceita resposta de outro núcleo ou configuração contraditória', () => {
    expect(() => parseBusinessCoreBasePrice({business_core:'services',base_price:100,configured:true},'retail')).toThrow();
    expect(() => parseBusinessCoreBasePrice({business_core:'retail',base_price:100,configured:false},'retail')).toThrow();
    expect(parseBusinessCoreBasePrice({business_core:'services',base_price:197,configured:true},'services').basePrice).toBe(197);
  });
  it('separa os planos e não promete OS no kit Loja', () => {
    expect(planBelongsToCore({code:'retail_start',business_core:'retail'},'services')).toBe(false);
    expect(planBelongsToCore({code:'start'},'services')).toBe(true);
    expect(corePlanFeatures('retail','retail_master').join(' ')).not.toMatch(/Ordens de serviço|PMOC/);
    expect(buildCoreCommercialFeatures('retail',['basic','pdv'],[{code:'pdv',name:'PDV adicional'}])).not.toContain('PDV adicional');
  });
});
