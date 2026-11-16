import {hasServiceDocumentLicense,serviceDocumentRequiredModule} from './service-document-license.ts';
function assert(value:unknown,message='Verificação falhou'):asserts value {if(!value)throw new Error(message);}
Deno.test('relatório comum de OS usa Serviços; certificados e documentos contratuais usam Contratos',()=>{
 assert(serviceDocumentRequiredModule('relatorio_servico')==='service_operations');
 for(const type of ['certificado_conformidade','contract_document','tipo-desconhecido'])assert(serviceDocumentRequiredModule(type)==='contracts');
});
Deno.test('checagem usa módulo canônico e vigência no servidor, incluindo ambas as formas de documento',async()=>{
 for(const type of ['relatorio_servico','certificado_conformidade']){
  const calls:{name:string;params:Record<string,unknown>}[]=[];
  const client={rpc:async(name:string,params:Record<string,unknown>)=>{calls.push({name,params});return{data:true,error:null};}};
  assert(await hasServiceDocumentLicense(client,'empresa-ficticia',type));
  assert(calls.length===2);assert(calls[0].params.p_module_code===serviceDocumentRequiredModule(type));assert(calls[1].params._company_id==='empresa-ficticia');
 }
});
Deno.test('licença ausente, assinatura inativa, erro e indisponibilidade falham fechado',async()=>{
 for(const denied of ['company_has_module','tenant_subscription_allows_access']){
  for(const withError of [false,true]){
   const client={rpc:async(name:string)=>({data:name!==denied,error:name===denied&&withError?{message:'erro interno'}:null})};
   assert(!await hasServiceDocumentLicense(client,'empresa-ficticia','certificado_conformidade'));
  }
 }
 assert(!await hasServiceDocumentLicense({rpc:()=>{throw new Error('indisponível');}},'empresa-ficticia','relatorio_servico'));
});
Deno.test('nenhuma empresa não concede acesso; suporte superadmin mantém exceção explícita existente',async()=>{
 let calls=0;const client={rpc:async()=>{calls++;return{data:false,error:null};}};
 assert(!await hasServiceDocumentLicense(client,'','relatorio_servico'));
 assert(await hasServiceDocumentLicense(client,'empresa-ficticia','certificado_conformidade',true));assert(calls===0);
});
Deno.test('todos os seis geradores verificam licença antes de consultar cache ou gerar arquivo',async()=>{
 for(const name of ['generate-pmoc-certificado-pdf','generate-pmoc-cronograma-pdf','generate-pmoc-dossie-pdf','generate-pmoc-planilha-pdf','generate-pmoc-trt-pdf','generate-os-pmoc-document']){
  const source=await Deno.readTextFile(new URL(`../${name}/index.ts`,import.meta.url));
  const guard=source.indexOf('!await hasServiceDocumentLicense(');
  assert(guard>0,`${name}: licença ausente`);
  const cache=source.indexOf('.from("pmoc_documents")')<0?source.indexOf('.from("service_order_pmoc_documents")'):source.indexOf('.from("pmoc_documents")');
  assert(cache>guard,`${name}: consulta cache antes da licença`);
  assert(source.includes('auth.getUser()'),`${name}: Authorization ausente`);
 }
});

Deno.test('QR, cron e portal também verificam licença antes de publicar ou gerar',async()=>{
 for(const name of ['generate-pmoc-qr-pdf','generate-pmoc-orders','pmoc-portal-share']){
  const source=await Deno.readTextFile(new URL(`../${name}/index.ts`,import.meta.url));
  assert(source.includes('!await hasServiceDocumentLicense('),`${name}: licença ausente`);
 }
});
Deno.test('geradores contratuais filtram cliente por tenant antes de acessar cache antigo',async()=>{
 for(const name of ['certificado','cronograma','dossie','planilha','trt','qr']){
  const source=await Deno.readTextFile(new URL(`../generate-pmoc-${name}-pdf/index.ts`,import.meta.url));
  const start=source.indexOf('.from("customers")');const end=source.indexOf('.maybeSingle()',start);
  assert(start>0&&source.slice(start,end).includes('.eq("company_id", documentCompanyId)'),`${name}: cliente sem tenant`);
  const cache=source.indexOf('.from("pmoc_documents")');
  if(cache>0)assert(end<cache&&source.indexOf('if (!customer)')<cache,`${name}: cliente só conferido depois do cache`);
  assert(source.includes('if (!customer)'),`${name}: falta rejeitar cliente inválido`);
 }
});
