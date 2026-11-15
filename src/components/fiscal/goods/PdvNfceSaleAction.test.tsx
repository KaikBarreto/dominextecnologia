import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { PdvNfceSaleAction } from './PdvNfceSaleAction';
const state = vi.hoisted(() => ({ pending:vi.fn(),allowed:true, scope:'company-a:user-a:emit', loading:false, enabled:true, mode:'ask', docs:[] as Record<string,unknown>[], docsError:false, invoke:vi.fn(), refetch:vi.fn(), wizard:vi.fn() }));
vi.mock('@/utils/openPdfInTab',()=>({openPendingPdfTab:(...args:unknown[])=>state.pending(...args)}));
vi.mock('@/hooks/useGoodsFiscalAccess',()=>({useGoodsFiscalAccess:()=>({allowed:state.allowed,scopeId:state.scope,isLoading:state.loading})}));
vi.mock('@/hooks/useGoodsFiscalSettings',()=>({useGoodsFiscalSettings:()=>({settings:{nfce:{enabled:state.enabled,afterPaymentMode:state.mode,defaultOperationNature:'VENDA',includeIdentifiedConsumer:true,openDanfceAfterAuthorization:false}},isLoading:false,isError:false})}));
vi.mock('@/hooks/useGoodsFiscal',()=>({useGoodsFiscalDocuments:()=>({data:state.docs,isLoading:false,isError:state.docsError,refetch:state.refetch}),useGoodsFiscalDocumentAction:()=>({mutateAsync:state.invoke,isPending:false})}));
vi.mock('@/components/ui/ResponsiveModal',()=>({ResponsiveModal:({open,title,children}:{open:boolean;title:string;children:ReactNode})=>open?<section role="dialog" aria-label={title}>{children}</section>:null}));
vi.mock('./GoodsFiscalWizard',()=>({GoodsFiscalWizard:(props:Record<string,unknown>)=>{state.wizard(props);return props.open?<div data-testid="fiscal-wizard">Revisar venda {String(props.sourceId)}</div>:null;}}));
const props={orderId:'sale-a',confirmed:true,promptAfterPayment:true,detailsOpen:false,contextKey:'cash-a'};
describe('controlador NFC-e pós-venda independente do popover',()=>{
 beforeEach(()=>{vi.clearAllMocks();Object.assign(state,{allowed:true,scope:'company-a:user-a:emit',loading:false,enabled:true,mode:'ask',docs:[],docsError:false});state.pending.mockReturnValue(null);state.invoke.mockResolvedValue({status:'uncertain'});state.refetch.mockResolvedValue({});});
 it('pergunta com menu fechado, sem transmitir; só abre revisão ao aceitar',async()=>{
  render(<PdvNfceSaleAction {...props}/>);
  expect(await screen.findByRole('alertdialog')).toHaveTextContent('Emitir NFC-e desta venda?');
  expect(state.invoke).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button',{name:'Revisar e emitir'}));
  expect(screen.getByTestId('fiscal-wizard')).toHaveTextContent('sale-a');
  expect(state.wizard).toHaveBeenLastCalledWith(expect.objectContaining({model:65,direction:'saida',sourceType:'pdv_sale',sourceId:'sale-a'}));
  expect(state.invoke).not.toHaveBeenCalled();
 });
 it('declinar não repete pergunta ao reverificar permissão no mesmo escopo',async()=>{
  const {rerender}=render(<PdvNfceSaleAction {...props}/>);await screen.findByRole('alertdialog');fireEvent.click(screen.getByRole('button',{name:'Agora não'}));
  state.allowed=false;rerender(<PdvNfceSaleAction {...props}/>);state.allowed=true;rerender(<PdvNfceSaleAction {...props}/>);
  await waitFor(()=>expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());expect(state.invoke).not.toHaveBeenCalled();
 });
 it.each(['off','automatic'])('não dispara emissão nem pergunta no modo %s',mode=>{state.mode=mode;render(<PdvNfceSaleAction {...props}/>);expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();expect(state.invoke).not.toHaveBeenCalled();});
 it('histórico não pergunta sozinho; erro de consulta não oferece emissão',()=>{
  state.docsError=true;render(<PdvNfceSaleAction {...props} promptAfterPayment={false} detailsOpen/>);
  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();expect(screen.getByRole('button',{name:'Emitir NFC-e'})).toBeDisabled();expect(screen.getByRole('alert')).toHaveTextContent('A venda permanece concluída');
 });
 it('após resposta perdida recupera documento pelo source e consulta o MESMO ID',async()=>{
  const {rerender}=render(<PdvNfceSaleAction {...props} promptAfterPayment={false} detailsOpen/>);
  state.docs=[{id:'persisted-document',status:'uncertain',source_type:'pdv_sale',source_id:'sale-a'}];rerender(<PdvNfceSaleAction {...props} promptAfterPayment={false} detailsOpen/>);
  expect(screen.queryByRole('button',{name:'Emitir NFC-e'})).not.toBeInTheDocument();fireEvent.click(screen.getByRole('button',{name:'Consultar situação'}));
  await waitFor(()=>expect(state.invoke).toHaveBeenCalledWith(expect.objectContaining({model:65,documentId:'persisted-document',action:'consult'})));expect(state.invoke).not.toHaveBeenCalledWith(expect.objectContaining({action:'emit'}));
 });
 it('revogar acesso mascara documento e fecha wizard imediatamente',async()=>{
  const {rerender}=render(<PdvNfceSaleAction {...props} promptAfterPayment={false} detailsOpen/>);fireEvent.click(screen.getByRole('button',{name:'Emitir NFC-e'}));expect(screen.getByTestId('fiscal-wizard')).toBeInTheDocument();
  state.allowed=false;state.scope='company-b:user-b:no-permission';rerender(<PdvNfceSaleAction {...props} promptAfterPayment={false} detailsOpen contextKey="cash-b"/>);
  expect(screen.queryByTestId('fiscal-wizard')).not.toBeInTheDocument();expect(screen.queryByText('sale-a')).not.toBeInTheDocument();expect(screen.getByRole('alert')).toHaveTextContent('permissão de emissão');
 });
 it('reserva janela no clique antes do await e mantém link seguro',async()=>{
  state.docs=[{id:'authorized-document',status:'authorized'}];const replace=vi.fn();state.pending.mockReturnValue({closed:false,opener:{},location:{replace},close:vi.fn()});let finish!:(value:unknown)=>void;state.invoke.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));render(<PdvNfceSaleAction {...props} promptAfterPayment={false} detailsOpen/>);fireEvent.click(screen.getByRole('button',{name:'DANFC-e'}));expect(state.pending).toHaveBeenCalledOnce();expect(replace).not.toHaveBeenCalled();finish({url:'https://artifacts.example.invalid/signed.pdf'});await waitFor(()=>expect(replace).toHaveBeenCalledWith('https://artifacts.example.invalid/signed.pdf'));expect(screen.getByRole('link',{name:'Abrir DANFC-e'})).toHaveAttribute('rel','noopener noreferrer');
 });
 it('autorizada disponibiliza artefatos sem repetir emissão',async()=>{
  state.docs=[{id:'authorized-document',status:'authorized'}];state.invoke.mockResolvedValue({url:'https://artifacts.example.invalid/fictitious.pdf'});const open=vi.spyOn(window,'open').mockImplementation(()=>null);
  render(<PdvNfceSaleAction {...props} promptAfterPayment={false} detailsOpen/>);fireEvent.click(screen.getByRole('button',{name:'DANFC-e'}));await waitFor(()=>expect(state.invoke).toHaveBeenCalledWith(expect.objectContaining({documentId:'authorized-document',action:'artifact',kind:'pdf'})));expect(screen.queryByRole('button',{name:'Emitir NFC-e'})).not.toBeInTheDocument();expect(await screen.findByRole('link',{name:'Abrir DANFC-e'})).toHaveAttribute('href','https://artifacts.example.invalid/fictitious.pdf');open.mockRestore();
 });
});
