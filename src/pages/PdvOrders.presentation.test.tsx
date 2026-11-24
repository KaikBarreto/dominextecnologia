import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PdvOrderWorkspaceDetail } from '@/hooks/usePdvOrdersList';
const state = vi.hoisted(() => ({ receipt: vi.fn(), flow: vi.fn(), listLoading: false, detailLoading: false, counterEnabled: false, mode: 'dispatch' as 'dispatch' | 'cashier', screens: ['screen:pdv_orders', 'screen:pdv', 'screen:pdv_dispatch'], order: { id:'order-1',number:11,customerName:'Loja Frio',createdAt:'2026-11-01T12:00:00Z',commercialStatus:'pago',paymentStatus:'pago',pickupStatus:'aguardando_liberacao',canGenerateReceipt:true,total:80,notes:null } as PdvOrderWorkspaceDetail['order'] }));
vi.mock('@/contexts/AuthContext',()=>({useAuth:()=>({roles:[],permissions:[],hasPermissionRecord:true,profile:{company_id:'company-1'},hasScreenAccess:(key:string)=>state.screens.includes(key),isAdminOrGestor:()=>false})}));
vi.mock('@/contexts/AppLocaleContext',()=>({useAppLocaleContext:()=>({locale:'pt-br'})}));
vi.mock('@/hooks/usePdvCounterFlow',()=>({usePdvCounterCapability:()=>({data:{counterEnabled:state.counterEnabled,fulfillmentMode:state.mode}})}));
vi.mock('@/hooks/usePdvSalesFlow',()=>({usePdvSalesFlow:()=>{state.flow();return {data:[],isLoading:false,isError:false};}}));
vi.mock('@/hooks/use-mobile',()=>({useIsMobile:()=>false,useIsCompact:()=>false}));
vi.mock('@/hooks/use-toast',()=>({useToast:()=>({toast:vi.fn()})}));
vi.mock('@/lib/format/hooks',()=>({useLocaleFormatters:()=>({money:(v:number)=>`R$ ${v.toFixed(2)}`,dateTime:(v:string)=>v})}));
vi.mock('@/hooks/usePdvReturns',()=>({usePdvReturnsFeature:()=>({data:false}),derivePdvReturnsAccess:()=>({enabled:false})}));
vi.mock('@/hooks/usePdvAfterSale',()=>({usePdvAfterSaleFeature:()=>({data:false}),derivePdvAfterSaleAccess:()=>({enabled:false})}));
vi.mock('@/hooks/usePdvReceiptSettings',()=>({usePdvReceiptSettings:()=>({data:{defaultFormat:'80mm'}})}));
vi.mock('@/hooks/usePdvOrderReceiptSnapshot',()=>({usePdvOrderReceiptSnapshot:(id:string,enabled:boolean)=>{state.receipt(id,enabled);return {isFetching:false,data:enabled?{payments:[{method:'pix',amount:80,dueDate:null}]}:null};}}));
vi.mock('@/components/pdv/receipt/PdvOrderReceiptButton',()=>({openPdvOrderReceipt:vi.fn()}));
vi.mock('@/components/pdv/PdvOrderActionsMenu',()=>({PdvOrderActionsMenu:()=>null}));
vi.mock('@/components/pdv/returns/PdvReturnsPanel',()=>({PdvReturnsPanel:()=>null}));
vi.mock('@/components/pdv/after-sale/PdvAfterSalePanel',()=>({PdvAfterSalePanel:()=>null}));
vi.mock('@/hooks/usePdvOrdersList',()=>({
 pdvOrderStatusLabel:(_kind:string,value:string)=>value==='pago'?'Pagamento concluído':value,
 usePdvOrdersList:()=>({isLoading:state.listLoading,data:state.listLoading?undefined:{rows:[{...state.order,itemCount:1,updatedAt:state.order.createdAt}],total:1},refetch:vi.fn()}),
 usePdvOrderWorkspace:()=>({isLoading:state.detailLoading,data:state.detailLoading?undefined:{order:state.order,items:[{id:'item-1',description:'Tubo de cobre',quantity:1,unitPrice:80,total:80,deliveredQuantity:0}],timeline:[{kind:'created',label:'Pedido criado',at:state.order.createdAt}] } satisfies PdvOrderWorkspaceDetail,refetch:vi.fn()}),
 usePdvCancelOrder:()=>({mutateAsync:vi.fn(),isPending:false}),
}));
import PdvOrders from './PdvOrders';
function LocationProbe(){const location=useLocation();return <output data-testid="location">{location.pathname+location.search}</output>}
function open() {return render(<MemoryRouter initialEntries={['/pdv/pedidos?pedido=order-1']}><PdvOrders /><LocationProbe /></MemoryRouter>)}
beforeEach(()=>{state.listLoading=false;state.detailLoading=false;state.flow.mockReset();state.counterEnabled=false;state.mode='dispatch';state.screens=['screen:pdv_orders','screen:pdv','screen:pdv_dispatch'];state.receipt.mockReset();state.order.pickupStatus='aguardando_liberacao';});
describe('pedido com estado único e abas úteis',()=>{
 it('mostra somente o estado atual em cada contexto e esconde recursos bloqueados',()=>{
  const {container}=open();
  expect(container.querySelectorAll('[data-pdv-order-status]')).toHaveLength(2);
  expect([...container.querySelectorAll('[data-pdv-order-status]')].every(el=>el.textContent==='Pago')).toBe(true);
  expect(screen.getByRole('tab',{name:'Pedido'})).toBeVisible();
  expect(screen.getByRole('tab',{name:'Pagamentos'})).toBeVisible();
  expect(screen.getByRole('tab',{name:'Histórico'})).toBeVisible();
  expect(screen.queryByRole('tab',{name:'Retirada'})).not.toBeInTheDocument();
  expect(screen.queryByRole('tab',{name:'Devoluções'})).not.toBeInTheDocument();
  expect(screen.queryByRole('tab',{name:'Trocas e créditos'})).not.toBeInTheDocument();
 });
 it('consulta formas reais somente ao abrir Pagamentos',()=>{
  open();expect(state.receipt).toHaveBeenLastCalledWith('order-1',false);
  fireEvent.mouseDown(screen.getByRole('tab',{name:'Pagamentos'}),{button:0,ctrlKey:false});
  expect(state.receipt).toHaveBeenLastCalledWith('order-1',true);
  expect(screen.getByText('Pix')).toBeVisible();
  fireEvent.mouseDown(screen.getByRole('tab',{name:'Histórico'}),{button:0,ctrlKey:false});
  expect(state.receipt).toHaveBeenLastCalledWith('order-1',false);
  expect(screen.getByText('Pedido criado')).toBeVisible();
 });
 it('oferece Retirada quando o pedido tem essa etapa explícita',()=>{
  state.order.pickupStatus='liberado';open();expect(screen.getByRole('tab',{name:'Retirada'})).toBeVisible();
 });
});


describe('navegação e busca de Pedidos',()=>{
 it.each(['cashier','dispatch'] as const)('carrega o fluxo somente quando escolhido no modo %s',mode=>{
  state.counterEnabled=true;state.mode=mode;open();expect(state.flow).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button',{name:'Fluxo do balcão'}));
  expect(state.flow).toHaveBeenCalled();expect(screen.getByRole('region',{name:'Fluxo do balcão'})).toBeVisible();
  expect(screen.queryByRole('searchbox',{name:'Buscar pedidos'})).not.toBeInTheDocument();
  expect(screen.queryAllByText(mode==='cashier'?'Concluído':'Retirada').length).toBeGreaterThan(0);
  fireEvent.click(screen.getByRole('button',{name:'Lista'}));
  expect(screen.getByRole('searchbox',{name:'Buscar pedidos'})).toBeVisible();
 });
 it('não oferece fluxo sem modo balcão ou sem permissão de Pedidos',()=>{
  open();expect(screen.queryByRole('button',{name:'Fluxo do balcão'})).not.toBeInTheDocument();expect(state.flow).not.toHaveBeenCalled();
 });
 it('não consulta fluxo quando o perfil perdeu a permissão',()=>{
  state.counterEnabled=true;state.screens=[];open();expect(screen.queryByRole('button',{name:'Fluxo do balcão'})).not.toBeInTheDocument();expect(state.flow).not.toHaveBeenCalled();
 });
 it('embute filtro e ordenação na busca e mantém seleção/URL da ordenação',()=>{
  const {container}=open();const search=screen.getByRole('searchbox',{name:'Buscar pedidos'});
  const toolbar=search.parentElement!;
  expect(toolbar).toContainElement(screen.getByRole('button',{name:'Filtros'}));
  const sort=screen.getByRole('button',{name:'Ordenar pedidos: Mais novos'});expect(toolbar).toContainElement(sort);
  act(()=>sort.focus());expect(sort).toHaveFocus();fireEvent.click(sort);
  fireEvent.click(screen.getByRole('button',{name:'Mais antigos'}));
  expect(screen.getByTestId('location')).toHaveTextContent('ordem=oldest');
  expect(container.querySelector('input[type=search]')).toBe(search);
 });
 it('abre filtros pela ação embutida sem duplicar botão externo',()=>{
  open();const filter=screen.getByRole('button',{name:'Filtros'});fireEvent.click(filter);
  expect(screen.getByRole('dialog')).toBeVisible();expect(screen.getByText('Situação')).toBeVisible();
 });
});


describe('carregamento dos pedidos',()=>{
 it('mantém o cabeçalho e anuncia a lista pendente sem anunciar lista vazia',()=>{
  state.listLoading=true;open();
  expect(screen.getByRole('heading',{name:'Pedidos'})).toBeVisible();
  expect(screen.getByRole('status',{name:'Carregando pedidos'})).toHaveAttribute('aria-busy','true');
  expect(screen.queryByText('Nenhum pedido encontrado')).not.toBeInTheDocument();
  expect(screen.queryByRole('button',{name:'Abrir detalhes do pedido 11'})).not.toBeInTheDocument();
 });
 it('mantém a lista disponível enquanto consulta o detalhe selecionado',()=>{
  state.detailLoading=true;open();
  expect(screen.getByRole('status',{name:'Carregando detalhes do pedido'})).toHaveAttribute('aria-busy','true');
  expect(screen.getByRole('searchbox',{name:'Buscar pedidos'})).toBeVisible();
  expect(screen.queryByText('Tubo de cobre')).not.toBeInTheDocument();
 });
});
