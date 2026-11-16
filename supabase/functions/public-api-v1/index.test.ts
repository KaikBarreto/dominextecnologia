// HTTP doubles locais; nenhuma chave real, gateway ou banco remoto.
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { sha256Hex } from '../_shared/public-api.ts';
type Handler=(request:Request)=>Promise<Response>;
let handler!:Handler;
const serve=Deno.serve;
(Deno as unknown as {serve:unknown}).serve=(fn:Handler)=>{handler=fn;return {};};
await import('./index.ts');
(Deno as unknown as {serve:unknown}).serve=serve;
const originalFetch=globalThis.fetch;
const company='f4162130-0000-4000-8000-000000000001';
const integration='f4162130-0000-4000-8000-000000000003';
const record='f4162130-0000-4000-8000-000000000005';
const publicId='a'.repeat(16);const secret='b'.repeat(43);
const json=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}});
async function run(path:string,options:{method?:string;body?:unknown;licensed?:unknown;licenseError?:boolean;revokedInRpc?:boolean}={}){
 Deno.env.set('SUPABASE_URL','https://backend.example.invalid');
 Deno.env.set('SUPABASE_SERVICE_ROLE_KEY','fictitious-service-key');
 Deno.env.set('PUBLIC_API_PROXY_SECRET','fictitious-proxy-key');
 const hash=await sha256Hex(secret);const calls:string[]=[];
 globalThis.fetch=(async(input,init)=>{
  const url=new URL(typeof input==='string'?input:input instanceof URL?input:input.url);
  assertEquals(url.hostname,'backend.example.invalid');
  const name=url.pathname.split('/').at(-1)!;calls.push(`${init?.method??'GET'}:${name}`);
  if(name==='public_api_keys')return json({id:record,integration_id:integration,public_id:publicId,secret_hash:hash,valid_from:'2020-01-01T00:00:00Z',expires_at:'2099-01-01T00:00:00Z',revoked_at:null});
  if(name==='public_api_integrations')return json({id:integration,company_id:company,name:'Integração fictícia',scopes:['catalogs:read','availability:read','customers:resolve','service_orders:create','service_orders:read','crm_cards:read'],status:'active',distribution_mode:'agent_selects',ip_allowlist:[]});
  if(name==='app_feature_flags')return json({enabled:true,company_allowlist:[]});
  if(name==='tenant_subscription_allows_access')return json(true);
  if(name==='public_api_consume_rate_limit')return json({allowed:true});
  if(name==='public_api_insert_request_audit')return json(null);
  if(name==='company_has_module'){
   const input=JSON.parse(String(init?.body));assertEquals(input,{p_company_id:company,p_module_code:'service_operations'});
   return options.licenseError?json({code:'fixture_error',message:'erro interno'},500):json(options.licensed??false);
  }
  if(name==='schedule_booking_settings')return json({slot_interval_minutes:30,minimum_notice_minutes:0,booking_horizon_days:60,default_duration_minutes:60,weekly_hours:{}});
  if(name==='company_settings')return json({timezone:'America/Sao_Paulo'});
  if(name==='service_types')return json([{id:record,name:'Serviço fictício',description:null,requires_equipment:false}]);
  if(name==='public_api_get_catalogs')return options.revokedInRpc?json({code:'42501',message:'public_api_service_operations_required'},403):json({service_types:[{id:record,name:'Serviço fictício',description:null,requires_equipment:false,color:'#000000'}],resources:[],os_types:[]});
  if(name==='public_api_resolve_customer')return json({id:record,name:'Cliente fictício'});
  if(name==='public_api_get_crm_pipelines')return json({data:[]});
  throw new Error(`Rota inesperada no teste: ${name}`);
 })as typeof fetch;
 try{
  const response=await handler(new Request(`https://edge.example.invalid/public-api-v1${path}`,{method:options.method??'GET',headers:{Authorization:`Bearer dmx_live_${publicId}.${secret}`,'x-dominex-proxy-authorization':'fictitious-proxy-key','Content-Type':'application/json','Idempotency-Key':'api-core-fictitious-key'},...(options.body===undefined?{}:{body:JSON.stringify(options.body)})}));
  return{response,data:await response.json(),calls};
 }finally{globalThis.fetch=originalFetch;}
}
for(const [path,method]of[
 ['/v1/service-types','GET'],['/v1/booking-resources','GET'],['/v1/availability','GET'],
 ['/v1/service-orders','POST'],[`/v1/service-orders/${record}`,'GET'],['/v1/service-orders/by-external-id/fictitious','GET'],
])Deno.test(`chave com escopo não concede Serviços: ${method} ${path}`,async()=>{
 const result=await run(path,{method,...(method==='POST'?{body:{}}:{})});
 assertEquals(result.response.status,403);assertEquals(result.data.code,'module_not_contracted');
 assert(!result.calls.some(call=>/public_api_(create_service_order|get_service_order|get_catalogs|get_availability|get_booking_resources)$/.test(call)));
});
Deno.test('capabilities sem Serviços não lê nem divulga agenda e preserva contrato existente',async()=>{
 const result=await run('/v1/capabilities');assertEquals(result.response.status,200);
 assertEquals(result.data.booking,null);assertEquals(result.data.schedule_configured,false);
 assert(!result.calls.includes('GET:schedule_booking_settings'));
});
Deno.test('Serviços contratado ou legado usa catálogo com segunda cerca SQL sem campos adicionais',async()=>{
 const result=await run('/v1/service-types',{licensed:true});assertEquals(result.response.status,200);
 assertEquals(result.data,{data:[{id:record,name:'Serviço fictício',description:null,requires_equipment:false}]});
 assert(result.calls.includes('POST:public_api_get_catalogs'));assert(!result.calls.includes('GET:service_types'));
});
Deno.test('revogação percebida pela RPC vira domínio público 403 sem expor código interno',async()=>{
 const result=await run('/v1/service-types',{licensed:true,revokedInRpc:true});
 assertEquals(result.response.status,403);assertEquals(result.data.code,'module_not_contracted');
 assert(!JSON.stringify(result.data).includes('public_api_service_operations_required'));
});
Deno.test('erro ou estado desconhecido da licença falha fechado',async()=>{
 for(const options of[{licenseError:true},{licensed:{}}]){
  const result=await run('/v1/service-types',options);assertEquals(result.response.status,503);
  assert(!result.calls.includes('POST:public_api_get_catalogs'));
 }
});
Deno.test('Loja sem Serviços mantém resolução de clientes e gates atuais do CRM',async()=>{
 const customer=await run('/v1/customers/resolve',{method:'POST',body:{email:'customer-213@example.invalid'}});
 assertEquals(customer.response.status,200);assert(!customer.calls.includes('POST:company_has_module'));
 const crm=await run('/v1/crm/pipelines');assertEquals(crm.response.status,200);
 assert(!crm.calls.includes('POST:company_has_module'));
});
