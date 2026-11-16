import { describe, expect, it } from 'vitest';
import { resolveBusinessCore, parseBusinessCore, coreIncludesModule, coreAllowsModule, coreAddonCode, corePlanCode, coreCommercialModules, applyRegistrationCoreOffer, registrationOfferConfiguration, registrationOfferSearchParams } from './businessCore';
const paid = {trialActive:false,contractedModules:['basic'],planModules:[]};
describe('núcleos comerciais', () => {
 it('mantém cadastros legados em Serviços e rejeita códigos inventados', () => {
   expect(resolveBusinessCore(undefined)).toBe('services');
   expect(parseBusinessCore('Loja')).toBeNull();
   expect(()=>resolveBusinessCore('admin')).toThrow();
 });
 it.each(['services','retail'] as const)('inclui base e preserva o outro núcleo como adicional em %s', core => {
   expect(coreIncludesModule(core,'basic')).toBe(true);
   expect(coreIncludesModule(core,coreAddonCode(core))).toBe(false);
   expect(coreAllowsModule(core,'basic',paid)).toBe(true);
 });
 it('Loja paga ou em teste inclui PDV sem conceder OS automaticamente', () => {
   for(const trialActive of [false,true]) {
     const context={...paid,trialActive};
     expect(coreAllowsModule('retail','pdv',context)).toBe(true);
     expect(coreAllowsModule('retail','service_operations',context)).toBe(false);
   }
   expect(coreAllowsModule('retail','service_operations',{...paid,contractedModules:['basic','service_operations']})).toBe(true);
 });
 it('Serviços preserva acesso à operação e PDV é adicional no plano pago', () => {
   expect(coreAllowsModule('services','service_operations',paid)).toBe(true);
   expect(coreAllowsModule('services','pdv',paid)).toBe(false);
   expect(coreAllowsModule('services','pdv',{...paid,contractedModules:['basic','pdv']})).toBe(true);
 });
 it('não concede núcleo sem base, contrato ou trial', () => {
   const noAccess={trialActive:false,contractedModules:[],planModules:[]};
   expect(coreAllowsModule('retail','pdv',noAccess)).toBe(false);
   expect(coreAllowsModule('services','service_operations',noAccess)).toBe(false);
 });
 it('separa planos e evita cobrar novamente o PDV da Loja', () => {
   expect(corePlanCode('retail','start')).toBe('retail_start');
   expect(corePlanCode('retail','personalizado')).toBe('personalizado');
   expect(corePlanCode('retail','retail_start')).toBe('retail_start');
   expect(coreCommercialModules('retail',['basic','pdv','pdv','nfe'])).toEqual(['basic','nfe']);
   expect(coreCommercialModules('services',['basic','pdv'])).toEqual(['basic','pdv']);
 });
 it('a oferta persistida vence o perfil e os valores adulterados do cliente',()=>{
  const raw={business_core:'retail',locked_price:1,locked_plan:'master',password:'only-test',company_name:'Teste'};
  const offer={business_core:'services',configuration:{locked_price:297,locked_plan:'start',link_type:'venda'}};
  expect(applyRegistrationCoreOffer(raw,offer)).toEqual({...raw,business_core:'services',locked_price:297,locked_plan:'start',link_type:'venda'});
  expect(()=>applyRegistrationCoreOffer(raw,null)).toThrow();
  const url=registrationOfferSearchParams(new URLSearchParams('nucleo=retail&preco=1&plano=master&meses_promo=99&bloqueado=1'),offer);
  expect(url.get('nucleo')).toBe('services');expect(url.get('preco')).toBe('297');
  expect(url.get('plano')).toBe('start');expect(url.has('meses_promo')).toBe(false);
  expect(url.has('bloqueado')).toBe(false);
 });
 it('não inclui dados pessoais ou senha na configuração do link',()=>{
  const config=registrationOfferConfiguration(new URLSearchParams('tipo=teste&password=secret&email=test@example.invalid&usuarios=10'));
  expect(config.max_users).toBe(10);expect(config).not.toHaveProperty('password');expect(config).not.toHaveProperty('email');
 });
 it('recursos de serviços não aparecem no trial de Loja sem contratação de Serviços',()=>{
  for(const code of ['contracts','customer_portal','video_questions']) {
   expect(coreAllowsModule('retail',code,{...paid,trialActive:true,planModules:[code]})).toBe(false);
   expect(coreAllowsModule('retail',code,{...paid,contractedModules:['basic','service_operations',code]})).toBe(true);
  }
 });
 it('trial de Serviços novo não habilita PDV; trials legados permanecem iguais',()=>{
  const trial={...paid,trialActive:true};
  expect(coreAllowsModule('services','pdv',{...trial,coreVersion:1})).toBe(true);
  expect(coreAllowsModule('services','pdv',{...trial,coreVersion:2})).toBe(false);
  expect(coreAllowsModule('services','pdv',{...trial,coreVersion:2,contractedModules:['basic','pdv']})).toBe(true);
 });
 it('oferta esparsa de afiliado não herda plano, desconto, prazo, usuários ou atribuição forjados',()=>{
  const forged={company_name:'Loja teste',company_email:'teste@example.invalid',password:'local-test',business_core:'services',
   locked_plan:'master',locked_price:1,is_locked:true,modules:['service_operations','pdv'],max_users:999,trial_days:999,
   promo_months:120,billing_cycle:'yearly',referral_code:'outro-vendedor',affiliate_id:'outro-afiliado',origin:'Outra origem',sdr_referral_code:'outro',
   acquisition_attribution:{first_touch:{source:'forjado'},last_touch:{source:'forjado'}},custom_price:1};
  const safe=applyRegistrationCoreOffer(forged,{business_core:'retail',configuration:{link_type:'teste',affiliate_id:'afiliado-autorizado'}});
  expect(safe).toEqual({company_name:'Loja teste',company_email:'teste@example.invalid',password:'local-test',business_core:'retail',link_type:'teste',affiliate_id:'afiliado-autorizado'});
  for(const key of ['locked_plan','locked_price','is_locked','modules','max_users','trial_days','promo_months','billing_cycle','referral_code','origin','sdr_referral_code','acquisition_attribution','custom_price'])expect(safe).not.toHaveProperty(key);
 });
});
