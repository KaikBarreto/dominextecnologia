import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import type { GoodsFiscalDraft } from '@/hooks/useGoodsFiscal';
import { GoodsFiscalWizard } from './GoodsFiscalWizard';
const state=vi.hoisted(()=>({importer:vi.fn(),save:vi.fn()}));
vi.mock('@/contexts/AppLocaleContext',()=>({useAppLocaleContext:()=>({locale:'pt-br'})}));
vi.mock('@/hooks/useGoodsFiscalAccess',()=>({useGoodsFiscalAccess:()=>({allowed:true,scopeId:'company-a:user-a:emit'})}));
vi.mock('@/hooks/useGoodsFiscalCatalogs',()=>({useGoodsFiscalCatalogs:()=>({series:[],scenarios:[],carriers:[],isLoading:false})}));
vi.mock('@/hooks/useGoodsFiscalSettings',()=>({useGoodsFiscalSettings:()=>({settings:{nfe:{defaultEntrySeriesId:'',defaultExitSeriesId:''}}})}));
vi.mock('@/hooks/useInventory',()=>({useInventory:()=>({items:[]})}));
vi.mock('@/hooks/useCustomers',()=>({useCustomers:()=>({customers:[]})}));
vi.mock('@/hooks/useSuppliers',()=>({useSuppliers:()=>({suppliers:[]})}));
vi.mock('@/hooks/use-mobile',()=>({useIsMobile:()=>false}));
vi.mock('@/components/customers/CustomerSelectField',()=>({CustomerSelectField:()=>null}));
vi.mock('@/components/financial/SupplierSelectField',()=>({SupplierSelectField:()=>null}));
vi.mock('./GoodsFiscalItemInput',()=>({GoodsFiscalItemInput:()=>null}));
vi.mock('@/hooks/useGoodsFiscal',()=>({useGoodsFiscalSourceImport:()=>({mutateAsync:state.importer}),useGoodsFiscalSources:()=>({data:[],isLoading:false}),useSaveGoodsFiscalDocument:()=>({mutateAsync:state.save,isPending:false})}));
vi.mock('@/components/ui/FullscreenWizard',()=>({FullscreenWizard:({children,footer}:{children:ReactNode;footer:ReactNode})=><div role="dialog">{children}{footer}</div>,FullscreenWizardAction:({children,onClick,disabled}:{children:ReactNode;onClick:()=>void;disabled?:boolean})=><button onClick={onClick} disabled={disabled}>{children}</button>}));
const payments=[{method:'01',amount:35,change:5,deferred:false},{method:'17',amount:15,change:0,deferred:false},{method:'05',amount:15,change:0,deferred:true}];
const snapshot={model:65,direction:'saida',sourceType:'pdv_sale',sourceId:'paid-sale',party:null,items:[{id:'item-a',sourceItemId:'line-a',description:'Material fictício',quantity:2,unitPrice:30,discount:0,total:60,unit:'UN',taxUnit:'UN',ncm:'12345678',origin:'0',cfopExitInternal:'5102',icmsCode:'102',pisCst:'49',cofinsCst:'49'}],payments};
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

});
