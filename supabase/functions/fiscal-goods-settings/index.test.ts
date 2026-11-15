import { assertEquals, assert } from 'https://deno.land/std@0.224.0/assert/mod.ts';
let handler!: (req: Request) => Promise<Response>;
const originalServe=Deno.serve;
(Deno as unknown as {serve:unknown}).serve=(fn:typeof handler)=>{handler=fn;return {};};
await import('./index.ts');(Deno as unknown as {serve:unknown}).serve=originalServe;
const originalFetch=globalThis.fetch;
Deno.env.set('SUPABASE_URL','https://backend.example.invalid');Deno.env.set('SUPABASE_SERVICE_ROLE_KEY','fictitious-local-key');
let manager=true;let subscription=true;const saved:Record<string,unknown>[]=[];
const json=(v:unknown)=>new Response(JSON.stringify(v),{status:200,headers:{'content-type':'application/json'}});
function setup(){manager=true;subscription=true;saved.length=0;globalThis.fetch=((input:RequestInfo|URL,init?:RequestInit)=>{const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url);assertEquals(url.hostname,'backend.example.invalid');const name=url.pathname.split('/').at(-1);
 if(url.pathname==='/auth/v1/user')return Promise.resolve(json({id:'b6020000-0000-4000-8000-000000000011',aud:'authenticated'}));
 if(name==='profiles')return Promise.resolve(json({company_id:'b6020000-0000-4000-8000-000000000001',is_active:true}));
 if(name==='company_has_module')return Promise.resolve(json(true));
 if(name==='can_manage_system')return Promise.resolve(json(manager));
 if(name==='tenant_subscription_allows_access')return Promise.resolve(json(subscription));
 if(name==='company_nfe_settings'||name==='company_nfce_settings'){saved.push(JSON.parse(String(init?.body)));return Promise.resolve(json({}));}
 throw new Error('Unexpected test route');}) as typeof fetch;}
const request=(body:unknown)=>new Request('https://edge.example.invalid',{method:'POST',headers:{authorization:'Bearer fictitious-session','content-type':'application/json'},body:JSON.stringify(body)});
Deno.test('goods settings nega caixa sem administração',async()=>{setup();manager=false;try{const r=await handler(request({nfce:{}}));assertEquals(r.status,403);assertEquals(saved.length,0);}finally{globalThis.fetch=originalFetch;}});
Deno.test('goods settings falha fechado com assinatura indisponível',async()=>{setup();subscription=false;try{const r=await handler(request({nfce:{}}));assertEquals(r.status,403);assertEquals(saved.length,0);}finally{globalThis.fetch=originalFetch;}});
Deno.test('goods settings nunca libera automático por payload',async()=>{setup();try{const r=await handler(request({nfce:{afterPaymentMode:'automatic',automaticCanaryApproved:true}}));assertEquals(r.status,422);assertEquals(saved.length,0);}finally{globalThis.fetch=originalFetch;}});
Deno.test('goods settings ignora próximo número e todas aprovações no payload do cliente',async()=>{setup();try{const r=await handler(request({nfe:{enabled:true,series:1,nextNumber:999,productionApproved:true,homologationApproved:true},nfce:{enabled:true,uf:'RJ',series:1,afterPaymentMode:'ask',nextNumber:999,productionApproved:true,homologationApproved:true,automaticCanaryApproved:true}}));assertEquals(r.status,200);assertEquals(saved.length,2);const payload=JSON.stringify(saved);assert(!/next_number|production_approved|homologation_approved|automatic_canary_approved/.test(payload));const nfce=saved.flatMap(v=>Array.isArray(v)?v:[v]).find(v=>'after_payment_mode' in v);assertEquals(nfce?.after_payment_mode,'ask');}finally{globalThis.fetch=originalFetch;}});
