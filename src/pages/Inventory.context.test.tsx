import type { ReactNode } from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { InventoryItem, InventoryStockLevel } from '@/hooks/useInventory';
import type { Stock } from '@/hooks/useStocks';
import Inventory from './Inventory';

const state=vi.hoisted(()=>({stocks:[] as Stock[],items:[] as InventoryItem[],levels:[] as InventoryStockLevel[],canManage:true,scope:'empresa-a:usuario-a',loading:false,error:null as Error|null,archived:vi.fn()}));
vi.mock('@/hooks/useStocks',()=>({useStockManagement:()=>({ready:true,canManage:state.canManage,scopeKey:state.scope}),useStocks:()=>({stocks:state.stocks,isLoading:false,error:null,refetch:vi.fn()})}));
vi.mock('@/hooks/useInventory',()=>({useInventory:()=>({items:state.items,stockLevels:state.levels,stockLevelsLoaded:!state.loading,stockLevelsError:null,error:state.error,isLoading:state.loading,removeFromStock:{isPending:false,mutateAsync:vi.fn()},setArchived:{mutate:state.archived,mutateAsync:state.archived},getQuantityForStock:(id:string,stockId:string)=>state.levels.find(l=>l.inventory_id===id&&l.stock_id===stockId)?.quantity??0,getMinQuantityForStock:()=>null,getPresenceForStock:(id:string,stockId:string)=>state.levels.some(l=>l.inventory_id===id&&l.stock_id===stockId&&l.is_present!==false)})}));
vi.mock('@/hooks/useAccessibleInventoryIds',()=>({useAccessibleInventoryIds:()=>({accessibleIds:new Set(state.items.map(item=>item.id)),isLoading:false,error:null})}));
vi.mock('@/hooks/useMaterialGroups',()=>({useMaterialGroups:()=>({groups:[]})}));
vi.mock('@/hooks/useCompanySettings',()=>({useCompanySettings:()=>({settings:{}})}));
vi.mock('@/hooks/useWhiteLabel',()=>({useWhiteLabel:()=>({enabled:false})}));
vi.mock('@/hooks/useCompanyModules',()=>({useCompanyModules:()=>({hasModule:()=>true})}));
vi.mock('@/hooks/use-toast',()=>({useToast:()=>({toast:vi.fn()})}));
vi.mock('@/hooks/use-mobile',()=>({useIsMobile:()=>false,useIsCompact:()=>false,useMediaBreakpoint:()=>false}));
vi.mock('@/contexts/AppLocaleContext',()=>({useAppLocaleContext:()=>({locale:'pt-br',currency:'BRL',timezone:'America/Sao_Paulo'})}));
vi.mock('@/components/mobile/MobilePageHeader',()=>({MobilePageHeader:({title,actions}:{title:string;actions:ReactNode})=><header><h1>{title}</h1>{actions}</header>}));
vi.mock('@/components/mobile/StatCarousel',()=>({StatCarousel:({items}:{items:{key:string;count:number}[]})=><section aria-label="Resumo do estoque">{items.map(item=><output key={item.key} aria-label={`Resumo ${item.key}`}>{item.count}</output>)}</section>}));
vi.mock('@/components/inventory/StockLocationNavigator',()=>({StockLocationNavigator:({items,onSelect,generalId,generalLabel}:{items:{id:string;name:string}[];onSelect:(id:string)=>void;generalId:string;generalLabel:string})=><nav aria-label="Locais disponíveis"><button onClick={()=>onSelect(generalId)}>{generalLabel}</button>{items.map(item=><button key={item.id} onClick={()=>onSelect(item.id)}>{item.name}</button>)}</nav>}));
vi.mock('@/components/inventory/StockLocationsTab',()=>({StockLocationsTab:({stocks}:{stocks:Stock[]})=><section aria-label="Gestão de locais">{stocks.map(stock=><p key={stock.id}>{stock.name}</p>)}</section>}));
vi.mock('@/components/inventory/StockConfiguratorDialog',()=>({StockConfiguratorDialog:()=>null}));
vi.mock('@/components/inventory/InventoryFormDialog',()=>({InventoryFormDialog:({open,activeStockId,item}:{open:boolean;activeStockId:string|null;item:InventoryItem|null})=>open?<section aria-label="Cadastro de material">{item?.name} · {activeStockId ?? 'geral'}</section>:null}));
vi.mock('@/components/inventory/StockTransferDialog',()=>({StockTransferDialog:()=>null}));
vi.mock('@/components/inventory/InventorySettingsDialog',()=>({InventorySettingsDialog:()=>null}));
vi.mock('@/components/inventory/InlineMovementDialog',()=>({InlineMovementDialog:()=>null}));
vi.mock('@/components/inventory/InventoryExportDialog',()=>({InventoryExportDialog:()=>null}));
vi.mock('@/components/inventory/NfeImportDialog',()=>({NfeImportDialog:()=>null}));
vi.mock('@/components/inventory/InventoryKardexTab',()=>({InventoryKardexTab:()=><p>Kardex completo</p>}));
vi.mock('@/components/inventory/MaterialPurchasesTab',()=>({MaterialPurchasesTab:()=><p>Compras completas</p>}));
vi.mock('@/components/inventory/InventoryCountsTab',()=>({InventoryCountsTab:()=>null}));
vi.mock('@/components/inventory/StockPositionTab',()=>({StockPositionTab:()=>null}));
vi.mock('@/components/inventory/InventoryReportsTab',()=>({InventoryReportsTab:()=><p>Relatório completo</p>}));
vi.mock('@/utils/inventoryPdfGenerator',()=>({generateInventoryReportPdf:vi.fn()}));
vi.mock('@/utils/inventoryExcelGenerator',()=>({generateInventoryExcel:vi.fn()}));
function stock(id:string,purpose:'pdv'|'operacional'):Stock{return {id,name:purpose==='pdv'?'Loja centro':'Oficina técnica',purpose,company_id:'empresa-a',customer_id:null,is_default:purpose==='operacional',sort_order:0,created_at:'2026-11-16',updated_at:'2026-11-16'};}
function material(id:string,name:string,cost:number):InventoryItem{return {id,name,sku:id,cost_price:cost,sale_price:cost*2,unit:'un',quantity:9999,archived_at:null,company_id:'empresa-a',customer_id:null} as InventoryItem;}
function level(inventoryId:string,stockId:string,quantity:number):InventoryStockLevel{return {id:`${inventoryId}:${stockId}`,inventory_id:inventoryId,stock_id:stockId,company_id:'empresa-a',quantity,is_present:true,min_quantity:null} as InventoryStockLevel;}
function Address(){const location=useLocation();return <output aria-label="Endereço">{location.pathname+location.search}</output>;}
function App({entry='/pdv/estoque',context='store'}:{entry?:string;context?:'general'|'store'}){return <MemoryRouter initialEntries={[entry]} future={{v7_startTransition:true,v7_relativeSplatPath:true}}><Address/><Inventory context={context}/></MemoryRouter>;}
beforeEach(()=>{vi.clearAllMocks();localStorage.clear();sessionStorage.clear();state.stocks=[stock('loja','pdv'),stock('oficina','operacional')];state.items=[material('A','Material da loja',10),material('B','Material exclusivo oficina',50)];state.levels=[level('A','loja',2),level('A','oficina',100),level('B','oficina',8)];state.canManage=true;state.scope='empresa-a:usuario-a';state.loading=false;state.error=null;});

describe('Inventory compartilhado no contexto da loja',()=>{
 it('filtra locais, catálogo e totais sem somar estoque operacional ou espelho legado',()=>{
  render(<App/>);
  expect(screen.getByRole('heading',{name:'Estoque da loja'})).toBeInTheDocument();
  expect(screen.getByRole('button',{name:'Loja centro'})).toBeInTheDocument();
  expect(screen.queryByText('Oficina técnica')).not.toBeInTheDocument();
  expect(screen.getByText('Material da loja')).toBeInTheDocument();expect(screen.queryByText('Material exclusivo oficina')).not.toBeInTheDocument();
  expect(screen.getByLabelText('Resumo total')).toHaveTextContent(/^1$/);expect(screen.getByLabelText('Resumo cost')).toHaveTextContent(/^20$/);
  const row=screen.getByRole('row',{name:/Material da loja/});expect(within(row).getByText('2')).toBeInTheDocument();expect(row).not.toHaveTextContent('102');expect(row).not.toHaveTextContent('9999');
 });
 it('mantém somente Produtos e Locais no atalho e oferece saída explícita para a gestão geral',()=>{
  render(<App entry='/pdv/estoque?aba=relatorio'/>);
  expect(screen.getAllByRole('tab').map(tab=>tab.textContent)).toEqual(['Produtos','Locais']);
  expect(screen.queryByText('Relatório completo')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'Abrir gestão completa'}));expect(screen.getByLabelText('Endereço')).toHaveTextContent(/^\/estoque$/);
 });
 it('não usa o principal operacional quando não existe local de loja',()=>{
  state.stocks=[stock('oficina','operacional')];render(<App/>);
  expect(screen.getByText('Nenhum local de loja disponível')).toBeInTheDocument();
  expect(screen.queryByRole('table')).not.toBeInTheDocument();expect(screen.queryByText('Material exclusivo oficina')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'Gerenciar locais'}));expect(screen.getByRole('region',{name:'Gestão de locais'})).toBeEmptyDOMElement();
 });
 it('recusa local operacional ou não autorizado na URL sem liberar cadastro ou movimento',()=>{
  render(<App entry='/pdv/estoque?local=oficina'/>);
  expect(screen.getByText('Local indisponível')).toBeInTheDocument();expect(screen.queryByRole('table')).not.toBeInTheDocument();
  expect(screen.queryByRole('button',{name:/novo material/i})).not.toBeInTheDocument();expect(screen.queryByRole('region',{name:'Cadastro de material'})).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'Ver locais disponíveis'}));expect(screen.getByLabelText('Endereço')).not.toHaveTextContent('local=oficina');
 });
 it('reutiliza URL de local para o mesmo material e mantém todas as abas na gestão completa',()=>{
  render(<App context='general' entry='/estoque?local=oficina'/>);
  expect(screen.getAllByRole('tab')).toHaveLength(7);expect(screen.getByText('Material exclusivo oficina')).toBeInTheDocument();
  expect(screen.getByLabelText('Resumo cost')).toHaveTextContent(/^1400$/);
 });
 it('abre a edição do cadastro pela visão geral sem vincular a quantidade a um local',()=>{
  render(<App context='general' entry='/estoque'/>);
  const row=screen.getByRole('row',{name:/Material da loja/});
  const trigger=within(row).getByRole('button',{name:'Ações'});
  trigger.focus();
  fireEvent.keyDown(trigger,{key:'Enter'});
  fireEvent.click(screen.getByRole('menuitem',{name:'Editar'}));
  expect(screen.getByRole('region',{name:'Cadastro de material'})).toHaveTextContent('Material da loja · geral');
 });
 it('mascara conteúdo e cadastros ao perder o último local autorizado',()=>{
  const app=render(<App entry='/pdv/estoque?local=loja'/>);expect(screen.getByText('Material da loja')).toBeInTheDocument();
  state.stocks=[];app.rerender(<App entry='/pdv/estoque?local=loja'/>);
  expect(screen.queryByText('Material da loja')).not.toBeInTheDocument();expect(screen.getByText('Local indisponível')).toBeInTheDocument();expect(state.archived).not.toHaveBeenCalled();
 });
 it('falha fechado enquanto saldos carregam ou a confirmação de dados falha',()=>{
  state.loading=true;const app=render(<App/>);expect(screen.getByText('Carregando estoque...').closest('[role=status]')).toBeInTheDocument();expect(screen.queryByRole('table')).not.toBeInTheDocument();
  state.loading=false;state.error=new Error('unavailable');app.rerender(<App/>);expect(screen.getByRole('alert')).toHaveTextContent('Não foi possível confirmar');expect(screen.queryByText('Material da loja')).not.toBeInTheDocument();
 });
});
