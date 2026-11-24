import { assertEquals, assert } from 'https://deno.land/std@0.224.0/assert/mod.ts';

let handler!: (req: Request) => Promise<Response>;
const originalServe = Deno.serve;
(Deno as unknown as {serve: unknown}).serve = (fn: typeof handler) => { handler=fn; return {}; };
const edgeModule=await import('./index.ts');
(Deno as unknown as {serve: unknown}).serve = originalServe;

const user='a6020000-0000-4000-8000-000000000011';
const company='a6020000-0000-4000-8000-000000000001';
const doc='a6020000-0000-4000-8000-000000000061';
const source='a6020000-0000-4000-8000-000000000051';
const originalFetch = globalThis.fetch;
Deno.env.set('SUPABASE_URL','https://backend.example.invalid');
Deno.env.set('SUPABASE_SERVICE_ROLE_KEY','fictitious-local-test-key');
Deno.env.set('FISCAL_NFCE_PRODUCAO_HABILITADA','0');
let moduleAllowed=true, issuerAllowed=true, sourceAllowed=true, existingStatus='draft', environment='homologacao';
let hasCertificate=false; let expiresAt='2099-01-01';
const paths:string[]=[];
const json = (value:unknown) => new Response(JSON.stringify(value),{status:200,headers:{'content-type':'application/json'}});
function setup() {
 moduleAllowed=true;issuerAllowed=true;sourceAllowed=true;existingStatus='draft';environment='homologacao';hasCertificate=false;expiresAt='2099-01-01';paths.length=0;
 globalThis.fetch = ((input:RequestInfo|URL, init?:RequestInit) => {
  const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url);
  assertEquals(url.hostname,'backend.example.invalid','Tentativa de rede externa durante teste fiscal');
  paths.push(`${init?.method??'GET'}:${url.pathname}`);
  const name=url.pathname.split('/').at(-1);
  if(url.pathname==='/auth/v1/user')return Promise.resolve(json({id:user,aud:'authenticated',role:'authenticated'}));
  if(name==='profiles')return Promise.resolve(json({company_id:company,is_active:true}));
  if(name==='company_has_module')return Promise.resolve(json(moduleAllowed));
  if(name==='fiscal_user_can_emit_goods')return Promise.resolve(json(issuerAllowed));
  if(name==='fiscal_goods_user_can_access_source')return Promise.resolve(json(sourceAllowed));
  if(name==='fiscal_goods_sale_ready')return Promise.resolve(json(true));
  if(name==='company_nfce_settings')return Promise.resolve(json({uf:'RJ',series:1,enabled:true,homologation_approved:true,production_approved:true}));
  if(name==='nfce_documents')return Promise.resolve(json({id:doc,company_id:company,status:existingStatus,source_type:'manual',source_id:null,operation_id:doc,series:1}));
  if(name==='company_fiscal_settings')return Promise.resolve(json({certificado_ref:hasCertificate?'fictitious-reference':null,certificate_expires_at:expiresAt,fiscal_ambiente:environment}));
  if(name==='companies')return Promise.resolve(json({cnpj:'00000000000000',state:'RJ',name:'Emitente fictício',address:'Rua fictícia',neighborhood:'Centro',city:'Cidade fictícia',zip_code:'00000000'}));
  if(name==='company_settings')return Promise.resolve(json(null));
  throw new Error(`Rota local inesperada: ${url.pathname}`);
 }) as typeof fetch;
}
const request=(body:unknown, auth=true) => new Request('https://edge.example.invalid/fiscal-goods-document',{method:'POST',headers:{'content-type':'application/json',...(auth?{authorization:'Bearer fictitious-session'}:{})},body:JSON.stringify(body)});
const draft={model:65,direction:'saida',sourceType:'manual',nature:'VENDA A CONSUMIDOR',party:null,items:[],payments:[],freightMode:9,notes:''};
Deno.test('goods Edge exige Authorization antes de consultar backend',async()=>{setup();try{const r=await handler(request({},false));assertEquals(r.status,401);assertEquals(paths.length,0);}finally{globalThis.fetch=originalFetch;}});
Deno.test('goods Edge falha fechado sem módulo',async()=>{setup();moduleAllowed=false;try{const r=await handler(request({action:'emit',draft}));assertEquals(r.status,403);assertEquals((await r.json()).error,'module_inactive');assert(!paths.some(p=>p.includes('nfce_documents')));}finally{globalThis.fetch=originalFetch;}});
Deno.test('goods Edge exige ação granular e não chama can_manage_system',async()=>{setup();issuerAllowed=false;try{const r=await handler(request({action:'emit',draft}));assertEquals(r.status,403);assert(paths.some(p=>p.includes('fiscal_user_can_emit_goods')));assert(!paths.some(p=>p.includes('can_manage_system')));}finally{globalThis.fetch=originalFetch;}});
Deno.test('goods Edge bloqueia origem de outra empresa ou abertura',async()=>{setup();sourceAllowed=false;try{const r=await handler(request({action:'save_draft',draft:{...draft,sourceType:'pdv_sale',sourceId:source}}));assertEquals(r.status,403);assertEquals((await r.json()).error,'source_forbidden');assert(!paths.some(p=>p.includes('nfce_documents')));}finally{globalThis.fetch=originalFetch;}});
Deno.test('goods Edge permite rascunho sem certificado, isolado de transmissão',async()=>{setup();try{const r=await handler(request({action:'save_draft',draft}));assertEquals(r.status,200);assertEquals((await r.json()).status,'draft');assert(!paths.some(p=>p.includes('reserve_goods_fiscal_number')));}finally{globalThis.fetch=originalFetch;}});
Deno.test('goods Edge orienta A1 ausente antes de reservar número',async()=>{setup();try{const r=await handler(request({action:'emit',draft}));assertEquals(r.status,422);assertEquals((await r.json()).error,'certificate_required');assert(!paths.some(p=>p.includes('reserve_goods_fiscal_number')));}finally{globalThis.fetch=originalFetch;}});
Deno.test('goods Edge mantém produção bloqueada mesmo com aprovação persistida',async()=>{setup();hasCertificate=true;environment='producao';try{const r=await handler(request({action:'emit',draft}));assertEquals(r.status,422);assertEquals((await r.json()).error,'production_blocked');assert(!paths.some(p=>p.includes('reserve_goods_fiscal_number')));}finally{globalThis.fetch=originalFetch;}});
Deno.test('goods Edge retry de documento incerto retorna o mesmo ID sem nova transmissão',async()=>{setup();existingStatus='uncertain';try{const r=await handler(request({action:'emit',draft:{...draft,id:doc}}));assertEquals(r.status,200);const body=await r.json();assertEquals(body.id,doc);assertEquals(body.status,'uncertain');assert(!paths.some(p=>p.includes('reserve_goods_fiscal_number')));assert(!paths.some(p=>p.startsWith('PATCH:')));}finally{globalThis.fetch=originalFetch;}});

for (const invalidExpiry of ['2000-01-01', 'invalid-date']) Deno.test(`goods Edge bloqueia certificado com validade ${invalidExpiry}`, async()=>{setup();hasCertificate=true;expiresAt=invalidExpiry;try{const r=await handler(request({action:'emit',draft}));assertEquals(r.status,422);assertEquals((await r.json()).error,'certificate_required');assert(!paths.some(p=>p.includes('reserve_goods_fiscal_number')));}finally{globalThis.fetch=originalFetch;}});

Deno.test('adapter do motor canônico preserva consumidor CPF-only sem inventar endereço',()=>{
 const normalized=edgeModule.normalizeDraft({...draft,party:{document:'12345678901',name:''}});
 const built=edgeModule.buildMotorDocument(normalized,{document:'00000000000000',state:'RJ'},{fiscal_ambiente:'homologacao'},1,1);
 assertEquals(built.payload.destinatario?.cpfCnpj,'12345678901');
 assert(!('endereco' in (built.payload.destinatario??{})));
});
