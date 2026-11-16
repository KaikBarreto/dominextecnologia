/** Contrato compartilhado entre cadastro, catálogo, checkout e navegação. */
export type BusinessCore = 'services' | 'retail';
export const BUSINESS_CORES = ['services', 'retail'] as const;
export const SERVICE_OPERATIONS_MODULE = 'service_operations';
export const SERVICE_DEPENDENT_MODULE_CODES = ['contracts','customer_portal','video_questions'] as const;
export const BUSINESS_CORE_QUERY_PARAM = 'nucleo';
export function parseBusinessCore(value: unknown): BusinessCore | null {
  return value === 'services' || value === 'retail' ? value : null;
}
/** Ausência legada mantém Serviços; entrada inválida nunca muda o contrato. */
export function resolveBusinessCore(value: unknown): BusinessCore {
  if (value == null || value === '') return 'services';
  const core = parseBusinessCore(value);
  if (!core) throw new Error('Escolha Loja ou Serviços para continuar.');
  return core;
}
export const SERVICE_SCREEN_KEYS = new Set([
  'screen:schedule', 'screen:service_orders', 'screen:quotes', 'screen:services',
  'screen:equipment', 'screen:technician', 'screen:tracking', 'screen:checklists',
]);
export function coreIncludesModule(core: BusinessCore, code: string): boolean {
  return code === 'basic' || (core === 'retail' ? code === 'pdv' : code === SERVICE_OPERATIONS_MODULE);
}
/** Especifica a cobrança; entitlement e preço não são lidos da query string. */
export function coreAddonCode(core: BusinessCore): 'pdv' | 'service_operations' {
  return core === 'retail' ? SERVICE_OPERATIONS_MODULE : 'pdv';
}
export function corePlanCode(core: BusinessCore, plan: string): string {
  if (plan === 'personalizado') return plan;
  const plain = plan.replace(/^retail_/, '');
  return core === 'retail' ? `retail_${plain}` : plain;
}
export function coreCommercialModules(core: BusinessCore, modules: string[]): string[] {
  return [...new Set(modules)].filter(code => !coreIncludesModule(core, code) || code === 'basic');
}
export function coreAllowsModule(core: BusinessCore, code: string, context: {
  coreVersion?: number; trialActive: boolean; contractedModules: readonly string[]; planModules: readonly string[];
}): boolean {
  const explicitlyContracted = context.contractedModules.includes(code) || context.planModules.includes(code);
  if(core==='services' && (context.coreVersion??1)>=2 && code==='pdv') return explicitlyContracted;
  if (core === 'retail' && (SERVICE_DEPENDENT_MODULE_CODES as readonly string[]).includes(code)
    && !context.contractedModules.includes(SERVICE_OPERATIONS_MODULE) && !context.planModules.includes(SERVICE_OPERATIONS_MODULE)) return false;
  if (code === SERVICE_OPERATIONS_MODULE) return core === 'services'
    ? context.trialActive || context.contractedModules.includes('basic') || context.planModules.includes('basic')
    : explicitlyContracted;
  if (core === 'retail' && code === 'pdv') return context.trialActive
    || context.contractedModules.includes('basic') || context.planModules.includes('basic');
  return context.trialActive || explicitlyContracted;
}

export function registrationOfferConfiguration(params: URLSearchParams): Record<string, string | number | boolean | string[] | null> {
  const number = (key: string) => params.has(key) ? Number(params.get(key)) : null;
  return {
    link_type: params.get('tipo') || 'teste', locked_plan: params.get('plano'),
    is_locked: params.get('bloqueado') === '1', locked_price: number('preco'),
    billing_cycle: params.get('ciclo'), promo_months: number('meses_promo'),
    trial_days: number('dias'), referral_code: params.get('vendedor'),
    affiliate_id: params.get('afiliado'), modules: params.get('modulos')?.split(',').filter(Boolean) ?? null,
    max_users: number('usuarios'), origin: params.get('origem'),
  };
}
/** Uma oferta persistida tem precedência sobre qualquer preço/perfil do cliente. */
export function applyRegistrationCoreOffer(raw: Record<string, unknown>, offer: unknown): Record<string, unknown> {
  if (!offer || typeof offer !== 'object') throw new Error('Este link não está mais disponível. Peça um novo link.');
  const value = offer as {business_core?: unknown;configuration?: unknown};
  const core = parseBusinessCore(value.business_core);
  if (!core || !value.configuration || typeof value.configuration !== 'object' || Array.isArray(value.configuration)) {
    throw new Error('Não foi possível conferir as condições deste link.');
  }
  const identityKeys=['company_name','company_cnpj','company_email','company_phone','contact_name','password','company_address','segment','terms_version','locale','country_code','language','currency','timezone','user_language'];
  const configurationKeys=['link_type','locked_plan','is_locked','locked_price','billing_cycle','promo_months','trial_days','referral_code','affiliate_id','modules','max_users','origin'];
  const identity=Object.fromEntries(identityKeys.filter(key=>Object.prototype.hasOwnProperty.call(raw,key)).map(key=>[key,raw[key]]));
  const configuration=value.configuration as Record<string,unknown>;
  const conditions=Object.fromEntries(configurationKeys.filter(key=>Object.prototype.hasOwnProperty.call(configuration,key)).map(key=>[key,configuration[key]]));
  // Ausência numa oferta NÃO significa autorização para herdar um campo do
  // cliente. Só identidade/região vêm do formulário; toda condição é persistida.
  return {...identity,...conditions,business_core:core};
}

export function registrationOfferSearchParams(params:URLSearchParams, offer:unknown):URLSearchParams {
  const resolved=new URLSearchParams(params);
  if(!offer||typeof offer!=='object')return resolved;
  const trusted=applyRegistrationCoreOffer({},offer);
  const keys:Record<string,string>={tipo:'link_type',plano:'locked_plan',preco:'locked_price',ciclo:'billing_cycle',meses_promo:'promo_months',dias:'trial_days',vendedor:'referral_code',afiliado:'affiliate_id',modulos:'modules',usuarios:'max_users',origem:'origin'};
  for(const [query,key] of Object.entries(keys)){
    resolved.delete(query);
    const value=trusted[key];
    if(value!=null&&value!=='')resolved.set(query,Array.isArray(value)?value.join(','):String(value));
  }
  resolved.delete('bloqueado');
  if(trusted.is_locked)resolved.set('bloqueado','1');
  resolved.set('nucleo',String(trusted.business_core));
  return resolved;
}
