import {fireEvent,render,screen,waitFor,within} from '@testing-library/react';
import {beforeEach,describe,expect,it,vi} from 'vitest';
import type {ReactNode} from 'react';
import {GoodsFiscalTab} from './GoodsFiscalTab';
const state=vi.hoisted(()=>({allowed:true,scope:'a',documents:[] as Record<string,unknown>[],invoke:vi.fn(),refetch:vi.fn(),wizard:vi.fn(),pending:vi.fn(),reconcile:vi.fn(),navigate:vi.fn()}));
vi.mock('@/contexts/AppLocaleContext',()=>({useAppLocaleContext:()=>({locale:'pt-br',timezone:'America/Sao_Paulo'})}));
vi.mock('@/hooks/useGoodsFiscalAccess',()=>({useGoodsFiscalAccess:()=>({allowed:state.allowed,scopeId:state.scope,isLoading:false})}));
vi.mock('@/hooks/useGoodsFiscal',()=>({useGoodsFiscalDocuments:()=>({data:state.documents,isLoading:false,isError:false,refetch:state.refetch}),useGoodsFiscalDocumentAction:()=>({mutateAsync:state.invoke,isPending:false}),useGoodsFiscalAutoReconciliation:(...args:unknown[])=>state.reconcile(...args)}));
vi.mock('react-router-dom',()=>({useNavigate:()=>state.navigate}));
// Os menus do Radix só montam o conteúdo depois de abrir; aqui as ações ficam sempre visíveis.
vi.mock('@/components/ui/hover-dropdown-menu',()=>({HoverDropdownMenu:({children}:{children?:ReactNode})=><div>{children}</div>}));
vi.mock('@/components/ui/dropdown-menu',()=>{const Pass=({children}:{children?:ReactNode})=><>{children}</>;return {DropdownMenu:Pass,DropdownMenuTrigger:Pass,DropdownMenuContent:Pass,DropdownMenuLabel:Pass,DropdownMenuSeparator:()=>null,
 DropdownMenuItem:({children,onClick,disabled}:{children?:ReactNode;onClick?:()=>void;disabled?:boolean})=><button type="button" onClick={onClick} disabled={disabled}>{children}</button>,
 DropdownMenuCheckboxItem:({children,onCheckedChange}:{children?:ReactNode;onCheckedChange?:(value:boolean)=>void})=><button type="button" onClick={()=>onCheckedChange?.(true)}>{children}</button>};});
vi.mock('@/utils/openPdfInTab',()=>({openPendingPdfTab:(...args:unknown[])=>state.pending(...args)}));
vi.mock('./GoodsFiscalWizard',()=>({GoodsFiscalWizard:(props:Record<string,unknown>)=>{state.wizard(props);return props.open?<div data-testid="wizard">Rascunho</div>:null;}}));
vi.mock('./GoodsInvoiceTypeSelector',()=>({GoodsInvoiceTypeSelector:()=>null}));
vi.mock('@/components/mobile/EmptyState',()=>({EmptyState:({title}:{title:string})=><p>{title}</p>}));
const draft={model:55,direction:'entrada',sourceType:'manual',sourceId:null,nature:'COMPRA SALVA',party:null,items:[],payments:[],freightMode:9,notes:'Salvar dados'};
beforeEach(()=>{vi.clearAllMocks();Object.assign(state,{allowed:true,scope:'a',documents:[]});state.pending.mockReturnValue(null);state.invoke.mockResolvedValue({status:'draft'});state.refetch.mockResolvedValue({});});
describe('lista fiscal e continuidade do trabalho',()=>{
 it('continua rascunho manual pelo mesmo documento e preserva entrada',()=>{
  state.documents=[{id:'document-a',status:'draft',draft_payload:draft,created_at:'2026-01-01'}];render(<GoodsFiscalTab model={55}/>);
  fireEvent.click(screen.getByRole('button',{name:'Continuar rascunho'}));
  expect(state.wizard).toHaveBeenLastCalledWith(expect.objectContaining({documentId:'document-a',initialDraft:draft,direction:'entrada'}));
  expect(screen.getByTestId('wizard')).toBeInTheDocument();
 });
 it('mantém a rejeitada imutável e abre uma nova nota para corrigir e reemitir',async()=>{
  state.documents=[{id:'document-a',status:'rejected',draft_payload:draft,created_at:'2026-01-01'}];render(<GoodsFiscalTab model={55}/>);
  fireEvent.click(screen.getByRole('button',{name:'Corrigir e reemitir'}));
  expect(state.invoke).not.toHaveBeenCalled();
  expect(state.wizard).toHaveBeenLastCalledWith(expect.objectContaining({documentId:null,initialDraft:expect.objectContaining({id:null,direction:'entrada',nature:'COMPRA SALVA'})}));
  expect(await screen.findByTestId('wizard')).toBeInTheDocument();
  expect(draft).toEqual(expect.objectContaining({direction:'entrada',nature:'COMPRA SALVA'}));
 });
 it('reserva janela no clique e oferece link seguro se o navegador bloquear',async()=>{
  state.documents=[{id:'document-a',status:'authorized',danfe_pdf_path:'path',draft_payload:draft,created_at:'2026-01-01'}];
  let finish!:(value:unknown)=>void;state.invoke.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));render(<GoodsFiscalTab model={55}/>);
  fireEvent.click(screen.getByRole('button',{name:'Baixar DANFE'}));expect(state.pending).toHaveBeenCalledOnce();
  finish({url:'https://artifacts.example.invalid/file.pdf'});
  expect(await screen.findByRole('link',{name:'Abrir DANFE'})).toHaveAttribute('rel','noopener noreferrer');
 });
 it('nota recusada por número já usado explica o motivo e leva ao ajuste da numeração',()=>{
  state.documents=[{id:'document-a',status:'rejected',number:261,series:1,access_key:'5'.repeat(44),last_error_code:'sefaz_539',draft_payload:draft,created_at:'2026-01-01'}];render(<GoodsFiscalTab model={55}/>);
  const table=within(screen.getByRole('table'));expect(table.getByText('Rejeitada')).toBeInTheDocument();expect(table.queryByText('Aguardando SEFAZ')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'Ver detalhes'}));
  expect(screen.getByText(/número dela já foi usado em outra nota/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'Ajustar numeração'}));
  expect(state.navigate).toHaveBeenCalledWith('/notas-fiscais/configuracoes?tab=mercadorias');
 });
 it('nota sem confirmação entra na consulta automática e mostra que está aguardando a SEFAZ',()=>{
  state.documents=[{id:'document-a',status:'uncertain',number:12,series:1,access_key:'5'.repeat(44),draft_payload:draft,created_at:'2026-01-01'}];render(<GoodsFiscalTab model={55}/>);
  expect(within(screen.getByRole('table')).getByText('Aguardando SEFAZ')).toBeInTheDocument();
  expect(state.reconcile).toHaveBeenLastCalledWith(55,state.documents);
  expect(screen.getByRole('button',{name:'Consultar SEFAZ'})).toBeInTheDocument();
  expect(screen.queryByRole('button',{name:'Baixar DANFE'})).not.toBeInTheDocument();
 });
 it('nota que a SEFAZ não recebeu oferece reenviar o mesmo documento, sem consulta nova',async()=>{
  state.documents=[{id:'document-a',status:'signed',official_status:'nao_localizada',number:12,series:1,access_key:'5'.repeat(44),draft_payload:draft,created_at:'2026-01-01'}];state.invoke.mockResolvedValue({status:'authorized'});render(<GoodsFiscalTab model={55}/>);
  expect(within(screen.getByRole('table')).getByText('Envio pendente')).toBeInTheDocument();
  expect(screen.queryByRole('button',{name:'Consultar SEFAZ'})).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'Ver detalhes'}));
  expect(screen.getByText(/SEFAZ confirmou que não recebeu esta nota/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'Continuar emissão'}));
  await waitFor(()=>expect(state.invoke).toHaveBeenCalledWith({model:55,documentId:'document-a',action:'resume'}));
 });
 it('busca e filtro de situação reduzem a lista e oferecem limpar quando nada bate',()=>{
  state.documents=[{id:'document-a',status:'authorized',number:10,draft_payload:{...draft,party:{name:'Refrigeração Polar',document:'11222333000181'}},created_at:'2026-01-01'},{id:'document-b',status:'draft',draft_payload:{...draft,party:{name:'Mercado Central',document:'52998224725'}},created_at:'2026-01-02'}];render(<GoodsFiscalTab model={55}/>);
  expect(screen.getByText('Refrigeração Polar')).toBeInTheDocument();expect(screen.getByText('Mercado Central')).toBeInTheDocument();
  fireEvent.change(screen.getByRole('textbox'),{target:{value:'polar'}});
  expect(screen.getByText('Refrigeração Polar')).toBeInTheDocument();expect(screen.queryByText('Mercado Central')).not.toBeInTheDocument();
  fireEvent.change(screen.getByRole('textbox'),{target:{value:'inexistente'}});
  expect(screen.getByText('Nenhuma nota encontrada')).toBeInTheDocument();
 });
 it('trocar empresa fecha edição e descarta artefato atrasado da anterior',async()=>{
  state.documents=[{id:'document-a',status:'authorized',danfe_pdf_path:'path',draft_payload:draft,created_at:'2026-01-01'}];
  const close=vi.fn();state.pending.mockReturnValue({close});let finish!:(value:unknown)=>void;state.invoke.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));
  const {rerender}=render(<GoodsFiscalTab model={55}/>);fireEvent.click(screen.getByRole('button',{name:'Baixar DANFE'}));state.scope='b';state.documents=[];rerender(<GoodsFiscalTab model={55}/>);
  finish({url:'https://artifacts.example.invalid/old.pdf'});await waitFor(()=>expect(close).toHaveBeenCalled());expect(screen.queryByRole('link')).not.toBeInTheDocument();
 });
});
