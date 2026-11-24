import {fireEvent, render, screen, waitFor} from '@testing-library/react';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {BusinessCorePricingSettings} from './BusinessCorePricingSettings';
const mock=vi.hoisted(()=>({save:vi.fn(),allowed:true,toast:vi.fn()}));
vi.mock('sonner',()=>({toast:{success:vi.fn(),error:mock.toast}}));
vi.mock('@/hooks/useAdminBusinessCorePricing',()=>({useAdminBusinessCorePricing:(core:string)=>({
  allowed:mock.allowed,isLoading:false,isError:false,refetch:vi.fn(),
  data:mock.allowed?{business_core:core,revision:7,base_price:197,configured:true,
    plans:[{id:'plan-a',code:core==='retail'?'retail_start':'start',name:'Essencial',price:197,is_active:true},
      {id:'plan-b',code:core==='retail'?'retail_avancado':'avancado',name:'Avançado',price:297,is_active:false}],
    addon:{code:core==='retail'?'service_operations':'pdv',name:'Adicional',price:200,is_active:true}}:undefined,
  save:{isPending:false,mutateAsync:mock.save},
})}));

describe('preços dos kits',()=>{
  beforeEach(()=>{mock.allowed=true;mock.save.mockReset().mockResolvedValue({});mock.toast.mockClear();});
  it('mostra Essencial fixo em197 nos dois kits, sem campo editável',async()=>{
    render(<BusinessCorePricingSettings/>);
    expect(screen.getByLabelText('Preço mensal do kit').tagName).toBe('OUTPUT');
    expect(screen.getByLabelText('Preço mensal do kit')).toHaveTextContent('R$ 197,00');
    expect(screen.getByLabelText('Preço do plano Essencial').tagName).toBe('OUTPUT');
    expect(screen.getByRole('button',{name:'Salvar preços'})).toBeDisabled();
    fireEvent.mouseDown(screen.getByRole('tab',{name:'Loja'}),{button:0,ctrlKey:false});
    expect(await screen.findByText(/A Loja já inclui o PDV \(Loja\)/)).toBeInTheDocument();
    expect(screen.getByLabelText('Preço mensal do kit')).toHaveTextContent('R$ 197,00');
  });
  it('salva o adicional compartilhado com os valores anteriores para impedir edição perdida',async()=>{
    render(<BusinessCorePricingSettings/>);
    expect(screen.getByText(/O preço do adicional é compartilhado/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Preço mensal do adicional'),{target:{value:'230,00'}});
    fireEvent.click(screen.getByRole('button',{name:'Salvar preços'}));
    await waitFor(()=>expect(mock.save).toHaveBeenCalledWith(expect.objectContaining({business_core:'services',revision:7,base_price:197,expected_base_price:197,
      addon:{price:230,is_active:true,expected_price:200,expected_active:true}})));
  });
  it('não descarta alteração do adicional ao navegar sem confirmação',async()=>{
    render(<BusinessCorePricingSettings/>);
    fireEvent.change(screen.getByLabelText('Preço mensal do adicional'),{target:{value:'230,00'}});
    fireEvent.mouseDown(screen.getByRole('tab',{name:'Loja'}),{button:0,ctrlKey:false});
    expect(await screen.findByRole('alertdialog')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button',{name:'Continuar editando'}));
    expect(screen.getByLabelText('Preço mensal do adicional')).toHaveValue('230,00');
    expect(mock.save).not.toHaveBeenCalled();
  });
  it('não disponibiliza adicional com preço zero',async()=>{
    render(<BusinessCorePricingSettings/>);
    fireEvent.mouseDown(screen.getByRole('tab',{name:'Loja'}),{button:0,ctrlKey:false});
    expect(await screen.findByText(/A Loja já inclui o PDV \(Loja\)/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Preço mensal do adicional'),{target:{value:'0'}});
    expect(screen.getByRole('alert')).toHaveTextContent('maior que zero');
    expect(screen.getByRole('button',{name:'Salvar preços'})).toBeDisabled();
  });
  it('permite alterar somente disponibilidade sem alterar Essencial ou preço compartilhado',async()=>{
    render(<BusinessCorePricingSettings/>);
    fireEvent.click(screen.getByRole('switch',{name:'Vender o adicional'}));
    fireEvent.click(screen.getByRole('button',{name:'Salvar preços'}));
    await waitFor(()=>expect(mock.save).toHaveBeenCalledWith(expect.objectContaining({base_price:197,
      addon:{price:200,is_active:false,expected_price:200,expected_active:true}})));
  });
  it('mantém preço e disponibilidade dos demais planos editáveis',async()=>{
    render(<BusinessCorePricingSettings/>);
    fireEvent.change(screen.getByLabelText('Preço do plano Avançado'),{target:{value:'350,00'}});
    fireEvent.click(screen.getByRole('button',{name:'Salvar preços'}));
    await waitFor(()=>expect(mock.save).toHaveBeenCalledWith(expect.objectContaining({plans:expect.arrayContaining([
      expect.objectContaining({id:'plan-a',price:197}),expect.objectContaining({id:'plan-b',price:350,expected_price:297}),
    ])})));
  });
  it('mostra conflito de salvamento sem anunciar sucesso',async()=>{
    mock.save.mockRejectedValue(new Error('Os preços mudaram. Recarregue a tela antes de salvar.'));
    render(<BusinessCorePricingSettings/>);
    fireEvent.change(screen.getByLabelText('Preço mensal do adicional'),{target:{value:'230,00'}});
    fireEvent.click(screen.getByRole('button',{name:'Salvar preços'}));
    await waitFor(()=>expect(mock.toast).toHaveBeenCalledWith('Os preços mudaram. Recarregue a tela antes de salvar.'));
  });
  it('oculta os controles de quem não pode gerenciar preços',()=>{
    mock.allowed=false;
    render(<BusinessCorePricingSettings/>);
    expect(screen.getByText('Seu perfil não permite gerenciar os preços.')).toBeInTheDocument();
    expect(screen.queryByLabelText('Preço mensal do kit')).not.toBeInTheDocument();
  });
});
