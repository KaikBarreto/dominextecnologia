import { StrictMode, type ReactNode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PdvStoreStockSettings } from './PdvStoreStockSettings';
import { PdvTerminalSettings } from './PdvTerminalSettings';
import { PdvFirstCashSetupDialog } from '../caixa/PdvFirstCashSetupDialog';

const state=vi.hoisted(()=>({toast:vi.fn(),save:vi.fn(),set:vi.fn(),create:vi.fn(),refetch:vi.fn(),settings:{} as ReturnType<typeof import('@/hooks/usePdvTerminalSettings')['usePdvTerminalSettings']>}));
vi.mock('@/hooks/usePdvTerminalSettings',()=>({usePdvTerminalSettings:()=>state.settings}));
vi.mock('@/hooks/use-toast',()=>({useToast:()=>({toast:state.toast})}));
vi.mock('@/components/ui/ResponsiveModal',()=>({ResponsiveModal:({open,title,children,footer}:{open:boolean;title:string;children:ReactNode;footer:ReactNode})=>open?<section role="dialog" aria-label={title}>{children}{footer}</section>:null}));
vi.mock('@/components/ui/select',()=>({Select:({value,onValueChange,disabled,children}:{value:string;onValueChange:(value:string)=>void;disabled?:boolean;children:ReactNode})=><select aria-label="Local de estoque" value={value} disabled={disabled} onChange={event=>onValueChange(event.target.value)}><option value="">Escolher local</option>{children}</select>,SelectTrigger:()=>null,SelectValue:()=>null,SelectContent:({children}:{children:ReactNode})=><>{children}</>,SelectItem:({value,children}:{value:string;children:ReactNode})=><option value={value}>{children}</option>}));
vi.mock('@/components/ui/dropdown-menu',()=>({DropdownMenu:({children}:{children:ReactNode})=><>{children}</>,DropdownMenuTrigger:({children}:{children:ReactNode})=><>{children}</>,DropdownMenuContent:({children}:{children:ReactNode})=><>{children}</>,DropdownMenuLabel:()=>null,DropdownMenuItem:({children,onSelect}:{children:ReactNode;onSelect:()=>void})=><button onClick={onSelect}>{children}</button>}));
const general={id:'general',name:'Estoque geral',purpose:'operacional',isDefault:true};
const shop={id:'shop',name:'Loja Centro',purpose:'pdv',isDefault:false};
beforeEach(()=>{
  vi.clearAllMocks();state.save.mockResolvedValue({});state.set.mockResolvedValue({});state.create.mockResolvedValue({});
  state.settings={scopeKey:'company-a:user-a',terminals:[],stocks:[general,shop],storeStock:{stockId:'shop',revision:3,canManage:true,canCreateStock:true,stocks:[general,shop]},isLoading:false,isError:false,error:null,refetch:state.refetch,save:{mutateAsync:state.save,isPending:false},saveStoreStock:{mutateAsync:state.set,isPending:false},createStoreStock:{mutateAsync:state.create,isPending:false}};
});
describe('estoque da loja e vínculo dos caixas',()=>{
  it('não escolhe o local geral automaticamente e salva a escolha explícita com a revisão confirmada',async()=>{
    state.settings.storeStock!.stockId=null;render(<PdvStoreStockSettings canManage/>);
    expect(screen.getByRole('combobox')).toHaveValue('');expect(screen.getByRole('button',{name:'Salvar estoque'})).toBeDisabled();
    fireEvent.change(screen.getByRole('combobox'),{target:{value:'shop'}});fireEvent.click(screen.getByRole('button',{name:'Salvar estoque'}));
    await waitFor(()=>expect(state.set).toHaveBeenCalledWith({stockId:'shop',expectedRevision:3}));
  });
  it('cria o primeiro local com nome simples sem exigir configuração de OS',async()=>{
    state.settings.stocks=[];state.settings.storeStock={...state.settings.storeStock!,stockId:null,stocks:[]};render(<StrictMode><PdvStoreStockSettings canManage/></StrictMode>);
    fireEvent.click(screen.getByRole('button',{name:'Criar local de estoque'}));expect(screen.getByLabelText('Nome do local')).toHaveFocus();
    fireEvent.change(screen.getByLabelText('Nome do local'),{target:{value:'Loja da esquina'}});fireEvent.click(screen.getByRole('button',{name:'Criar e usar na loja'}));
    await waitFor(()=>expect(state.create).toHaveBeenCalledWith({name:'Loja da esquina',expectedRevision:3}));expect(state.toast).toHaveBeenCalledWith({title:'Estoque da loja criado'});
  });
  it('mantém somente leitura quando o servidor não autoriza, mesmo com permissão visual',()=>{
    state.settings.storeStock!.canManage=false;render(<PdvStoreStockSettings canManage/>);
    expect(screen.getByRole('combobox')).toBeDisabled();expect(screen.queryByRole('button',{name:'Salvar estoque'})).not.toBeInTheDocument();expect(screen.queryByRole('button',{name:'Criar local de estoque'})).not.toBeInTheDocument();
  });
  it('falha fechado no carregamento e permite repetir a leitura sem habilitar alterações',()=>{
    state.settings.isError=true;render(<PdvStoreStockSettings canManage/>);expect(screen.queryByRole('combobox')).not.toBeInTheDocument();fireEvent.click(screen.getByRole('button',{name:/Tentar novamente/}));expect(state.refetch).toHaveBeenCalled();expect(state.set).not.toHaveBeenCalled();
  });
  it('caixa novo herda o estoque da loja e deixa a escolha específica nas opções avançadas',async()=>{
    render(<PdvTerminalSettings canManage/>);fireEvent.click(screen.getByRole('button',{name:'Novo caixa'}));
    expect(screen.getByText('Loja Centro')).toBeInTheDocument();expect(screen.queryByRole('combobox')).not.toBeInTheDocument();fireEvent.click(screen.getByRole('button',{name:'Salvar caixa'}));
    await waitFor(()=>expect(state.save).toHaveBeenCalledWith(expect.objectContaining({stockId:'shop',stockBindingMode:'store_default'})));
  });
  it('caixa existente com o mesmo local mantém seu vínculo específico, sem inferir herança',async()=>{
    state.settings.terminals=[{id:'cash-1',name:'Caixa 01',stockId:'shop',stockBindingMode:'specific',isActive:true,sortOrder:1}];render(<PdvTerminalSettings canManage/>);
    expect(screen.getByText(/específico deste caixa/)).toBeInTheDocument();fireEvent.click(screen.getByRole('button',{name:'Editar'}));expect(screen.getByRole('checkbox',{name:'Usar outro estoque neste caixa'})).toBeChecked();expect(screen.getByRole('combobox')).toHaveValue('shop');
    fireEvent.click(screen.getByRole('button',{name:'Salvar caixa'}));await waitFor(()=>expect(state.save).toHaveBeenCalledWith(expect.objectContaining({id:'cash-1',stockId:'shop',stockBindingMode:'specific'})));
  });
  it('primeira abertura usa o mesmo padrão da loja e só segue após cadastro confirmado',async()=>{
    const onCreated=vi.fn();const onOpenChange=vi.fn();render(<PdvFirstCashSetupDialog open onOpenChange={onOpenChange} onCreated={onCreated}/>);
    expect(screen.getByText('Loja Centro')).toBeInTheDocument();fireEvent.click(screen.getByRole('button',{name:'Continuar para abertura'}));
    await waitFor(()=>expect(state.save).toHaveBeenCalledWith(expect.objectContaining({stockId:'shop',stockBindingMode:'store_default'})));expect(onCreated).toHaveBeenCalledOnce();expect(onOpenChange).toHaveBeenCalledWith(false);
  });
  it('trocar a conta fecha o formulário antigo e não aplica sua resposta atrasada',async()=>{
    let finish!:()=>void;state.save.mockImplementation(()=>new Promise<void>(resolve=>{finish=resolve;}));const app=render(<PdvTerminalSettings canManage/>);fireEvent.click(screen.getByRole('button',{name:'Novo caixa'}));fireEvent.change(screen.getByLabelText('Nome do caixa'),{target:{value:'Nome da empresa anterior'}});fireEvent.click(screen.getByRole('button',{name:'Salvar caixa'}));
    state.settings={...state.settings,scopeKey:'company-b:user-b'};app.rerender(<PdvTerminalSettings canManage/>);expect(screen.queryByRole('dialog')).not.toBeInTheDocument();expect(screen.queryByDisplayValue('Nome da empresa anterior')).not.toBeInTheDocument();finish();await waitFor(()=>expect(state.save).toHaveBeenCalledOnce());expect(state.toast).not.toHaveBeenCalled();
  });
  it('padrão oculto não bloqueia um caixa com estoque próprio autorizado',async()=>{
    state.settings.storeStock={...state.settings.storeStock!,stockId:null,defaultUnavailable:true,canCreateStock:false};
    state.settings.stocks=[shop];state.settings.storeStock.stocks=[shop];
    const app=render(<PdvTerminalSettings canManage/>);fireEvent.click(screen.getByRole('button',{name:'Novo caixa'}));
    expect(screen.getByText('O estoque padrão da loja não está disponível para seu perfil. Use um local autorizado nas opções do caixa.')).toBeInTheDocument();
    expect(screen.getByRole('button',{name:'Salvar caixa'})).toBeDisabled();
    fireEvent.click(screen.getByRole('checkbox',{name:'Usar outro estoque neste caixa'}));fireEvent.change(screen.getByRole('combobox'),{target:{value:'shop'}});
    fireEvent.click(screen.getByRole('checkbox',{name:'Usar outro estoque neste caixa'}));
    expect(screen.getByRole('checkbox',{name:'Usar outro estoque neste caixa'})).toBeChecked();
    fireEvent.click(screen.getByRole('button',{name:'Salvar caixa'}));await waitFor(()=>expect(state.save).toHaveBeenCalledWith(expect.objectContaining({stockId:'shop',stockBindingMode:'specific'})));
    app.unmount();state.settings.storeStock.canManage=false;render(<PdvStoreStockSettings canManage/>);
    expect(screen.getByRole('combobox')).toBeDisabled();expect(screen.queryByRole('button',{name:'Salvar estoque'})).not.toBeInTheDocument();expect(screen.queryByRole('button',{name:'Criar local de estoque'})).not.toBeInTheDocument();
  });

});
