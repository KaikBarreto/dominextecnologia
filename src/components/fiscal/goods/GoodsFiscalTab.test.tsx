import {fireEvent,render,screen,waitFor} from '@testing-library/react';
import {beforeEach,describe,expect,it,vi} from 'vitest';
import type {ReactNode} from 'react';
import {GoodsFiscalTab} from './GoodsFiscalTab';
const state=vi.hoisted(()=>({allowed:true,scope:'a',documents:[] as Record<string,unknown>[],invoke:vi.fn(),refetch:vi.fn(),wizard:vi.fn(),pending:vi.fn()}));
vi.mock('@/contexts/AppLocaleContext',()=>({useAppLocaleContext:()=>({locale:'pt-br',timezone:'America/Sao_Paulo'})}));
vi.mock('@/hooks/useGoodsFiscalAccess',()=>({useGoodsFiscalAccess:()=>({allowed:state.allowed,scopeId:state.scope,isLoading:false})}));
vi.mock('@/hooks/useGoodsFiscal',()=>({useGoodsFiscalDocuments:()=>({data:state.documents,isLoading:false,isError:false,refetch:state.refetch}),useGoodsFiscalDocumentAction:()=>({mutateAsync:state.invoke,isPending:false})}));
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
  fireEvent.click(screen.getByRole('button',{name:'DANFE'}));expect(state.pending).toHaveBeenCalledOnce();
  finish({url:'https://artifacts.example.invalid/file.pdf'});
  expect(await screen.findByRole('link',{name:'Abrir DANFE'})).toHaveAttribute('rel','noopener noreferrer');
 });
 it('trocar empresa fecha edição e descarta artefato atrasado da anterior',async()=>{
  state.documents=[{id:'document-a',status:'authorized',danfe_pdf_path:'path',draft_payload:draft,created_at:'2026-01-01'}];
  const close=vi.fn();state.pending.mockReturnValue({close});let finish!:(value:unknown)=>void;state.invoke.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));
  const {rerender}=render(<GoodsFiscalTab model={55}/>);fireEvent.click(screen.getByRole('button',{name:'DANFE'}));state.scope='b';state.documents=[];rerender(<GoodsFiscalTab model={55}/>);
  finish({url:'https://artifacts.example.invalid/old.pdf'});await waitFor(()=>expect(close).toHaveBeenCalled());expect(screen.queryByRole('link')).not.toBeInTheDocument();
 });
});
