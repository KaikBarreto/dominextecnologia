import {act,renderHook,waitFor} from '@testing-library/react';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import type {ReactNode} from 'react';
import {beforeEach,describe,expect,it,vi} from 'vitest';
interface Plan {id:string;code:string;name:string;description:null;price:number;max_users:number;included_modules:string[];is_active:boolean}
interface DbResult {data:unknown;error:null|{message:string};count?:number}
const mock=vi.hoisted(()=>({
 userId:'user-a',profile:{user_id:'user-a',company_id:'company-a',is_active:true},superAdmin:false,
 company:{} as Record<string,unknown>,activePlans:[] as Plan[],contract:null as Plan|null,
 pending:null as Promise<DbResult>|null,fail:false,reads:[] as Array<{table:string;filters:Record<string,unknown>}>,
}));
vi.mock('@/contexts/AuthContext',()=>({useAuth:()=>({user:{id:mock.userId},profile:mock.profile,hasRole:()=>mock.superAdmin})}));
class Query {
 private filters:Record<string,unknown>={};
 constructor(private table:string){}
 select(){return this;}eq(key:string,value:unknown){this.filters[key]=value;return this;}
 order(){return this;}maybeSingle(){return this;}
 then<T=DbResult,U=never>(resolve?:((value:DbResult)=>T|PromiseLike<T>)|null,reject?:((reason:unknown)=>U|PromiseLike<U>)|null):Promise<T|U>{
  mock.reads.push({table:this.table,filters:{...this.filters}});
  let result:DbResult|Promise<DbResult>={data:null,error:null};
  if(this.table==='companies')result={data:mock.company.id===this.filters.id?{...mock.company}:null,error:null};
  if(this.table==='company_modules')result={data:[],error:null};
  if(this.table==='profiles')result={data:[],count:2,error:null};
  if(this.table==='subscription_plans'){
   if(this.filters.is_active===true)result={data:mock.activePlans,error:null};
   else result=mock.pending??{data:mock.contract,error:mock.fail?{message:'falha de leitura'}:null};
  }
  return Promise.resolve(result).then(resolve,reject);
 }
}
vi.mock('@/integrations/supabase/client',()=>({supabase:{from:(table:string)=>new Query(table)}}));
import {useCompanyModules} from './useCompanyModules';
function setup(){
 const client=new QueryClient({defaultOptions:{queries:{retry:false,gcTime:0}}});
 const wrapper=({children}:{children:ReactNode})=><QueryClientProvider client={client}>{children}</QueryClientProvider>;
 return{client,wrapper};
}
function plan(code:string,active:boolean,modules=['basic'],maxUsers=2):Plan{return{id:code,code,name:active?'Essencial':'Plano legado contratado',description:null,price:197,max_users:maxUsers,included_modules:modules,is_active:active};}
beforeEach(()=>{
 Object.assign(mock,{userId:'user-a',profile:{user_id:'user-a',company_id:'company-a',is_active:true},superAdmin:false,pending:null,fail:false,reads:[]});
 mock.company={id:'company-a',business_core:'services',business_core_version:2,subscription_status:'active',subscription_expires_at:null,
  subscription_plan:'legado',subscription_value:197,pending_subscription_value:null,max_users:2,extra_users:2,custom_price:null,custom_price_months:null,custom_price_payments_made:null,custom_price_permanent:false};
 mock.activePlans=[plan('start',true)];mock.contract=plan('legado',false,['basic','rh','contracts'],9);
});
describe('contrato atual separado do catálogo vendável',()=>{
 it('preserva nome, módulos e limites do plano inativo sem oferecê-lo à venda',async()=>{
  const {wrapper}=setup();const{result}=renderHook(()=>useCompanyModules(),{wrapper});
  await waitFor(()=>expect(result.current.isLoading).toBe(false));
  expect(result.current.currentPlan?.name).toBe('Plano legado contratado');
  expect(result.current.hasModule('rh')).toBe(true);expect(result.current.hasModule('contracts')).toBe(true);
  expect(result.current.maxUsers).toBe(11);expect(result.current.currentUserCount).toBe(2);
  expect(result.current.allPlans.map(p=>p.code)).toEqual(['start']);
  expect(mock.reads.some(q=>q.table==='subscription_plans'&&q.filters.code==='legado'&&!('is_active'in q.filters))).toBe(true);
 });
 it('reutiliza plano ativo sem consulta privada adicional e mantém catálogo apenas ativo',async()=>{
  mock.company.subscription_plan='start';
  const {wrapper}=setup();const{result}=renderHook(()=>useCompanyModules(),{wrapper});
  await waitFor(()=>expect(result.current.isLoading).toBe(false));
  expect(result.current.currentPlan?.code).toBe('start');expect(result.current.hasModule('rh')).toBe(false);
  expect(mock.reads.some(q=>q.table==='subscription_plans'&&q.filters.code)).toBe(false);
 });
 it('mantém loading até confirmar o contrato e falha fechado quando a leitura falha',async()=>{
  let finish:(value:DbResult)=>void=()=>{};mock.pending=new Promise(resolve=>{finish=resolve;});
  const {wrapper}=setup();const{result}=renderHook(()=>useCompanyModules(),{wrapper});
  await waitFor(()=>expect(mock.reads.some(q=>q.filters.code==='legado')).toBe(true));
  expect(result.current.isLoading).toBe(true);expect(result.current.hasModule('rh')).toBe(false);
  await act(async()=>{finish({data:null,error:{message:'indisponível'}});});
  await waitFor(()=>expect(result.current.isLoading).toBe(false));
  expect(result.current.currentPlan).toBeNull();expect(result.current.hasModule('rh')).toBe(false);
 });
 it('mascara resposta tardia e plano privado ao trocar usuário/perfil',async()=>{
  let finish:(value:DbResult)=>void=()=>{};mock.pending=new Promise(resolve=>{finish=resolve;});
  const {wrapper}=setup();const{result,rerender}=renderHook(()=>useCompanyModules(),{wrapper});
  await waitFor(()=>expect(mock.reads.some(q=>q.filters.code==='legado')).toBe(true));
  mock.userId='user-b';rerender();
  expect(result.current.currentPlan).toBeNull();expect(result.current.hasModule('rh')).toBe(false);
  await act(async()=>{finish({data:mock.contract,error:null});});
  expect(result.current.currentPlan).toBeNull();expect(result.current.allPlans).toEqual([]);
  mock.pending=null;mock.profile={user_id:'user-b',company_id:'company-b',is_active:true};
  mock.company={...mock.company,id:'company-b',subscription_plan:'start'};rerender();
  await waitFor(()=>expect(result.current.isLoading).toBe(false));
  expect(result.current.currentPlan?.code).toBe('start');expect(result.current.hasModule('rh')).toBe(false);
 });
 it('não retorna plano/módulos de cache quando o perfil fica inativo',async()=>{
  const {wrapper}=setup();const{result,rerender}=renderHook(()=>useCompanyModules(),{wrapper});
  await waitFor(()=>expect(result.current.hasModule('rh')).toBe(true));
  mock.profile={...mock.profile,is_active:false};rerender();
  expect(result.current.currentPlan).toBeNull();expect(result.current.hasModule('rh')).toBe(false);
  expect(result.current.hasScreen('screen:dashboard')).toBe(false);
 });
});
