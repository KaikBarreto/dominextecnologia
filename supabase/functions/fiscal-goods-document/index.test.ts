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
Deno.env.set('FISCAL_SERVICE_URL','https://engine.example.invalid');
Deno.env.set('FISCAL_SERVICE_TOKEN','fictitious-motor-test-key');
let moduleAllowed=true, issuerAllowed=true, sourceAllowed=true, existingStatus='draft', environment='homologacao';
let hasCertificate=false; let expiresAt='2099-01-01';
let completeMode=false;let faultStage='';let storedStatus='draft';const patches:Record<string,unknown>[]=[];
const paths:string[]=[];
const json = (value:unknown) => new Response(JSON.stringify(value),{status:200,headers:{'content-type':'application/json'}});
function setup() {
 moduleAllowed=true;issuerAllowed=true;sourceAllowed=true;existingStatus='draft';environment='homologacao';hasCertificate=false;expiresAt='2099-01-01';completeMode=false;faultStage='';storedStatus='draft';patches.length=0;paths.length=0;
 globalThis.fetch = ((input:RequestInfo|URL, init?:RequestInit) => {
  const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url);
  assert(['backend.example.invalid','engine.example.invalid'].includes(url.hostname),'Tentativa de rede externa durante teste fiscal');
  if(url.hostname==='engine.example.invalid'){paths.push(`MOTOR:${url.pathname}`);if(url.pathname.endsWith('/preparar'))return Promise.resolve(json({chave:'0'.repeat(44),xmlAssinado:'<NFe>FICTITIOUS-SIGNED</NFe>'.repeat(30)}));if(url.pathname.endsWith('/autorizar')||url.pathname.endsWith('/consultar'))return Promise.resolve(json({outcome:'authorized',situacaoOficial:'autorizada',resposta:{cstat:'100'},prova:{protocol:'1'.repeat(15)},xmlProcessado:'<nfeProc>FICTITIOUS-PROOF</nfeProc>'.repeat(30),danfceBase64:btoa('%PDF-FICTITIOUS')}));throw new Error('Unexpected motor test route');}
  if(url.pathname.includes('/storage/v1/object/'))return Promise.resolve((init?.method??'GET')==='GET'?new Response('fictitious-encrypted-test-object'):json({Key:'fictitious-path'}));
  paths.push(`${init?.method??'GET'}:${url.pathname}`);
  const name=url.pathname.split('/').at(-1);
  if(url.pathname==='/auth/v1/user')return Promise.resolve(json({id:user,aud:'authenticated',role:'authenticated'}));
  if(name==='profiles')return Promise.resolve(json({company_id:company,is_active:true}));
  if(name==='company_has_module')return Promise.resolve(json(moduleAllowed));
  if(name==='fiscal_user_can_emit_goods')return Promise.resolve(json(issuerAllowed));
  if(name==='fiscal_goods_user_can_access_source')return Promise.resolve(json(sourceAllowed));
  if(name==='fiscal_goods_sale_ready')return Promise.resolve(json(true));
  if(name==='company_nfce_settings')return Promise.resolve(json({uf:'RJ',series:1,enabled:true,homologation_approved:true,production_approved:true,...(completeMode?{qr_base_url_homologation:'https://sefaz.example.gov.br/qrcode',access_url_homologation:'https://sefaz.example.gov.br/consulta'}:{})}));
  if(name==='nfce_documents'){
    if(init?.method==='PATCH'){
      const patch=JSON.parse(String(init.body));patches.push(patch);
      const fail=(faultStage==='snapshot'&&'snapshot' in patch)||(faultStage==='signed'&&patch.status==='signed')||(['official','consult'].includes(faultStage)&&patch.status==='authorized');
      if(fail)return Promise.resolve(new Response(JSON.stringify({code:'fault_injected',message:'FICTITIOUS_WRITE_FAILURE'}),{status:500,headers:{'content-type':'application/json'}}));
      storedStatus=String(patch.status??storedStatus);
    }
    return Promise.resolve(json({id:doc,company_id:company,status:completeMode?storedStatus:existingStatus,source_type:'manual',source_id:null,operation_id:doc,series:1,...(completeMode&&existingStatus!=='draft'?{access_key:'0'.repeat(44),protocol:'1'.repeat(15),uf:'RJ',signed_xml_path:'fictitious-signed-path'}:{})}));
  }
  if(name==='nfce_events'||name==='fiscal_certificate_audit'){
    if(name==='nfce_events'&&faultStage==='event')return Promise.resolve(new Response(JSON.stringify({code:'fault_injected'}),{status:500,headers:{'content-type':'application/json'}}));
    return Promise.resolve(json({id:doc}));
  }
  if(name==='reserve_goods_fiscal_number')return Promise.resolve(json([{series:1,number:12}]));
  if(name==='company_fiscal_settings')return Promise.resolve(json({certificado_ref:hasCertificate?'fictitious-reference':null,certificate_expires_at:expiresAt,fiscal_ambiente:environment,...(completeMode?{regime_tributario:'simples_nacional',inscricao_estadual:'12345678',municipio_ibge:'3304557',certificado_dek_envelopada:'fictitious-dek',certificado_senha_cifrada:'fictitious-cipher',certificado_nonce:'fictitious-nonce'}:{})}));
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

Deno.test('adapter fiscal preserva fiado como pagamento a prazo sem alterar valor',()=>{
 const normalized=edgeModule.normalizeDraft({...draft,payments:[{method:'05',amount:18,change:0,deferred:true}]});
 const built=edgeModule.buildMotorDocument(normalized,{document:'00000000000000',state:'RJ'},{fiscal_ambiente:'homologacao'},1,1);
 assertEquals(built.payload.pagamentos[0].aVista,false);assertEquals(built.payload.pagamentos[0].valor,18);
});

const completeDraft={...draft,items:[{description:'Material fictício',quantity:1,unitPrice:10,discount:0,unit:'UN',taxUnit:'UN',ncm:'12345678',origin:'0',cfopExitInternal:'5102',icmsCode:'102',pisCst:'49',cofinsCst:'49'}],payments:[{method:'01',amount:10,change:0}]};
for(const stage of ['snapshot','signed'])Deno.test(`falha de persistência ${stage} impede autorização no motor`,async()=>{setup();completeMode=true;hasCertificate=true;faultStage=stage;try{const r=await handler(request({action:'emit',draft:completeDraft}));assertEquals(r.status,503);assertEquals((await r.json()).error,'persistence_failed');assert(!paths.includes('MOTOR:/v1/nfce/autorizar'));if(stage==='snapshot')assert(!paths.includes('MOTOR:/v1/nfce/preparar'));}finally{globalThis.fetch=originalFetch;}});
Deno.test('falha ao persistir resposta oficial não devolve sucesso e preserva consulta do mesmo documento',async()=>{setup();completeMode=true;hasCertificate=true;faultStage='official';try{const r=await handler(request({action:'emit',draft:completeDraft}));assertEquals(r.status,503);assertEquals((await r.json()).error,'persistence_failed');assert(paths.includes('MOTOR:/v1/nfce/autorizar'));assertEquals(storedStatus,'uncertain');assert(patches.some(p=>p.status==='signed'&&p.access_key));}finally{globalThis.fetch=originalFetch;}});
Deno.test('falha de evento não rebaixa autorização já persistida nem devolve sucesso',async()=>{setup();completeMode=true;hasCertificate=true;faultStage='event';try{const r=await handler(request({action:'emit',draft:completeDraft}));assertEquals(r.status,503);assertEquals((await r.json()).error,'persistence_failed');assertEquals(storedStatus,'authorized');}finally{globalThis.fetch=originalFetch;}});
Deno.test('consulta não devolve sucesso se confirmação não for persistida',async()=>{setup();completeMode=true;hasCertificate=true;existingStatus='uncertain';storedStatus='uncertain';faultStage='consult';try{const r=await handler(request({model:65,documentId:doc,action:'consult'}));assertEquals(r.status,503);assertEquals((await r.json()).error,'persistence_failed');assertEquals(storedStatus,'uncertain');}finally{globalThis.fetch=originalFetch;}});
