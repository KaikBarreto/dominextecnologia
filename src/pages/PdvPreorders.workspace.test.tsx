import { useEffect, useRef, useState, type ComponentProps, type ReactNode } from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PdvPreorderDetail as Detail } from '@/hooks/usePdvPreorders';
import type { PdvPreorderEditorSnapshot } from '@/components/pdv/preorders/PdvPreorderDetail';
import PdvPreorders from './PdvPreorders';

const state = vi.hoisted(() => ({
  companyId: '10000000-0000-4000-8000-000000000001', userId: '20000000-0000-4000-8000-000000000001',
  customerA: '30000000-0000-4000-8000-000000000001', customerB: '30000000-0000-4000-8000-000000000002',
  preorderId: '40000000-0000-4000-8000-000000000001',
  stocks: [] as {id:string;name:string}[], companySettings:{settings:null as null | {company_id:string;pdv_default_stock_id:string|null},isLoading:false,isError:false},
  detail: null as Detail | null, queue: [] as Detail['preorder'][], empty: [],
  save: vi.fn(), value: vi.fn(), cancel: vi.fn(), convert: vi.fn(), forward: vi.fn(), assign: vi.fn(), refetch: vi.fn(), toast: vi.fn(),
}));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user:{id:state.userId}, profile:{company_id:state.companyId}, roles:[],permissions:[],hasPermissionRecord:true,hasPermission:()=>true,hasScreenAccess:()=>true,isAdminOrGestor:()=>true }) }));
vi.mock('@/hooks/pdvReportCache', () => ({usePdvAuthorizedQueryScope:()=>({ready:true})}));
vi.mock('@/hooks/use-mobile', () => ({useIsMobile:()=>false,useIsCompact:()=>false,useMediaBreakpoint:()=>false}));
vi.mock('@/hooks/use-toast', () => ({useToast:()=>({toast:state.toast})}));
vi.mock('@/lib/format/hooks', () => ({useLocaleFormatters:()=>({money:(value:number)=>`R$ ${value.toFixed(2)}`,dateTime:(value:unknown)=>String(value)})}));
vi.mock('@/hooks/useCompanySettings',()=>({useCompanySettings:()=>state.companySettings}));
vi.mock('@/hooks/usePdvPreorderCatalog', () => ({usePdvPreorderCatalog:()=>({data:{customers:[{id:state.customerA,name:'Ana'},{id:state.customerB,name:'Bruno'}],materials:[],stocks:state.stocks,terminals:[]},isLoading:false,isError:false,refetch:state.refetch})}));
vi.mock('@/hooks/usePdvPreorders', () => ({
  usePdvPreorder:(id:string|null)=>({data:id===state.preorderId?state.detail:null,isLoading:false,isError:false,refetch:state.refetch}),
  usePdvPreorderQueue:()=>({data:state.queue,isLoading:false,isError:false,refetch:state.refetch}),
  usePdvPreorderActions:()=>({save:{mutateAsync:state.save,isPending:false},value:{mutateAsync:state.value,isPending:false},cancel:{mutateAsync:state.cancel,isPending:false},convert:{mutateAsync:state.convert,isPending:false},forward:{mutateAsync:state.forward,isPending:false},assignTerminal:{mutateAsync:state.assign,isPending:false}}),
  PdvPreorderDomainError:class extends Error {},
}));
vi.mock('@/hooks/usePdvCounterFlow', () => ({usePdvCounterCapability:()=>({data:{counterEnabled:true,fulfillmentMode:'dispatch'},isLoading:false})}));
vi.mock('@/hooks/usePdvSalesFlow', () => ({usePdvSalesFlow:()=>({data:state.empty,refetch:state.refetch}),usePdvSalesFlowOrder:()=>({data:null,refetch:state.refetch}),resolvePdvSalesFlowMode:()=> 'dispatch'}));
vi.mock('@/hooks/usePdvReturns', () => ({usePdvReturnsFeature:()=>({data:false}),derivePdvReturnsAccess:()=>({enabled:false})}));
vi.mock('@/hooks/usePdvAfterSale', () => ({usePdvAfterSaleFeature:()=>({data:false}),derivePdvAfterSaleAccess:()=>({enabled:false})}));
vi.mock('@/hooks/usePdvStageReceiptAuto', () => ({usePdvStageReceiptAuto:()=>({prepare:vi.fn(()=>({commit:vi.fn(),cancel:vi.fn()}))})}));
vi.mock('@/hooks/usePdvReceiptCompany', () => ({usePdvReceiptCompany:()=>null}));
vi.mock('@/components/pdv/preorders/PdvPreorderReceiptButton', () => ({PdvPreorderReceiptButton:()=>null,usePdvPreorderReceiptOpener:()=>({open:vi.fn(),isCurrent:()=>true,guardAttempt:(value:unknown)=>value})}));
vi.mock('@/components/pdv/dispatch/PdvDispatchDetail', () => ({PdvDispatchDetail:()=>null}));
vi.mock('@/components/pdv/flow/PdvSalesFlowBoard', () => ({PdvSalesFlowBoard:()=>null}));
vi.mock('@/components/layout/PageHeader', () => ({PageHeader:({actions}:{actions:ReactNode})=><header>{actions}</header>}));
vi.mock('@/components/ui/ListDetailLayout', () => ({ListDetailLayout:({items,onSelect,children}:{items:{id:string;title:string}[];onSelect:(id:string)=>void;children:ReactNode})=><section aria-label="Lista de orçamentos">{items.map(item=><button key={item.id} onClick={()=>onSelect(item.id)}>{item.title}</button>)}{children}</section>}));
// O switcher real já cobre teclado, overflow, drag e confirmação. Aqui exercitamos a coordenação do pai.
vi.mock('@/components/pdv/PdvOrderSwitcher', () => ({PdvOrderSwitcher:({orders,activeId,onSelect,onCreate,onDelete,onReorder,disabled}:ComponentProps<typeof import('@/components/pdv/PdvOrderSwitcher')['PdvOrderSwitcher']>)=><nav aria-label="Abas de orçamento"><ol>{orders.map(order=><li key={order.id} data-tab-id={order.id}><button disabled={disabled} aria-pressed={activeId===order.id} onClick={()=>onSelect(order.id)}>{order.customer||'Sem cliente'} {order.code} {order.total}</button><button disabled={disabled} aria-label={`Fechar aba ${order.id}`} onClick={()=>onDelete(order.id)}>Fechar</button></li>)}</ol><button disabled={disabled} onClick={onCreate}>Novo orçamento</button><button disabled={disabled} onClick={()=>onReorder?.([...orders].reverse().map(order=>order.id))}>Inverter abas</button></nav>}));
vi.mock('@/components/pdv/preorders/PdvPreorderDetail', async importOriginal => {
  const actual = await importOriginal<typeof import('@/components/pdv/preorders/PdvPreorderDetail')>();
  return {...actual,PdvPreorderDetail: (props:ComponentProps<typeof actual.PdvPreorderDetail>)=>{
    const [snapshot,setSnapshot]=useState<PdvPreorderEditorSnapshot>(()=>props.editorSnapshot??{customerId:props.detail?.preorder.customer_id??'none',stockId:'none',targetTerminalId:'none',notes:'',orderDiscount:'0',coupon:null,dirty:false,sourceRevision:props.detail?.preorder.revision??null,lines:props.detail?.items.map(item=>({id:item.id,inventoryId:item.inventory_id,itemType:item.item_type,description:item.description,quantity:String(item.quantity),unitPrice:String(item.unit_price??''),discountAmount:String(item.discount_amount),unitFactor:item.unit_factor_snapshot,sortOrder:item.sort_order}))??[]});
    const callback=useRef(props.onEditorSnapshotChange);callback.current=props.onEditorSnapshotChange;
    const total=snapshot.lines.reduce((sum,line)=>sum+Number(line.quantity)*Number(line.unitPrice)-Number(line.discountAmount),0)-Number(snapshot.orderDiscount);
    useEffect(()=>{callback.current?.(snapshot,{total,hasMissingPrices:false});},[snapshot,total]);
    const fill=(person:'Ana'|'Bruno')=>setSnapshot(current=>({...current,customerId:person==='Ana'?state.customerA:state.customerB,dirty:true,lines:[{id:person==='Ana'?'50000000-0000-4000-8000-000000000001':'50000000-0000-4000-8000-000000000002',inventoryId:null,itemType:'free_item',description:person==='Ana'?'Material A':'Material B',quantity:'2',unitPrice:person==='Ana'?'25':'40',discountAmount:'0',unitFactor:1,sortOrder:0}]}));
    return <section aria-label="Editor ativo">{props.workspaceHeader}<output aria-label="Estoque sugerido">{props.preferredStockId??'none'}</output><output aria-label="Cliente do editor">{snapshot.customerId}</output><output aria-label="Conteúdo do editor">{snapshot.lines.map(line=>line.description).join(',')}</output><output aria-label="Total do editor">{total}</output><button onClick={()=>fill('Ana')}>Preencher Ana</button><button onClick={()=>fill('Bruno')}>Preencher Bruno</button><button onClick={()=>void props.onValue({header:{customer_id:snapshot.customerId},items:snapshot.lines.map(line=>({id:line.id,unit_price:Number(line.unitPrice),discount_amount:0}))})}>Valorizar no servidor</button><button onClick={()=>void props.onForward()}>Enviar ao caixa no servidor</button><button onClick={props.onCloseOrder}>Fechar aba atual</button></section>;
  }};
});

function document(status:'edicao'|'encaminhado'='edicao'): Detail {
  const timestamp='2026-11-16T10:00:00Z';
  return {preorder:{id:state.preorderId,company_id:state.companyId,number:5,customer_id:state.customerA,stock_id:null,target_terminal_id:null,status,operation_mode:'counter',revision:2,subtotal:50,discount_amount:0,total:50,notes:null,created_by:state.userId,assigned_to:null,forwarded_at:null,converted_order_id:null,converted_at:null,cancelled_at:null,created_at:timestamp,updated_at:timestamp},items:[{id:'50000000-0000-4000-8000-000000000001',company_id:state.companyId,preorder_id:state.preorderId,inventory_id:null,item_type:'free_item',description:'Material salvo',quantity:2,unit_price:25,discount_amount:0,unit_factor_snapshot:1,sort_order:0,created_at:timestamp,updated_at:timestamp}]};
}
function Address(){const location=useLocation();return <output aria-label="Endereço do atendimento">{location.pathname+location.search}</output>;}
function App({entry='/'}:{entry?:string}){return <MemoryRouter initialEntries={[entry]} future={{v7_startTransition:true,v7_relativeSplatPath:true}}><Address/><PdvPreorders /></MemoryRouter>;}
function tabs(){return Array.from(screen.getByRole('navigation',{name:'Abas de orçamento'}).querySelectorAll<HTMLElement>('[data-tab-id]'));}
function selectTab(id:string){const row=tabs().find(tab=>tab.dataset.tabId===id)!;fireEvent.click(within(row).getAllByRole('button')[0]);}
async function openSaved(status:'edicao'|'encaminhado'='edicao'){
  state.detail=document(status);state.queue=[state.detail.preorder];render(<App />);
  fireEvent.click(screen.getByRole('button',{name:'Orçamento do balcão #5'}));
  fireEvent.click(screen.getByRole('button',{name:status==='edicao'?'Editar orçamento':'Valorizar orçamento'}));
  await screen.findByRole('region',{name:'Editor ativo'});
}
beforeEach(()=>{
  vi.clearAllMocks();localStorage.clear();state.companyId='10000000-0000-4000-8000-000000000001';state.userId='20000000-0000-4000-8000-000000000001';state.detail=null;state.queue=[];state.stocks=[];state.companySettings={settings:null,isLoading:false,isError:false};
  state.forward.mockResolvedValue({preorder_id:state.preorderId,revision:3,number:5});state.refetch.mockResolvedValue({});state.save.mockResolvedValue({preorder_id:state.preorderId,revision:3,number:5});state.value.mockResolvedValue({preorder_id:state.preorderId,revision:3,number:5});
});

describe('coordenação das abas do orçamento com o editor único',()=>{
  it('cria dois atendimentos e preserva cliente, materiais e valor ao alternar',async()=>{
    render(<App />);fireEvent.click(screen.getByRole('button',{name:'Criar orçamento'}));fireEvent.click(screen.getByRole('button',{name:'Preencher Ana'}));
    const first=tabs()[0].dataset.tabId!;fireEvent.click(screen.getByRole('button',{name:'Novo orçamento'}));fireEvent.click(screen.getByRole('button',{name:'Preencher Bruno'}));
    const second=tabs()[1].dataset.tabId!;
    expect(screen.getAllByRole('region',{name:'Editor ativo'})).toHaveLength(1);
    expect(within(tabs()[0]).getByRole('button',{name:'Ana Novo 50'})).toBeInTheDocument();expect(within(tabs()[1]).getByRole('button',{name:'Bruno Novo 80'})).toBeInTheDocument();
    selectTab(first);expect(screen.getByLabelText('Cliente do editor')).toHaveTextContent(state.customerA);expect(screen.getByLabelText('Conteúdo do editor')).toHaveTextContent('Material A');expect(screen.getByLabelText('Total do editor')).toHaveTextContent('50');
    selectTab(second);expect(screen.getByLabelText('Cliente do editor')).toHaveTextContent(state.customerB);expect(screen.getByLabelText('Conteúdo do editor')).toHaveTextContent('Material B');expect(screen.getByLabelText('Total do editor')).toHaveTextContent('80');
    await act(async()=>{});
  });
  it('fecha a aba de orçamento salvo com confirmação sem cancelar o documento comercial',async()=>{
    await openSaved();fireEvent.click(screen.getByRole('button',{name:'Fechar aba atual'}));
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();fireEvent.click(screen.getByRole('button',{name:'Fechar atendimento'}));
    expect(screen.queryByRole('region',{name:'Editor ativo'})).not.toBeInTheDocument();expect(screen.getByRole('button',{name:'Orçamento do balcão #5'})).toBeInTheDocument();
    expect(state.cancel).not.toHaveBeenCalled();expect(state.save).not.toHaveBeenCalled();expect(state.value).not.toHaveBeenCalled();
    await act(async()=>{});
  });
  it('reordena somente a posição das abas e mantém suas identidades e conteúdos',async()=>{
    render(<App />);fireEvent.click(screen.getByRole('button',{name:'Criar orçamento'}));fireEvent.click(screen.getByRole('button',{name:'Preencher Ana'}));const first=tabs()[0].dataset.tabId!;
    fireEvent.click(screen.getByRole('button',{name:'Novo orçamento'}));fireEvent.click(screen.getByRole('button',{name:'Preencher Bruno'}));const second=tabs()[1].dataset.tabId!;
    fireEvent.click(screen.getByRole('button',{name:'Inverter abas'}));expect(tabs().map(tab=>tab.dataset.tabId)).toEqual([second,first]);
    selectTab(first);expect(screen.getByLabelText('Conteúdo do editor')).toHaveTextContent('Material A');selectTab(second);expect(screen.getByLabelText('Conteúdo do editor')).toHaveTextContent('Material B');
    await act(async()=>{});
  });
  it('conserva a revisão base dirty no CAS quando um refetch traz uma revisão mais recente',async()=>{
    state.detail=document('encaminhado');state.queue=[state.detail.preorder];const app=render(<App />);
    fireEvent.click(screen.getByRole('button',{name:'Orçamento do balcão #5'}));fireEvent.click(screen.getByRole('button',{name:'Valorizar orçamento'}));fireEvent.click(screen.getByRole('button',{name:'Preencher Ana'}));
    state.detail={...state.detail,preorder:{...state.detail.preorder,revision:8},items:state.detail.items.map(item=>({...item,unit_price:99}))};app.rerender(<App />);
    expect(screen.getByLabelText('Total do editor')).toHaveTextContent('50');fireEvent.click(screen.getByRole('button',{name:'Valorizar no servidor'}));
    await waitFor(()=>expect(state.value).toHaveBeenCalledWith(expect.objectContaining({preorderId:state.preorderId,expectedRevision:2,items:[expect.objectContaining({unit_price:25})]})));
    await act(async()=>{});
  });
  it('retoma a aba e seu conteúdo pelo endereço após recarregar sem criar atendimento extra',async()=>{
    const app=render(<App />);fireEvent.click(screen.getByRole('button',{name:'Criar orçamento'}));fireEvent.click(screen.getByRole('button',{name:'Preencher Ana'}));
    const first=tabs()[0].dataset.tabId!;
    await waitFor(()=>expect(screen.getByLabelText('Endereço do atendimento').textContent).toContain(`atendimento=${first}`));
    await act(async()=>{});
    const entry=screen.getByLabelText('Endereço do atendimento').textContent!;app.unmount();
    render(<App entry={entry}/>);
    await screen.findByRole('region',{name:'Editor ativo'});
    expect(tabs()).toHaveLength(1);expect(tabs()[0].dataset.tabId).toBe(first);
    expect(screen.getByLabelText('Conteúdo do editor')).toHaveTextContent('Material A');
    expect(state.save).not.toHaveBeenCalled();await act(async()=>{});
  });
  it('guarda a revisão confirmada ao encaminhar e a usa ao reabrir a mesma aba para valorizar',async()=>{
    await openSaved();const first=tabs()[0].dataset.tabId!;
    fireEvent.click(screen.getByRole('button',{name:'Enviar ao caixa no servidor'}));
    await waitFor(()=>expect(state.forward).toHaveBeenCalledWith(expect.objectContaining({preorderId:state.preorderId,expectedRevision:2})));
    await waitFor(()=>expect(tabs()).toHaveLength(2));
    selectTab(first);fireEvent.click(screen.getByRole('button',{name:'Valorizar no servidor'}));
    await waitFor(()=>expect(state.value).toHaveBeenCalledWith(expect.objectContaining({preorderId:state.preorderId,expectedRevision:3})));
    await act(async()=>{});
  });
  it('mascara abas e conteúdo do atendimento ao trocar a empresa e o usuário',async()=>{
    const app=render(<App />);fireEvent.click(screen.getByRole('button',{name:'Criar orçamento'}));fireEvent.click(screen.getByRole('button',{name:'Preencher Ana'}));
    expect(screen.getByLabelText('Conteúdo do editor')).toHaveTextContent('Material A');
    state.companyId='10000000-0000-4000-8000-000000000002';state.userId='20000000-0000-4000-8000-000000000002';app.rerender(<App />);
    expect(screen.queryByRole('navigation',{name:'Abas de orçamento'})).not.toBeInTheDocument();expect(screen.queryByLabelText('Conteúdo do editor')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button',{name:'Criar orçamento'}));expect(tabs()).toHaveLength(1);expect(screen.getByLabelText('Conteúdo do editor')).toBeEmptyDOMElement();expect(screen.getByLabelText('Total do editor')).toHaveTextContent('0');
    await act(async()=>{});
  });
  it('usa o padrão PDV B autorizado em vez de outro local geral A',()=>{
    state.stocks=[{id:'stock-a',name:'OS A'},{id:'stock-b',name:'Loja B'}];state.companySettings.settings={company_id:state.companyId,pdv_default_stock_id:'stock-b'};
    render(<App/>);fireEvent.click(screen.getByRole('button',{name:'Criar orçamento'}));expect(screen.getByLabelText('Estoque sugerido')).toHaveTextContent('stock-b');
  });
  it('prefere local único só quando não existe padrão global e não aceita padrão inacessível',()=>{
    state.stocks=[{id:'stock-b',name:'Loja B'}];const app=render(<App/>);fireEvent.click(screen.getByRole('button',{name:'Criar orçamento'}));expect(screen.getByLabelText('Estoque sugerido')).toHaveTextContent('stock-b');
    state.companySettings.settings={company_id:state.companyId,pdv_default_stock_id:'stock-hidden-a'};app.rerender(<App/>);expect(screen.getByLabelText('Estoque sugerido')).toHaveTextContent('none');
  });
  it('espera a configuração carregar antes de montar um atendimento novo',async()=>{
    state.companySettings.isLoading=true;state.stocks=[{id:'stock-b',name:'Loja B'}];const app=render(<App/>);fireEvent.click(screen.getByRole('button',{name:'Criar orçamento'}));expect(screen.queryByRole('region',{name:'Editor ativo'})).not.toBeInTheDocument();
    state.companySettings={settings:{company_id:state.companyId,pdv_default_stock_id:'stock-b'},isLoading:false,isError:false};app.rerender(<App/>);expect(await screen.findByLabelText('Estoque sugerido')).toHaveTextContent('stock-b');
  });

});
