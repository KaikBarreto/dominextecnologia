import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import type { GoodsFiscalDraft } from '@/hooks/useGoodsFiscal';
import { GoodsFiscalWizard } from './GoodsFiscalWizard';
const state=vi.hoisted(()=>({importer:vi.fn(),save:vi.fn(),toastError:vi.fn()}));
vi.mock('@/contexts/AppLocaleContext',()=>({useAppLocaleContext:()=>({locale:'pt-br'})}));
vi.mock('@/hooks/useGoodsFiscalAccess',()=>({useGoodsFiscalAccess:()=>({allowed:true,scopeId:'company-a:user-a:emit'})}));
vi.mock('@/hooks/useGoodsFiscalCatalogs',()=>({useGoodsFiscalCatalogs:()=>({series:[{id:'series-a',label:'Principal',series:1,nextNumber:16,direction:'saida',active:true}],scenarios:[],carriers:[],isLoading:false})}));
vi.mock('@/hooks/useGoodsFiscalSettings',()=>({useGoodsFiscalSettings:()=>({settings:{nfe:{defaultEntrySeriesId:'',defaultExitSeriesId:''}}})}));
vi.mock('@/hooks/useInventory',()=>({useInventory:()=>({items:[]})}));
vi.mock('@/hooks/useStocks',()=>({useStocks:()=>({stocks:[{id:'stock-a',name:'Principal',is_default:true}],defaultStock:{id:'stock-a',name:'Principal',is_default:true},isLoading:false})}));
vi.mock('@/hooks/useCustomers',()=>({useCustomers:()=>({customers:[]})}));
vi.mock('@/hooks/useSuppliers',()=>({useSuppliers:()=>({suppliers:[]})}));
vi.mock('@/hooks/use-mobile',()=>({useIsMobile:()=>false}));
vi.mock('@/components/customers/CustomerSelectField',()=>({CustomerSelectField:({onValueChange}:{onValueChange:(id:string)=>void})=><button type="button" aria-label="Seletor de cliente" onClick={()=>onValueChange('customer-a')}>Selecionar cliente</button>}));
vi.mock('@/components/financial/SupplierSelectField',()=>({SupplierSelectField:()=>null}));
vi.mock('./GoodsFiscalItemInput',()=>({GoodsFiscalItemInput:()=>null}));
vi.mock('@/hooks/useGoodsFiscal',()=>({useGoodsFiscalSourceImport:()=>({mutateAsync:state.importer}),useGoodsFiscalSources:()=>({data:[],isLoading:false}),useSaveGoodsFiscalDocument:()=>({mutateAsync:state.save,isPending:false})}));
vi.mock('sonner',()=>({toast:{error:(...args:unknown[])=>state.toastError(...args),success:vi.fn(),message:vi.fn()}}));
vi.mock('@/components/ui/FullscreenWizard',()=>({FullscreenWizard:({children,footer}:{children:ReactNode;footer:ReactNode})=><div role="dialog">{children}{footer}</div>,FullscreenWizardAction:({children,onClick,disabled}:{children:ReactNode;onClick:()=>void;disabled?:boolean})=><button onClick={onClick} disabled={disabled}>{children}</button>}));
const payments=[{method:'01',amount:35,change:5,deferred:false},{method:'17',amount:15,change:0,deferred:false},{method:'05',amount:15,change:0,deferred:true}];
const snapshot={model:65,direction:'saida',stockId:'stock-a',sourceType:'pdv_sale',sourceId:'paid-sale',party:null,items:[{id:'item-a',sourceItemId:'line-a',description:'Material fictício',quantity:2,unitPrice:30,discount:0,total:60,unit:'UN',taxUnit:'UN',ncm:'12345678',origin:'0',cfopExitInternal:'5102',icmsCode:'102',pisCst:'49',cofinsCst:'49'}],payments};
beforeEach(()=>{vi.clearAllMocks();state.importer.mockResolvedValue(snapshot);state.save.mockResolvedValue({id:'document-a',status:'draft'});});
describe('wizard fiscal reutilizado para venda confirmada',()=>{
 it('mostra todas as formas importadas, troco e fiado sem editar pagamento',async()=>{
  render(<GoodsFiscalWizard model={65} direction="saida" open onOpenChange={vi.fn()} sourceType="pdv_sale" sourceId="paid-sale"/>);
  await waitFor(()=>expect(screen.queryByText('Importando a venda confirmada…')).not.toBeInTheDocument());fireEvent.click(screen.getByRole('button',{name:'Faturamento'}));
  const section=screen.getByLabelText('Pagamentos da venda confirmada');expect(within(section).getByText('Dinheiro')).toBeVisible();expect(within(section).getByText('Pix')).toBeVisible();expect(within(section).getByText('Crédito da loja / saldo / fiado')).toBeVisible();expect(within(section).getByText('Pagamento a prazo aprovado')).toBeVisible();expect(within(section).getByText(/Troco:/)).toHaveTextContent(/5,00/);expect(within(section).getByText('Total aplicado à venda').parentElement).toHaveTextContent(/60,00/);expect(within(section).queryByRole('textbox')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'Salvar rascunho'}));await waitFor(()=>expect(state.save).toHaveBeenCalledWith(expect.objectContaining({emit:false,draft:expect.objectContaining({sourceType:'pdv_sale',sourceId:'paid-sale',payments})})));
 });
 it('mantém o formulário manual separado do snapshot da venda',()=>{
  render(<GoodsFiscalWizard model={65} direction="saida" open onOpenChange={vi.fn()}/>);fireEvent.click(screen.getByRole('button',{name:'Faturamento'}));expect(screen.queryByLabelText('Pagamentos da venda confirmada')).not.toBeInTheDocument();expect(screen.getByText('Valor recebido')).toBeVisible();expect(screen.getByText('Troco')).toBeVisible();expect(state.importer).not.toHaveBeenCalled();
 });
 it('retoma o rascunho manual pelo mesmo ID com itens e anotações preservados',async()=>{
  const saved={...snapshot,model:65,direction:'saida',sourceType:'manual',sourceId:null,nature:'VENDA SALVA',freightMode:9,notes:'Anotação salva',id:'manual-a'} as GoodsFiscalDraft;
  render(<GoodsFiscalWizard model={65} direction="saida" open onOpenChange={vi.fn()} documentId="manual-a" initialDraft={saved}/>);
  fireEvent.click(screen.getByRole('button',{name:'Salvar rascunho'}));
  await waitFor(()=>expect(state.save).toHaveBeenCalledWith(expect.objectContaining({emit:false,draft:expect.objectContaining({id:'manual-a',sourceType:'manual',sourceId:null,nature:'VENDA SALVA',notes:'Anotação salva',items:saved.items})})));
  expect(state.importer).not.toHaveBeenCalled();
 });

 it('mantém somente o seletor de cliente até o preenchimento manual ser escolhido',()=>{
  render(<GoodsFiscalWizard model={55} direction="saida" open onOpenChange={vi.fn()}/>);
  const recipientSection=screen.getByText('Para quem é a nota').closest('section');
  expect(recipientSection).not.toBeNull();
  const recipient=within(recipientSection as HTMLElement);
  expect(recipient.getByRole('button',{name:'Seletor de cliente'})).toBeVisible();
  expect(recipient.queryByLabelText('Nome / razão social')).not.toBeInTheDocument();
  fireEvent.click(recipient.getByRole('button',{name:'Preencher manualmente'}));
  expect(recipient.getByLabelText('Nome / razão social')).toBeVisible();
  expect(recipient.queryByRole('button',{name:'Seletor de cliente'})).not.toBeInTheDocument();
  fireEvent.click(recipient.getByRole('button',{name:'Selecionar cliente cadastrado'}));
  expect(recipient.getByRole('button',{name:'Seletor de cliente'})).toBeVisible();
  expect(recipient.queryByLabelText('Nome / razão social')).not.toBeInTheDocument();
 });

 const nfeDraft=(stateRegistration=''):GoodsFiscalDraft=>({
  id:'document-a',model:55,direction:'saida',stockId:'stock-a',seriesId:'series-a',sourceType:'manual',sourceId:null,
  nature:'VENDA DE MERCADORIA',finalConsumer:true,freightMode:9,notes:'',
  party:{name:'Cliente de teste',document:'12345678000195',stateRegistration,address:'Rua Exemplo',addressNumber:'10',neighborhood:'Centro',city:'São Paulo',state:'SP',zipCode:'01001000',municipalityCode:'3550308'},
  items:[{id:'item-a',description:'Material fictício',quantity:1,unitPrice:100,discount:0,total:100,unit:'UN',taxUnit:'UN',ncm:'12345678',origin:'0',cfopExitInternal:'5102',icmsCode:'102',pisCst:'49',cofinsCst:'49'}],
  payments:[{method:'90',amount:0,change:0,deferred:false}],
 });

 it('define automaticamente consumidor final quando o destinatário não tem IE',async()=>{
  render(<GoodsFiscalWizard model={55} direction="saida" open onOpenChange={vi.fn()} documentId="document-a" initialDraft={nfeDraft()}/>);
  expect(screen.getByText('Consumidor final')).toBeVisible();
  expect(screen.getByText('Automático')).toBeVisible();
  fireEvent.click(screen.getByRole('button',{name:'Salvar rascunho'}));
  await waitFor(()=>expect(state.save).toHaveBeenCalledWith(expect.objectContaining({emit:false,draft:expect.objectContaining({id:'document-a',finalConsumer:true})})));
 });

 it('permite ao contribuinte escolher revenda ou industrialização',async()=>{
  render(<GoodsFiscalWizard model={55} direction="saida" open onOpenChange={vi.fn()} documentId="document-a" initialDraft={nfeDraft('110042490114')}/>);
  const resale=screen.getByRole('button',{name:/Revenda ou industrialização/});
  const ownUse=screen.getByRole('button',{name:/Uso ou consumo próprio/});
  expect(ownUse).toHaveAttribute('aria-pressed','true');
  fireEvent.click(resale);
  expect(resale).toHaveAttribute('aria-pressed','true');
  fireEvent.click(screen.getByRole('button',{name:'Salvar rascunho'}));
  await waitFor(()=>expect(state.save).toHaveBeenCalledWith(expect.objectContaining({emit:false,draft:expect.objectContaining({finalConsumer:false})})));
 });

 it('traduz a rejeição 696, mantém o modal aberto e gera nova tentativa sem reaproveitar o ID',async()=>{
  const onOpenChange=vi.fn();
  state.save.mockResolvedValueOnce({id:'rejected-a',status:'rejected',rejectionCode:'sefaz_696'}).mockResolvedValueOnce({id:'new-draft',status:'draft'});
  render(<GoodsFiscalWizard model={55} direction="saida" open onOpenChange={onOpenChange} documentId="document-a" initialDraft={nfeDraft()}/>);
  fireEvent.click(screen.getByRole('button',{name:'Pré-visualização'}));
  fireEvent.click(screen.getByRole('button',{name:'Emitir NF-e'}));
  await waitFor(()=>expect(state.toastError).toHaveBeenCalledWith(expect.stringMatching(/consumidor final/i)));
  expect(onOpenChange).not.toHaveBeenCalledWith(false);
  fireEvent.click(screen.getByRole('button',{name:'Salvar rascunho'}));
  await waitFor(()=>expect(state.save).toHaveBeenLastCalledWith(expect.objectContaining({emit:false,draft:expect.objectContaining({id:null,finalConsumer:true})})));
 });

});
