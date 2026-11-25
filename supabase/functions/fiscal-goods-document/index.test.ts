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
const stock='a6020000-0000-4000-8000-000000000052';
const seriesId='a6020000-0000-4000-8000-000000000071';
const carrierId='a6020000-0000-4000-8000-000000000081';
const scenarioId='a6020000-0000-4000-8000-000000000091';
const originalFetch = globalThis.fetch;
Deno.env.set('SUPABASE_URL','https://backend.example.invalid');
Deno.env.set('SUPABASE_SERVICE_ROLE_KEY','fictitious-local-test-key');
Deno.env.set('FISCAL_NFCE_PRODUCAO_HABILITADA','0');
Deno.env.set('FISCAL_SERVICE_URL','https://engine.example.invalid');
Deno.env.set('FISCAL_SERVICE_TOKEN','fictitious-motor-test-key');
let moduleAllowed=true, issuerAllowed=true, sourceAllowed=true, existingStatus='draft', environment='homologacao';
let hasCertificate=false; let expiresAt='2099-01-01';
let nfeHomologationApproved=true;let nfeProductionApproved=false;
let seriesAllowed=true, seriesActive=true, seriesDirection='saida';
let carrierAllowed=true, carrierActive=true;
let completeMode=false;let faultStage='';let storedStatus='draft';let claimCompared=false;let rowExtra:Record<string,unknown>={};let transmitCompared=false;let rowVersion=0;const patches:Record<string,unknown>[]=[];
const paths:string[]=[];
const documentWrites:Record<string,unknown>[]=[];
const motorBodies:Record<string,unknown>[]=[];
let reservationArgs:Record<string,unknown>|null=null;
const storedArtifacts=new Map<string,string>();
const json = (value:unknown) => new Response(JSON.stringify(value),{status:200,headers:{'content-type':'application/json'}});
function setup() {
 moduleAllowed=true;issuerAllowed=true;sourceAllowed=true;existingStatus='draft';environment='homologacao';hasCertificate=false;expiresAt='2099-01-01';nfeHomologationApproved=true;nfeProductionApproved=false;seriesAllowed=true;seriesActive=true;seriesDirection='saida';carrierAllowed=true;carrierActive=true;completeMode=false;faultStage='';storedStatus='draft';claimCompared=false;rowExtra={};transmitCompared=false;rowVersion=0;reservationArgs=null;storedArtifacts.clear();patches.length=0;paths.length=0;documentWrites.length=0;motorBodies.length=0;
 globalThis.fetch = ((input:RequestInfo|URL, init?:RequestInit) => {
  const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url);
  assert(['backend.example.invalid','engine.example.invalid'].includes(url.hostname),'Tentativa de rede externa durante teste fiscal');
  if(url.hostname==='engine.example.invalid'){
    paths.push(`MOTOR:${url.pathname}`);
    const motorBody=JSON.parse(String(init?.body));motorBodies.push(motorBody);
    const model=url.pathname.includes('/nfe/')?'55':'65';
    if(url.pathname.endsWith('/preparar'))return Promise.resolve(json({tenantId:faultStage==='wrong_tenant'?'other-fictitious-company':company,operationId:doc,snapshotHash:motorBody.snapshotHash,status:'preparada',chave:'0'.repeat(20)+model+'0'.repeat(22),xmlAssinado:'<NFe>FICTITIOUS-SIGNED</NFe>'.repeat(30)}));
    if(url.pathname.endsWith('/autorizar')||url.pathname.endsWith('/consultar'))return Promise.resolve(json({outcome:'authorized',situacaoOficial:'autorizada',resposta:{cstat:'100'},prova:{protocol:'1'.repeat(15)},xmlProcessado:'<nfeProc>FICTITIOUS-PROOF</nfeProc>'.repeat(30),...(model==='55'?{danfeBase64:btoa('%PDF-FICTITIOUS')}:{danfceBase64:btoa('%PDF-FICTITIOUS')})}));
    throw new Error('Unexpected motor test route');
  }
  if(url.pathname.includes('/storage/v1/object/')){
    if((init?.method??'GET')==='GET')return Promise.resolve(new Response('fictitious-encrypted-test-object'));
    return (async()=>{const body=init?.body;let data='';
      if(body instanceof FormData){for(const value of body.values())if(value instanceof Blob){data=await value.text();break;}}
      else if(body instanceof Blob)data=await body.text();
      else if(body instanceof ArrayBuffer || ArrayBuffer.isView(body))data=new TextDecoder().decode(body as ArrayBuffer);
      else data=String(body??'');
      storedArtifacts.set(decodeURIComponent(url.pathname.replace('/storage/v1/object/fiscal-artifacts/','')),data);
      return json({Key:'fictitious-path'});
    })();
  }
  paths.push(`${init?.method??'GET'}:${url.pathname}`);
  const name=url.pathname.split('/').at(-1);
  if(url.pathname==='/auth/v1/user')return Promise.resolve(json({id:user,aud:'authenticated',role:'authenticated'}));
  if(name==='profiles')return Promise.resolve(json({company_id:company,is_active:true}));
  if(name==='company_has_module')return Promise.resolve(json(moduleAllowed));
  if(name==='fiscal_user_can_emit_goods')return Promise.resolve(json(issuerAllowed));
  if(name==='fiscal_goods_user_can_access_source')return Promise.resolve(json(sourceAllowed));
  if(name==='fiscal_goods_sale_ready')return Promise.resolve(json(true));
  if(name==='can_access_stock')return Promise.resolve(json(true));
  if(name==='stocks')return Promise.resolve(json({id:stock}));
  if(name==='company_nfce_settings')return Promise.resolve(json({uf:'RJ',series:1,enabled:true,homologation_approved:true,production_approved:true,...(completeMode?{qr_base_url_homologation:'https://sefaz.example.gov.br/qrcode',access_url_homologation:'https://sefaz.example.gov.br/consulta'}:{})}));
  if(name==='company_nfe_settings')return Promise.resolve(json({enabled:true,homologation_approved:nfeHomologationApproved,production_approved:nfeProductionApproved,default_operation_nature:'VENDA DE MERCADORIA'}));
  if(name==='nfe_series')return Promise.resolve(json(seriesAllowed?{id:seriesId,direction:seriesDirection,active:seriesActive}:null));
  if(name==='fiscal_goods_carriers')return Promise.resolve(json(carrierAllowed?{id:carrierId,active:carrierActive}:null));
  if(name==='nfce_documents'||name==='nfe_documents'){
    if(init?.method==='POST'){
      const inserted=JSON.parse(String(init.body));documentWrites.push(inserted);Object.assign(rowExtra,inserted);
    }
    if(init?.method==='PATCH'){
      const patch=JSON.parse(String(init.body));patches.push(patch);
      documentWrites.push(patch);
      if (patch.status==='preparing' && !('snapshot' in patch)) { claimCompared=url.searchParams.has('draft_payload'); if(faultStage==='concurrent')return Promise.resolve(json(null)); }
      if(patch.status==='transmitting'){transmitCompared=url.searchParams.get('status')==='eq.signed'&&url.searchParams.get('operation_id')===`eq.${doc}`;if(faultStage==='resume_concurrent')return Promise.resolve(json(null));}
      const fail=(faultStage==='snapshot'&&'snapshot' in patch)||(faultStage==='signed'&&patch.status==='signed')||(['official','consult'].includes(faultStage)&&patch.status==='authorized');
      if(fail)return Promise.resolve(new Response(JSON.stringify({code:'fault_injected',message:'FICTITIOUS_WRITE_FAILURE'}),{status:500,headers:{'content-type':'application/json'}}));
      // Emula o UPDATE atômico PostgREST: filtros são avaliados no registro atual.
      const current={id:doc,company_id:company,operation_id:doc,status:completeMode?storedStatus:existingStatus,updated_at:new Date(Date.UTC(2026,0,1)+rowVersion).toISOString(),...rowExtra};
      for(const [column,filter]of url.searchParams){
        if(filter.startsWith('eq.') && column in current && String(current[column as keyof typeof current])!==filter.slice(3)){
          if(column==='draft_payload' && JSON.stringify(current[column as keyof typeof current])===filter.slice(3))continue;
          return Promise.resolve(json(null));
        }
        if(filter==='is.null' && current[column as keyof typeof current]!=null)return Promise.resolve(json(null));
      }
      storedStatus=String(patch.status??storedStatus);Object.assign(rowExtra,patch,{updated_at:new Date(Date.UTC(2026,0,1)+(++rowVersion)).toISOString()});
    }
    const model=name==='nfe_documents'?55:65;
    return Promise.resolve(json({id:doc,company_id:company,status:completeMode?storedStatus:existingStatus,source_type:'manual',source_id:null,operation_id:doc,updated_at:new Date(Date.UTC(2026,0,1)+rowVersion).toISOString(),series:1,...(completeMode&&existingStatus!=='draft'?{access_key:'0'.repeat(44),protocol:'1'.repeat(15),uf:'RJ',signed_xml_path:`${company}/${model}/${doc}/assinado.xml`}:{}),...rowExtra}));
  }
  if(name==='nfce_events'||name==='nfe_events'||name==='fiscal_certificate_audit'){
    if((name==='nfce_events'||name==='nfe_events')&&faultStage==='event')return Promise.resolve(new Response(JSON.stringify({code:'fault_injected'}),{status:500,headers:{'content-type':'application/json'}}));
    return Promise.resolve(json({id:doc}));
  }
  if(name==='reserve_goods_fiscal_number'){reservationArgs=JSON.parse(String(init?.body));return Promise.resolve(json([{series:1,number:12}]));}
  if(name==='company_fiscal_settings')return Promise.resolve(json({certificado_ref:hasCertificate?'fictitious-reference':null,certificate_expires_at:expiresAt,fiscal_ambiente:environment,...(completeMode?{regime_tributario:'simples_nacional',inscricao_estadual:'12345678',municipio_ibge:'3304557',certificado_dek_envelopada:'fictitious-dek',certificado_senha_cifrada:'fictitious-cipher',certificado_nonce:'fictitious-nonce'}:{})}));
  if(name==='companies')return Promise.resolve(json({cnpj:'00000000000000',state:'RJ',name:'Emitente fictício',address:'Rua fictícia',neighborhood:'Centro',city:'Cidade fictícia',zip_code:'00000000'}));
  if(name==='company_settings')return Promise.resolve(json(null));
  throw new Error(`Rota local inesperada: ${url.pathname}`);
 }) as typeof fetch;
}
const request=(body:unknown, auth=true) => new Request('https://edge.example.invalid/fiscal-goods-document',{method:'POST',headers:{'content-type':'application/json',...(auth?{authorization:'Bearer fictitious-session'}:{})},body:JSON.stringify(body)});
const draft={model:65,direction:'saida',sourceType:'manual',stockId:stock,nature:'VENDA A CONSUMIDOR',party:null,items:[],payments:[],freightMode:9,notes:''};
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
const completeNfeDraft={
 ...completeDraft,
 model:55,
 nature:'VENDA DE MERCADORIA',
 seriesId,
 carrierId,
 scenarioId,
 freightMode:0,
 party:{
  name:'Destinatário fictício',document:'00000000000000',address:'Rua fictícia',addressNumber:'100',
  neighborhood:'Centro',city:'Cidade fictícia',state:'RJ',zipCode:'00000000',municipalityCode:'3304557',
 },
};

Deno.test('rascunho de NF-e preserva série e transportadora, sem aplicar cenário automaticamente',async()=>{
 setup();try{
  const response=await handler(request({action:'save_draft',draft:completeNfeDraft}));
  assertEquals(response.status,200);
  const inserted=documentWrites.find(write=>'draft_payload' in write);
  const persisted=(inserted?.draft_payload??{}) as Record<string,unknown>;
  assertEquals(persisted.seriesId,seriesId);assertEquals(persisted.carrierId,carrierId);
  assert(!('scenarioId' in persisted));assert(!paths.some(path=>path.includes('reserve_goods_fiscal_number')||path.startsWith('MOTOR:')));
 }finally{globalThis.fetch=originalFetch;}
});

Deno.test('rascunho preserva o ambiente escolhido e a coluna fiscal correspondente',async()=>{
 setup();try{
  const response=await handler(request({action:'save_draft',draft:{...completeNfeDraft,environment:'producao'}}));
  assertEquals(response.status,200);
  const inserted=documentWrites.find(write=>'draft_payload' in write)!;
  assertEquals((inserted.draft_payload as Record<string,unknown>).environment,'producao');
  assertEquals(inserted.environment,1);
 }finally{globalThis.fetch=originalFetch;}
});

for(const variant of ['cross_tenant','inactive','wrong_direction'])Deno.test(`NF-e rejeita série ${variant}`,async()=>{
 setup();if(variant==='cross_tenant')seriesAllowed=false;if(variant==='inactive')seriesActive=false;if(variant==='wrong_direction')seriesDirection='entrada';
 try{
  const response=await handler(request({action:'save_draft',draft:completeNfeDraft}));
  assertEquals(response.status,403);assertEquals((await response.json()).error,'series_forbidden');
  assert(!paths.some(path=>path.includes('nfe_documents')||path.includes('reserve_goods_fiscal_number')||path.startsWith('MOTOR:')));
 }finally{globalThis.fetch=originalFetch;}
});

for(const variant of ['cross_tenant','inactive'])Deno.test(`NF-e rejeita transportadora ${variant}`,async()=>{
 setup();if(variant==='cross_tenant')carrierAllowed=false;if(variant==='inactive')carrierActive=false;
 try{
  const response=await handler(request({action:'save_draft',draft:completeNfeDraft}));
  assertEquals(response.status,403);assertEquals((await response.json()).error,'carrier_forbidden');
  assert(!paths.some(path=>path.includes('nfe_documents')||path.includes('reserve_goods_fiscal_number')||path.startsWith('MOTOR:')));
 }finally{globalThis.fetch=originalFetch;}
});

Deno.test('NF-e reserva a série escolhida e não envia catálogo local de transportadora ou cenário ao motor',async()=>{
 setup();completeMode=true;hasCertificate=true;try{
  const response=await handler(request({action:'emit',draft:completeNfeDraft}));
  assertEquals(response.status,201);
  assertEquals(reservationArgs,{p_company_id:company,p_model:55,p_series_id:seriesId,p_direction:'saida'});
  assert(paths.includes('MOTOR:/v1/nfe/preparar'));assert(paths.includes('MOTOR:/v1/nfe/autorizar'));
  const serialized=JSON.stringify(motorBodies);
  assert(!serialized.includes(carrierId));assert(!serialized.includes(scenarioId));
 }finally{globalThis.fetch=originalFetch;}
});

Deno.test('NF-e usa homologação escolhida na nota mesmo quando o ambiente global está em produção',async()=>{
 setup();completeMode=true;hasCertificate=true;environment='producao';try{
  const response=await handler(request({action:'emit',draft:{...completeNfeDraft,environment:'homologacao'}}));
  assertEquals(response.status,201);
  const prepare=motorBodies.find(body=>'documento' in body) as {documento?:{invoice?:{environment?:string}}}|undefined;
  assertEquals(prepare?.documento?.invoice?.environment,'homologacao');
  assert(patches.some(patch=>patch.environment===2 && (patch.draft_payload as Record<string,unknown>)?.environment==='homologacao'));
 }finally{globalThis.fetch=originalFetch;}
});

Deno.test('NF-e bloqueia produção escolhida na nota sem aprovação, antes de reservar número',async()=>{
 setup();completeMode=true;hasCertificate=true;environment='homologacao';try{
  const response=await handler(request({action:'emit',draft:{...completeNfeDraft,environment:'producao'}}));
  assertEquals(response.status,422);
  assertEquals((await response.json()).error,'production_not_approved');
  assert(!paths.some(path=>path.includes('reserve_goods_fiscal_number')||path.startsWith('MOTOR:')));
 }finally{globalThis.fetch=originalFetch;}
});

Deno.test('NFC-e ignora série e transportadora de NF-e e continua usando configuração própria',()=>{
 const normalized=edgeModule.normalizeDraft({...completeDraft,seriesId,carrierId,scenarioId});
 assertEquals(normalized.model,65);assertEquals(normalized.seriesId,null);assertEquals(normalized.carrierId,null);assert(!('scenarioId' in normalized));
});

for(const stage of ['snapshot','signed'])Deno.test(`falha de persistência ${stage} impede autorização no motor`,async()=>{setup();completeMode=true;hasCertificate=true;faultStage=stage;try{const r=await handler(request({action:'emit',draft:completeDraft}));assertEquals(r.status,503);assertEquals((await r.json()).error,'persistence_failed');assert(!paths.includes('MOTOR:/v1/nfce/autorizar'));if(stage==='snapshot')assert(!paths.includes('MOTOR:/v1/nfce/preparar'));}finally{globalThis.fetch=originalFetch;}});
Deno.test('falha ao persistir resposta oficial não devolve sucesso e preserva consulta do mesmo documento',async()=>{setup();completeMode=true;hasCertificate=true;faultStage='official';try{const r=await handler(request({action:'emit',draft:completeDraft}));assertEquals(r.status,503);assertEquals((await r.json()).error,'persistence_failed');assert(paths.includes('MOTOR:/v1/nfce/autorizar'));assertEquals(storedStatus,'uncertain');assert(patches.some(p=>p.status==='signed'&&p.access_key));}finally{globalThis.fetch=originalFetch;}});
Deno.test('falha de evento não rebaixa autorização já persistida nem devolve sucesso',async()=>{setup();completeMode=true;hasCertificate=true;faultStage='event';try{const r=await handler(request({action:'emit',draft:completeDraft}));assertEquals(r.status,503);assertEquals((await r.json()).error,'persistence_failed');assertEquals(storedStatus,'authorized');}finally{globalThis.fetch=originalFetch;}});
Deno.test('consulta não devolve sucesso se confirmação não for persistida',async()=>{setup();completeMode=true;hasCertificate=true;existingStatus='uncertain';storedStatus='uncertain';faultStage='consult';try{const r=await handler(request({model:65,documentId:doc,action:'consult'}));assertEquals(r.status,503);assertEquals((await r.json()).error,'persistence_failed');assertEquals(storedStatus,'uncertain');}finally{globalThis.fetch=originalFetch;}});

Deno.test('prontidão fiscal confirma cadastro completo sem expor certificado e sem criar documento',async()=>{setup();completeMode=true;hasCertificate=true;try{const response=await handler(request({action:'readiness',model:65}));assertEquals(response.status,200);const body=await response.json();assertEquals(body.ready,true);assertEquals(body.issues,[]);assert(!JSON.stringify(body).includes('fictitious-reference'));assert(!paths.some(p=>p.includes('nfce_documents')||p.startsWith('MOTOR:')||p.startsWith('PATCH:')));}finally{globalThis.fetch=originalFetch;}});
Deno.test('prontidão fiscal informa certificado/configuração sem transmitir',async()=>{setup();try{const response=await handler(request({action:'readiness',model:65}));const body=await response.json();assertEquals(response.status,200);assertEquals(body.ready,false);assert(body.issues.some((i:{code:string})=>i.code==='certificate_required'));assert(body.issues.some((i:{code:string})=>i.code==='issuer_incomplete'));assert(!paths.some(p=>p.includes('nfce_documents')||p.startsWith('MOTOR:')));}finally{globalThis.fetch=originalFetch;}});
Deno.test('edição concorrente exige reabrir e não reserva número nem transmite',async()=>{setup();completeMode=true;hasCertificate=true;faultStage='concurrent';try{const response=await handler(request({action:'emit',draft:completeDraft}));assertEquals(response.status,409);assertEquals((await response.json()).error,'draft_changed');assert(claimCompared);assert(!paths.some(p=>p.includes('reserve_goods_fiscal_number')||p.startsWith('MOTOR:')));}finally{globalThis.fetch=originalFetch;}});

Deno.test('revisão local preserva número e cria nova operação somente antes do envio',async()=>{setup();existingStatus='rejected';rowExtra={number:12,updated_at:'2026-01-01T00:00:00Z'};try{const response=await handler(request({model:65,documentId:doc,action:'revise'}));assertEquals(response.status,200);assertEquals((await response.json()).status,'draft');const revised=patches.find(p=>p.status==='draft')!;assert(revised.operation_id!==doc);assert(!('number' in revised));assert(!paths.some(p=>p.startsWith('MOTOR:')||p.includes('reserve_goods_fiscal_number')));}finally{globalThis.fetch=originalFetch;}});
for(const state of ['uncertain','transmitting','authorized','cancellation_pending'])Deno.test(`não reabre a situação ${state} como rascunho`,async()=>{setup();existingStatus=state;try{const response=await handler(request({model:65,documentId:doc,action:'revise'}));assertEquals(response.status,409);assert(!paths.some(p=>p.startsWith('PATCH:')||p.startsWith('MOTOR:')));}finally{globalThis.fetch=originalFetch;}});
Deno.test('preparação recente não reabre enquanto outra execução pode estar ativa',async()=>{setup();existingStatus='preparing';rowExtra={updated_at:new Date().toISOString()};try{const response=await handler(request({model:65,documentId:doc,action:'revise'}));assertEquals(response.status,409);assert(!paths.some(p=>p.startsWith('PATCH:')||p.startsWith('MOTOR:')));}finally{globalThis.fetch=originalFetch;}});
Deno.test('preparação antiga sem chave pode voltar à revisão sem transmissão',async()=>{setup();existingStatus='preparing';rowExtra={updated_at:'2020-01-01T00:00:00Z'};try{const response=await handler(request({model:65,documentId:doc,action:'revise'}));assertEquals(response.status,200);assert(!paths.some(p=>p.startsWith('MOTOR:')));}finally{globalThis.fetch=originalFetch;}});
for(const status of ['uncertain','transmitting','authorized'])Deno.test(`retomada nunca reenvia documento ${status}`,async()=>{setup();existingStatus=status;try{const response=await handler(request({model:65,documentId:doc,action:'resume'}));assertEquals(response.status,409);assert(!paths.some(p=>p.startsWith('MOTOR:')||p.startsWith('PATCH:')));}finally{globalThis.fetch=originalFetch;}});
async function setupSigned(){setup();completeMode=true;hasCertificate=true;existingStatus='signed';storedStatus='signed';const frozen={test:'frozen'};const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(frozen))))].map(n=>n.toString(16).padStart(2,'0')).join('');rowExtra={number:12,environment:2,snapshot:frozen,snapshot_hash:hash,draft_payload:{...completeDraft,environment:'homologacao'}};}
Deno.test('retoma somente XML assinado persistido com a mesma operação e sem novo número',async()=>{await setupSigned();try{const response=await handler(request({model:65,documentId:doc,action:'resume'}));assertEquals(response.status,201);assert(transmitCompared);assert(paths.includes('MOTOR:/v1/nfce/autorizar'));assert(!paths.includes('MOTOR:/v1/nfce/preparar'));assert(!paths.some(p=>p.includes('reserve_goods_fiscal_number')));}finally{globalThis.fetch=originalFetch;}});
Deno.test('dupla retomada perde claim e não chama autorização novamente',async()=>{await setupSigned();faultStage='resume_concurrent';try{const response=await handler(request({model:65,documentId:doc,action:'resume'}));assertEquals(response.status,409);assertEquals((await response.json()).error,'document_changed');assert(transmitCompared);assert(!paths.includes('MOTOR:/v1/nfce/autorizar'));}finally{globalThis.fetch=originalFetch;}});
Deno.test('snapshot corrompido ou ambiente alterado não é reenviado',async()=>{for(const patch of [{snapshot_hash:'0'.repeat(64)},{environment:1}]){await setupSigned();Object.assign(rowExtra,patch);try{const response=await handler(request({model:65,documentId:doc,action:'resume'}));assertEquals(response.status,409);assert(!paths.includes('MOTOR:/v1/nfce/autorizar'));}finally{globalThis.fetch=originalFetch;}}});

Deno.test('resposta preparada de outra empresa não é guardada nem transmitida',async()=>{setup();completeMode=true;hasCertificate=true;faultStage='wrong_tenant';try{const response=await handler(request({action:'emit',draft:completeDraft}));assertEquals(response.status,502);assertEquals((await response.json()).error,'motor_response_mismatch');assert(!paths.includes('MOTOR:/v1/nfce/autorizar'));assert(!patches.some(p=>p.status==='signed'));}finally{globalThis.fetch=originalFetch;}});

Deno.test('artefato de caminho externo à empresa não ganha URL assinada',async()=>{setup();existingStatus='authorized';rowExtra={processed_xml_path:`other-company/65/${doc}/processado.xml`};try{const response=await handler(request({model:65,documentId:doc,action:'artifact',kind:'xml'}));assertEquals(response.status,404);assertEquals((await response.json()).error,'artifact_not_found');}finally{globalThis.fetch=originalFetch;}});
Deno.test('tipo inesperado não é convertido silenciosamente em PDF',async()=>{setup();try{const response=await handler(request({model:65,documentId:doc,action:'artifact',kind:'other'}));assertEquals(response.status,400);}finally{globalThis.fetch=originalFetch;}});

Deno.test('consultar documento apenas assinado não o transforma em incerto nem inicia envio',async()=>{await setupSigned();try{const response=await handler(request({model:65,documentId:doc,action:'consult'}));assertEquals(response.status,200);const result=await response.json();assertEquals(result.status,'signed');assertEquals(result.notTransmitted,true);assert(!paths.some(p=>p.startsWith('MOTOR:')||p.startsWith('PATCH:')));}finally{globalThis.fetch=originalFetch;}});

function gate(){let resolve!:(value?:unknown)=>void;const promise=new Promise<unknown>(r=>{resolve=r;});return{promise,resolve};}
const authorizedResult={outcome:'authorized',situacaoOficial:'autorizada',resposta:{cstat:'100'},prova:{protocol:'1'.repeat(15)}};
const cancelledResult={outcome:'cancelled',situacaoOficial:'cancelada',resposta:{cstat:'135'}};
function routeUrl(input:RequestInfo|URL){return new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url);}
Deno.test('autorização atrasada não sobrescreve cancelamento confirmado em paralelo',async()=>{
 await setupSigned();const baseFetch=globalThis.fetch;const started=gate(),release=gate();let late:Promise<Response>|undefined;
 globalThis.fetch=(async(input,init)=>{const url=routeUrl(input);if(url.hostname==='engine.example.invalid'&&url.pathname.endsWith('/autorizar')){started.resolve();await release.promise;return json(authorizedResult);}if(url.pathname.endsWith('/cancelamento/transmitir'))return json(cancelledResult);return baseFetch(input,init);})as typeof fetch;
 try{
  late=handler(request({model:65,documentId:doc,action:'resume'}));await started.promise;
  assertEquals((await handler(request({model:65,documentId:doc,action:'consult'}))).status,200);
  assertEquals((await handler(request({model:65,documentId:doc,action:'cancel',reason:'Cancelamento fictício para teste'}))).status,200);assertEquals(storedStatus,'cancelled');
  release.resolve();const response=await late;assertEquals(response.status,409);assertEquals(storedStatus,'cancelled');assertEquals((await response.json()).error,'document_changed');
 }finally{release.resolve();if(late)await late;globalThis.fetch=originalFetch;}
});
Deno.test('timeout atrasado não rebaixa autorização recuperada por consulta paralela',async()=>{
 await setupSigned();const baseFetch=globalThis.fetch;const started=gate(),release=gate();let late:Promise<Response>|undefined;
 globalThis.fetch=(async(input,init)=>{const url=routeUrl(input);if(url.hostname==='engine.example.invalid'&&url.pathname.endsWith('/autorizar')){started.resolve();await release.promise;throw new DOMException('Fictitious timeout','AbortError');}return baseFetch(input,init);})as typeof fetch;
 try{
  late=handler(request({model:65,documentId:doc,action:'resume'}));await started.promise;
  assertEquals((await handler(request({model:65,documentId:doc,action:'consult'}))).status,200);assertEquals(storedStatus,'authorized');
  release.resolve();const response=await late;assertEquals(response.status,503);assertEquals(storedStatus,'authorized');assertEquals((await response.json()).error,'resultado_incerto');
 }finally{release.resolve();if(late)await late;globalThis.fetch=originalFetch;}
});
Deno.test('consulta atrasada não apaga cancelamento pendente nem permite segunda solicitação',async()=>{
 await setupSigned();storedStatus='authorized';rowExtra.protocol='1'.repeat(15);const baseFetch=globalThis.fetch;
 const consultStarted=gate(),consultRelease=gate(),cancelStarted=gate(),cancelRelease=gate();let consultations=0,cancelPreparations=0;let slow:Promise<Response>|undefined,cancel:Promise<Response>|undefined;
 globalThis.fetch=(async(input,init)=>{const url=routeUrl(input);
  if(url.hostname==='engine.example.invalid'&&url.pathname.endsWith('/consultar')&&++consultations===1){consultStarted.resolve();await consultRelease.promise;return json(authorizedResult);}
  if(url.pathname.endsWith('/cancelamento/preparar'))cancelPreparations++;
  if(url.pathname.endsWith('/cancelamento/transmitir')){cancelStarted.resolve();await cancelRelease.promise;return json(cancelledResult);}
  return baseFetch(input,init);
 })as typeof fetch;
 try{
  slow=handler(request({model:65,documentId:doc,action:'consult'}));await consultStarted.promise;
  cancel=handler(request({model:65,documentId:doc,action:'cancel',reason:'Cancelamento fictício concorrente'}));await cancelStarted.promise;assertEquals(storedStatus,'cancellation_pending');
  consultRelease.resolve();const response=await slow;assertEquals(response.status,409);assertEquals(storedStatus,'cancellation_pending');
  const second=await handler(request({model:65,documentId:doc,action:'cancel',reason:'Não deve solicitar duas vezes'}));assertEquals(second.status,202);assertEquals(cancelPreparations,1);
  cancelRelease.resolve();assertEquals((await cancel).status,200);assertEquals(storedStatus,'cancelled');
 }finally{consultRelease.resolve();cancelRelease.resolve();if(slow)await slow;if(cancel)await cancel;globalThis.fetch=originalFetch;}
});

Deno.test('consulta iniciada durante cancelamento preserva pendência se SEFAZ ainda retorna autorizada',async()=>{
 await setupSigned();storedStatus='cancellation_pending';try{const response=await handler(request({model:65,documentId:doc,action:'consult'}));assertEquals(response.status,202);assertEquals((await response.json()).status,'cancellation_pending');assertEquals(storedStatus,'cancellation_pending');assert(!patches.some(p=>p.status==='authorized'));}finally{globalThis.fetch=originalFetch;}
});
Deno.test('consulta inconclusiva não rebaixa autorização já persistida',async()=>{
 await setupSigned();storedStatus='authorized';const baseFetch=globalThis.fetch;globalThis.fetch=(async(input,init)=>routeUrl(input).pathname.endsWith('/consultar')?json({outcome:'uncertain',situacaoOficial:'aguardando_confirmacao'}):baseFetch(input,init))as typeof fetch;
 try{const response=await handler(request({model:65,documentId:doc,action:'consult'}));assertEquals(response.status,202);assertEquals((await response.json()).status,'authorized');assertEquals(storedStatus,'authorized');assertEquals(patches.length,0);}finally{globalThis.fetch=originalFetch;}
});
Deno.test('consulta inconclusiva não rebaixa rejeição já persistida',async()=>{
 await setupSigned();storedStatus='rejected';const baseFetch=globalThis.fetch;globalThis.fetch=(async(input,init)=>routeUrl(input).pathname.endsWith('/consultar')?json({outcome:'uncertain',situacaoOficial:'nao_localizada'}):baseFetch(input,init))as typeof fetch;
 try{const response=await handler(request({model:65,documentId:doc,action:'consult'}));assertEquals(response.status,202);assertEquals((await response.json()).status,'rejected');assertEquals(storedStatus,'rejected');assertEquals(patches.length,0);}finally{globalThis.fetch=originalFetch;}
});

// Número já usado em outro emissor (cStat 539): rejeição definitiva, nunca "consultando" eterno.
function collisionFetch(consult:unknown,priorCstat:string|null,attemptedAt:string|null=null){const baseFetch=globalThis.fetch;globalThis.fetch=(async(input,init)=>{const url=routeUrl(input);
 if(url.hostname==='engine.example.invalid'&&url.pathname.endsWith('/autorizar')){paths.push(`MOTOR:${url.pathname}`);return json({outcome:'uncertain',recovered:false,resposta:{cstat:'539'}});}
 if(url.hostname==='engine.example.invalid'&&url.pathname.endsWith('/consultar')){paths.push(`MOTOR:${url.pathname}`);return consult===null?new Response('{}',{status:503}):json(consult);}
 if(url.pathname.endsWith('_events')&&(init?.method??'GET')==='GET')return json(priorCstat||attemptedAt?{cstat:priorCstat,created_at:attemptedAt??new Date().toISOString()}:null);
 return baseFetch(input,init);})as typeof fetch;}
const keyNotFound={situacaoOficial:'nao_localizada',resposta:{cstat:'217'}};
Deno.test('número já usado em outra nota (539) vira rejeição definitiva quando a chave não existe na SEFAZ',async()=>{
 await setupSigned();collisionFetch(keyNotFound,null);
 try{const response=await handler(request({model:65,documentId:doc,action:'resume'}));assertEquals(response.status,202);const result=await response.json();assertEquals(result.status,'rejected');assertEquals(result.rejectionCode,'sefaz_539');assertEquals(storedStatus,'rejected');assert(patches.some(p=>p.status==='rejected'&&p.last_error_code==='sefaz_539'&&p.next_action===null));assert(paths.includes('MOTOR:/v1/nfce/consultar'));}finally{globalThis.fetch=originalFetch;}
});
Deno.test('539 sem confirmação da consulta mantém a nota incerta, sem concluir rejeição',async()=>{
 for(const consult of [null,{outcome:'uncertain',situacaoOficial:'aguardando_confirmacao'}]){await setupSigned();collisionFetch(consult,null);
  try{const response=await handler(request({model:65,documentId:doc,action:'resume'}));assertEquals(response.status,202);assertEquals((await response.json()).status,'uncertain');assertEquals(storedStatus,'uncertain');assert(!patches.some(p=>p.status==='rejected'));}finally{globalThis.fetch=originalFetch;}}
});
Deno.test('consulta conclui a rejeição da nota incerta cujo envio foi recusado por número já usado',async()=>{
 await setupSigned();storedStatus='uncertain';collisionFetch(keyNotFound,'539');
 try{const response=await handler(request({model:65,documentId:doc,action:'consult'}));assertEquals(response.status,200);assertEquals((await response.json()).status,'rejected');assertEquals(storedStatus,'rejected');assert(patches.some(p=>p.last_error_code==='sefaz_539'&&typeof p.last_error_message==='string'&&p.last_error_message.includes('número')));}finally{globalThis.fetch=originalFetch;}
});
Deno.test('chave não localizada sem recusa por numeração continua incerta',async()=>{
 await setupSigned();storedStatus='uncertain';collisionFetch(keyNotFound,null);
 try{const response=await handler(request({model:65,documentId:doc,action:'consult'}));assertEquals(response.status,200);assertEquals((await response.json()).status,'uncertain');assertEquals(storedStatus,'uncertain');assert(!patches.some(p=>p.status==='rejected'));}finally{globalThis.fetch=originalFetch;}
});

// Logomarca do emitente no DANFE: só o arquivo da própria empresa no bucket de logos, PNG ou JPEG.
function logoFetch(logoUrl:string,bytes:Uint8Array){const baseFetch=globalThis.fetch;globalThis.fetch=(async(input,init)=>{const url=routeUrl(input);
 if(url.pathname.endsWith('/company_settings')&&url.searchParams.get('select')==='logo_url')return json({logo_url:logoUrl});
 if(url.pathname.startsWith('/storage/v1/object/company-logos/'))return new Response(bytes,{status:200,headers:{'content-type':'image/png'}});
 return baseFetch(input,init);})as typeof fetch;}
const pngBytes=new Uint8Array([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,1,2,3,4]);
const ownLogo='https://backend.example.invalid/storage/v1/object/public/company-logos/logo_1.png';
Deno.test('consulta de NF-e envia a logomarca da empresa ao motor para o DANFE',async()=>{
 await setupSigned();storedStatus='authorized';logoFetch(ownLogo,pngBytes);
 try{const response=await handler(request({model:55,documentId:doc,action:'consult'}));assertEquals(response.status,200);const sent=motorBodies.at(-1)!;assertEquals(sent.logoBase64,btoa(String.fromCharCode(...pngBytes)));}finally{globalThis.fetch=originalFetch;}
});
Deno.test('logomarca fora do bucket da plataforma ou em formato não aceito não é enviada',async()=>{
 for(const [logoUrl,bytes] of [['https://attacker.example.invalid/storage/v1/object/public/company-logos/logo_1.png',pngBytes],[ownLogo,new TextEncoder().encode('<svg onload="x"/>')],['',pngBytes]] as [string,Uint8Array][]){
  await setupSigned();storedStatus='authorized';logoFetch(logoUrl,bytes);
  try{const response=await handler(request({model:55,documentId:doc,action:'consult'}));assertEquals(response.status,200);assert(!('logoBase64' in motorBodies.at(-1)!));}finally{globalThis.fetch=originalFetch;}}
});
Deno.test('NFC-e não envia logomarca',async()=>{
 await setupSigned();storedStatus='authorized';logoFetch(ownLogo,pngBytes);
 try{const response=await handler(request({model:65,documentId:doc,action:'consult'}));assertEquals(response.status,200);assert(!('logoBase64' in motorBodies.at(-1)!));}finally{globalThis.fetch=originalFetch;}
});

// Envio que nunca chegou à SEFAZ: a nota volta a "assinada" e o MESMO XML pode ser retransmitido.
Deno.test('nota que a SEFAZ não recebeu volta a assinada, sem transmitir nada na consulta',async()=>{
 await setupSigned();storedStatus='uncertain';collisionFetch(keyNotFound,null,new Date(Date.now()-10*60_000).toISOString());
 try{const response=await handler(request({model:65,documentId:doc,action:'consult'}));assertEquals(response.status,200);const result=await response.json();assertEquals(result.status,'signed');assertEquals(result.notTransmitted,true);assertEquals(storedStatus,'signed');assert(patches.some(p=>p.status==='signed'&&p.official_status==='nao_localizada'));assert(!paths.includes('MOTOR:/v1/nfce/autorizar'));assert(!paths.some(p=>p.includes('reserve_goods_fiscal_number')));}finally{globalThis.fetch=originalFetch;}
});
Deno.test('envio recente ainda não localizado continua incerto durante a carência',async()=>{
 await setupSigned();storedStatus='uncertain';collisionFetch(keyNotFound,null,new Date(Date.now()-20_000).toISOString());
 try{const response=await handler(request({model:65,documentId:doc,action:'consult'}));assertEquals(response.status,200);assertEquals((await response.json()).status,'uncertain');assertEquals(storedStatus,'uncertain');assert(!patches.some(p=>p.status==='signed'));}finally{globalThis.fetch=originalFetch;}
});
Deno.test('depois de voltar a assinada, a retomada reenvia o mesmo documento sem novo número',async()=>{
 await setupSigned();storedStatus='uncertain';const base=globalThis.fetch;collisionFetch(keyNotFound,null,new Date(Date.now()-10*60_000).toISOString());
 try{assertEquals((await (await handler(request({model:65,documentId:doc,action:'consult'}))).json()).status,'signed');
  globalThis.fetch=base;paths.length=0;
  const response=await handler(request({model:65,documentId:doc,action:'resume'}));assertEquals(response.status,201);assertEquals((await response.json()).status,'authorized');assert(paths.includes('MOTOR:/v1/nfce/autorizar'));assert(!paths.includes('MOTOR:/v1/nfce/preparar'));assert(!paths.some(p=>p.includes('reserve_goods_fiscal_number')));}finally{globalThis.fetch=originalFetch;}
});

Deno.test('consulta com status igual também exige a revisão updated_at capturada',async()=>{
 await setupSigned();storedStatus='authorized';const baseFetch=globalThis.fetch;const started=gate(),release=gate();let calls=0,slow:Promise<Response>|undefined;
 globalThis.fetch=(async(input,init)=>{const url=routeUrl(input);if(url.hostname==='engine.example.invalid'&&url.pathname.endsWith('/consultar')&&++calls===1){started.resolve();await release.promise;return json(authorizedResult);}return baseFetch(input,init);})as typeof fetch;
 try{slow=handler(request({model:65,documentId:doc,action:'consult'}));await started.promise;assertEquals((await handler(request({model:65,documentId:doc,action:'consult'}))).status,200);const version=rowVersion;release.resolve();assertEquals((await slow).status,409);assertEquals(storedStatus,'authorized');assertEquals(rowVersion,version);}finally{release.resolve();if(slow)await slow;globalThis.fetch=originalFetch;}
});

Deno.test('cancelada já conhecida é final mesmo com resposta fiscal antiga disponível',async()=>{
 for(const official of [authorizedResult,{outcome:'uncertain',situacaoOficial:'aguardando_confirmacao'}]){
  await setupSigned();storedStatus='cancelled';rowExtra.cancelled_at='2026-01-01T00:00:00Z';rowExtra.protocol='1'.repeat(15);const baseFetch=globalThis.fetch;let motorCalls=0;
  globalThis.fetch=(async(input,init)=>{const url=routeUrl(input);if(url.hostname==='engine.example.invalid'){motorCalls++;return json(official);}return baseFetch(input,init);})as typeof fetch;
  try{const response=await handler(request({model:65,documentId:doc,action:'consult'}));assertEquals(response.status,200);assertEquals((await response.json()).status,'cancelled');assertEquals(storedStatus,'cancelled');assertEquals(motorCalls,0);assertEquals(patches.length,0);assertEquals(storedArtifacts.size,0);}finally{globalThis.fetch=originalFetch;}
 }
});
Deno.test('resposta antiga não substitui XML/PDF da revisão atual mesmo quando o CAS nega a escrita',async()=>{
 await setupSigned();storedStatus='authorized';const baseFetch=globalThis.fetch;const started=gate(),release=gate();let calls=0,slow:Promise<Response>|undefined;
 const newXml='<nfeProc>FICTITIOUS-NEW-VERIFIED-PROOF</nfeProc>';const newPdf='%PDF-FICTITIOUS-NEW-VERIFIED';
 const oldXml='<nfeProc>FICTITIOUS-OLD-PROOF</nfeProc>';const oldPdf='%PDF-FICTITIOUS-OLD';
 globalThis.fetch=(async(input,init)=>{const url=routeUrl(input);if(url.hostname==='engine.example.invalid'&&url.pathname.endsWith('/consultar')){if(++calls===1){started.resolve();await release.promise;return json({...authorizedResult,xmlProcessado:oldXml,danfceBase64:btoa(oldPdf)});}return json({...authorizedResult,xmlProcessado:newXml,danfceBase64:btoa(newPdf)});}return baseFetch(input,init);})as typeof fetch;
 try{
  slow=handler(request({model:65,documentId:doc,action:'consult'}));await started.promise;
  assertEquals((await handler(request({model:65,documentId:doc,action:'consult'}))).status,200);
  const xmlPath=String(rowExtra.processed_xml_path),pdfPath=String(rowExtra.danfce_pdf_path);
  assertEquals(storedArtifacts.get(xmlPath),newXml);assertEquals(storedArtifacts.get(pdfPath),newPdf);
  release.resolve();assertEquals((await slow).status,409);assertEquals(rowExtra.processed_xml_path,xmlPath);assertEquals(rowExtra.danfce_pdf_path,pdfPath);
  assertEquals(storedArtifacts.get(xmlPath),newXml);assertEquals(storedArtifacts.get(pdfPath),newPdf);
  assert([...storedArtifacts.values()].includes(oldXml));assert([...storedArtifacts.values()].includes(oldPdf));
 }finally{release.resolve();if(slow)await slow;globalThis.fetch=originalFetch;}
});

Deno.test('artefatos versionados continuam acessíveis somente pelo prefixo autorizado da nota',async()=>{
 await setupSigned();storedStatus='authorized';const baseFetch=globalThis.fetch;
 globalThis.fetch=(async(input,init)=>{const url=routeUrl(input);if(url.pathname.startsWith('/storage/v1/object/sign/fiscal-artifacts/'))return json({signedURL:url.pathname.replace('/storage/v1','')+'?token=fictitious-test-only'});return baseFetch(input,init);})as typeof fetch;
 try{
  assertEquals((await handler(request({model:65,documentId:doc,action:'consult'}))).status,200);
  for(const kind of ['xml','pdf']){
   const response=await handler(request({model:65,documentId:doc,action:'artifact',kind}));assertEquals(response.status,200);
   const result=await response.json();assert(String(result.url).includes(`${company}/65/${doc}/artifacts/`));assertEquals(result.expiresIn,300);
  }
 }finally{globalThis.fetch=originalFetch;}
});
