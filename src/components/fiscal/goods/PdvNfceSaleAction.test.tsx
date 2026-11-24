import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { PdvNfceSaleAction } from './PdvNfceSaleAction';
const state = vi.hoisted(() => ({ pending:vi.fn(),allowed:true, scope:'company-a:user-a:emit', loading:false, enabled:true, mode:'ask', docs:[] as Record<string,unknown>[], docsError:false, readiness:{ready:true,issues:[] as {code:string;message:string;section:string}[]}, readinessError:false,autoDanfce:false, invoke:vi.fn(), refetch:vi.fn(), wizard:vi.fn() }));
vi.mock('@/contexts/AppLocaleContext',()=>({useAppLocaleContext:()=>({locale:'pt-br'})}));
vi.mock('react-router-dom',()=>({Link:({to,children,...props}:{to:string;children:ReactNode})=><a href={to} {...props}>{children}</a>}));
vi.mock('@/hooks/useGoodsFiscalReadiness',()=>({useGoodsFiscalReadiness:()=>({data:state.readiness,isLoading:false,isError:state.readinessError,refetch:state.refetch})}));
vi.mock('@/utils/openPdfInTab',()=>({openPendingPdfTab:(...args:unknown[])=>state.pending(...args)}));
vi.mock('@/hooks/useGoodsFiscalAccess',()=>({useGoodsFiscalAccess:()=>({allowed:state.allowed,scopeId:state.scope,isLoading:state.loading})}));
vi.mock('@/hooks/useGoodsFiscalSettings',()=>({useGoodsFiscalSettings:()=>({settings:{nfce:{enabled:state.enabled,afterPaymentMode:state.mode,defaultOperationNature:'VENDA',includeIdentifiedConsumer:true,openDanfceAfterAuthorization:state.autoDanfce}},isLoading:false,isError:false})}));
vi.mock('@/hooks/useGoodsFiscal',()=>({useGoodsFiscalDocuments:()=>({data:state.docs,isLoading:false,isError:state.docsError,refetch:state.refetch}),useGoodsFiscalDocumentAction:()=>({mutateAsync:state.invoke,isPending:false})}));
vi.mock('@/components/ui/ResponsiveModal',()=>({ResponsiveModal:({open,title,children}:{open:boolean;title:string;children:ReactNode})=>open?<section role="dialog" aria-label={title}>{children}</section>:null}));
vi.mock('./GoodsFiscalWizard',()=>({GoodsFiscalWizard:(props:Record<string,unknown>)=>{state.wizard(props);return props.open?<div data-testid="fiscal-wizard">Revisar venda {String(props.sourceId)}</div>:null;}}));
const props={orderId:'sale-a',confirmed:true,promptAfterPayment:true,detailsOpen:false,contextKey:'cash-a'};
describe('controlador NFC-e pós-venda independente do popover',()=>{
 beforeEach(()=>{vi.clearAllMocks();Object.assign(state,{allowed:true,scope:'company-a:user-a:emit',loading:false,enabled:true,mode:'ask',docs:[],docsError:false,readiness:{ready:true,issues:[]},readinessError:false,autoDanfce:false});state.pending.mockReturnValue(null);state.invoke.mockResolvedValue({status:'uncertain'});state.refetch.mockResolvedValue({});});
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
 it('mostra a pendência real e leva às configurações sem perguntar ou transmitir',()=>{
  state.readiness={ready:false,issues:[{code:'issuer_incomplete',message:'Complete nas Configurações Fiscais: inscrição estadual.',section:'empresa'}]};
  render(<PdvNfceSaleAction {...props} detailsOpen/>);
  expect(screen.getByRole('button',{name:'Emitir NFC-e'})).toBeDisabled();
  expect(screen.getByText(/Complete nas Configurações Fiscais: inscrição estadual/)).toBeInTheDocument();
  expect(screen.getByRole('link',{name:'Abrir configurações fiscais'})).toHaveAttribute('href','/notas-fiscais/configuracoes');
  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();expect(state.invoke).not.toHaveBeenCalled();
 });
 it('falha ao conferir pré-requisitos não libera emissão',()=>{
  state.readinessError=true;state.readiness={ready:false,issues:[]};
  render(<PdvNfceSaleAction {...props} detailsOpen/>);
  expect(screen.getByRole('button',{name:'Emitir NFC-e'})).toBeDisabled();
  expect(screen.getByRole('alert')).toHaveTextContent('Não foi possível conferir');expect(state.invoke).not.toHaveBeenCalled();
 });

 it('corrige rejeição em nova tentativa e preserva a nota rejeitada',async()=>{
  const draft={sourceType:'pdv_sale',sourceId:'sale-a',number:123,access_key:'chave-antiga',protocol:'protocolo-antigo'};
  state.docs=[{id:'local-rejected',status:'rejected',draft_payload:draft}];
  render(<PdvNfceSaleAction {...props} promptAfterPayment={false} detailsOpen/>);
  fireEvent.click(screen.getByRole('button',{name:'Corrigir e reemitir'}));
  expect(await screen.findByTestId('fiscal-wizard')).toBeInTheDocument();
  expect(state.wizard).toHaveBeenLastCalledWith(expect.objectContaining({documentId:null,sourceId:'sale-a',
    initialDraft:{id:null,sourceType:'pdv_sale',sourceId:'sale-a'}}));
  expect(draft.number).toBe(123);
  expect(state.invoke).not.toHaveBeenCalled();
 });
 it('continua a nota assinada sem abrir outro formulário ou criar nota nova',async()=>{
  state.docs=[{id:'signed-document',status:'signed',access_key:'0'.repeat(44)}];state.invoke.mockResolvedValue({status:'uncertain'});
  render(<PdvNfceSaleAction {...props} promptAfterPayment={false} detailsOpen/>);
  fireEvent.click(screen.getByRole('button',{name:'Continuar emissão'}));
  await waitFor(()=>expect(state.invoke).toHaveBeenCalledWith(expect.objectContaining({documentId:'signed-document',action:'resume'})));
  expect(screen.queryByTestId('fiscal-wizard')).not.toBeInTheDocument();
 });

 it('abrir DANFC-e após autorização reserva a janela no clique e só navega com autorização confirmada',async()=>{
  state.autoDanfce=true;const replace=vi.fn();const close=vi.fn();state.pending.mockReturnValue({closed:false,location:{replace},close});state.invoke.mockResolvedValue({url:'https://artifacts.example.invalid/authorized.pdf'});
  render(<PdvNfceSaleAction {...props} promptAfterPayment={false} detailsOpen/>);
  const wizard=state.wizard.mock.lastCall![0];act(()=>wizard.onBeforeEmit());expect(state.pending).toHaveBeenCalledOnce();expect(replace).not.toHaveBeenCalled();
  await act(async()=>{await wizard.onSaved({id:'authorized-id',status:'authorized'});});
  expect(state.invoke).toHaveBeenCalledWith({model:65,documentId:'authorized-id',action:'artifact',kind:'pdf'});expect(replace).toHaveBeenCalledWith('https://artifacts.example.invalid/authorized.pdf');expect(close).not.toHaveBeenCalled();
 });
 it('fecha a janela de espera quando a emissão falha ou fica incerta',async()=>{
  state.autoDanfce=true;const close=vi.fn();state.pending.mockReturnValue({closed:false,close});render(<PdvNfceSaleAction {...props} promptAfterPayment={false} detailsOpen/>);
  const wizard=state.wizard.mock.lastCall![0];act(()=>wizard.onBeforeEmit());await act(async()=>{await wizard.onSaved({id:'uncertain-id',status:'uncertain'});});expect(close).toHaveBeenCalledOnce();expect(state.invoke).not.toHaveBeenCalled();
  act(()=>{wizard.onBeforeEmit();wizard.onEmitFailure();});expect(close).toHaveBeenCalledTimes(2);
 });

});
