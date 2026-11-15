import { createRef } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PdvSalePreviewView } from './PdvSalePreviewView';
import { useBarcodeScanner } from '@/hooks/useBarcodeScanner';
import { canCapturePdvCatalogScan } from '@/lib/pdv/catalogKeyboard';

const products = [0, 1, 2].map(index => ({ inventoryId: `material-${index}`, name: `Material ${index}`, sku: `MAT-${index}`, imageUrl: null, unitPrice: 20, unit: 'un', availableQuantity: index === 0 ? 0 : 10 }));
function props() {
  return { mode: 'quick' as const, onModeChange: vi.fn(), search: 'MAT', onSearchChange: vi.fn(), onSearchKeyDown: vi.fn(), searchInputRef: createRef<HTMLInputElement>(), gridRef: createRef<HTMLDivElement>(), controlsRef: createRef<HTMLDivElement>(), rowRef: createRef<HTMLDivElement>(), onGridKeyDown: vi.fn(), products, activeProductId: null, onProductFocus: vi.fn(), onProductSelect: vi.fn(), formatCurrency: (value: number) => `R$ ${value}`, onExit: vi.fn(), cart: <div>Pedido</div> };
}

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('inclusão e foco do catálogo compartilhado', () => {
  it('mantém catálogo ocupado sem opções antigas ou inclusão enquanto carrega', () => {
    const input = props();
    const { rerender } = render(<PdvSalePreviewView {...input} catalogLoading />);
    expect(screen.getByRole('listbox', { name: 'Materiais disponíveis' })).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('status', { name: 'Carregando materiais' })).toBeVisible();
    expect(screen.queryByRole('option')).not.toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Enter' });
    expect(input.onProductSelect).not.toHaveBeenCalled();
    rerender(<PdvSalePreviewView {...input} catalogLoading={false} />);
    expect(screen.queryByRole('status', { name: 'Carregando materiais' })).not.toBeInTheDocument();
    expect(screen.getAllByRole('option')).toHaveLength(3);
  });

  it('ativa o primeiro habilitado sem tirar o foco da busca e inclui com Enter', async () => {
    const input = props(); render(<PdvSalePreviewView {...input} />);
    const search = screen.getByRole('combobox'); search.focus();
    const first = screen.getByRole('option', { name: 'Adicionar MAT-1 Material 1' });
    expect(search).toHaveAttribute('aria-activedescendant', first.id);
    expect(first).toHaveAttribute('aria-selected', 'true'); expect(search).toHaveFocus();
    fireEvent.keyDown(search, { key: 'Enter' });
    expect(input.onProductSelect).toHaveBeenCalledExactlyOnceWith(products[1]);
    await waitFor(() => expect(search).toHaveFocus());
    await waitFor(() => { expect(input.searchInputRef.current?.selectionStart).toBe(0); expect(input.searchInputRef.current?.selectionEnd).toBe(3); });
  });

  it.each(['Nova venda', 'Nova compra', 'Criar orçamento'])('%s: catálogo vazio de busca não seleciona nem inclui por Enter', title => {
    const input = props(); render(<PdvSalePreviewView {...input} title={title} search="" />);
    const search = screen.getByRole('combobox'); search.focus();
    expect(search).not.toHaveAttribute('aria-activedescendant');
    expect(screen.getAllByRole('option').every(option => option.getAttribute('aria-selected') === 'false')).toBe(true);
    fireEvent.keyDown(search, { key: 'Enter' });
    expect(input.onProductSelect).not.toHaveBeenCalled(); expect(input.onSearchKeyDown).not.toHaveBeenCalled();
  });

  it('limpar a pesquisa remove a seleção e hover não autoriza Enter vazio', () => {
    const input = props(); const { rerender } = render(<PdvSalePreviewView {...input} />);
    const search = screen.getByRole('combobox'); search.focus();
    expect(search).toHaveAttribute('aria-activedescendant');
    rerender(<PdvSalePreviewView {...input} search="" />);
    expect(search).not.toHaveAttribute('aria-activedescendant');
    fireEvent.pointerMove(screen.getByRole('option', { name: 'Adicionar MAT-2 Material 2' }));
    expect(search).toHaveAttribute('aria-activedescendant', screen.getByRole('option', { name: 'Adicionar MAT-2 Material 2' }).id);
    fireEvent.keyDown(search, { key: 'Enter' }); expect(input.onProductSelect).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('option', { name: 'Adicionar MAT-2 Material 2' }));
    expect(input.onProductSelect).toHaveBeenCalledExactlyOnceWith(products[2]);
  });

  it.each([['ArrowDown', 1], ['ArrowRight', 1], ['ArrowUp', 2], ['ArrowLeft', 2]] as const)('sem pesquisa %s inicia navegação explícita e autoriza uma inclusão', (key, index) => {
    const input = props(); render(<PdvSalePreviewView {...input} search="" />);
    const search = screen.getByRole('combobox'); search.focus();
    fireEvent.keyDown(search, { key });
    expect(search).toHaveAttribute('aria-activedescendant', screen.getByRole('option', { name: `Adicionar MAT-${index} Material ${index}` }).id);
    fireEvent.keyDown(search, { key: 'Enter' });
    expect(input.onProductSelect).toHaveBeenCalledExactlyOnceWith(products[index]);
    expect(search).not.toHaveAttribute('aria-activedescendant');
    fireEvent.keyDown(search, { key: 'Enter' }); expect(input.onProductSelect).toHaveBeenCalledTimes(1);
  });

  it('saída do mouse remove apenas seu destaque e preserva seleção feita por teclado', () => {
    const input = props(); const { rerender } = render(<PdvSalePreviewView {...input} search="" />);
    const search = screen.getByRole('combobox'); const first = screen.getByRole('option', { name: 'Adicionar MAT-1 Material 1' }); const last = screen.getByRole('option', { name: 'Adicionar MAT-2 Material 2' }); search.focus();
    fireEvent.pointerMove(last); expect(last).toHaveAttribute('aria-selected', 'true');
    fireEvent.pointerLeave(last); expect(search).not.toHaveAttribute('aria-activedescendant');
    fireEvent.pointerMove(first); fireEvent.keyDown(search, { key: 'ArrowUp' });
    expect(last).toHaveAttribute('aria-selected', 'true');
    fireEvent.pointerLeave(first); expect(last).toHaveAttribute('aria-selected', 'true');
    rerender(<PdvSalePreviewView {...input} />);
    fireEvent.pointerMove(last); fireEvent.pointerLeave(last);
    expect(first).toHaveAttribute('aria-selected', 'true');
  });

  it('setas fazem seleção circular sem mover o foco e preservam edição de texto', () => {
    const input = props(); render(<PdvSalePreviewView {...input} />);
    const search = screen.getByRole('combobox'); search.focus();
    const first = screen.getByRole('option', { name: 'Adicionar MAT-1 Material 1' });
    const last = screen.getByRole('option', { name: 'Adicionar MAT-2 Material 2' });
    fireEvent.keyDown(search, { key: 'ArrowDown' });
    expect(search).toHaveAttribute('aria-activedescendant', last.id); expect(search).toHaveFocus();
    fireEvent.keyDown(search, { key: 'ArrowDown' }); expect(search).toHaveAttribute('aria-activedescendant', first.id);
    fireEvent.keyDown(search, { key: 'ArrowUp' }); expect(search).toHaveAttribute('aria-activedescendant', last.id);
    fireEvent.keyDown(search, { key: 'ArrowLeft' }); expect(search).toHaveAttribute('aria-activedescendant', last.id);
    fireEvent.keyDown(search, { key: 'Enter' }); expect(input.onProductSelect).toHaveBeenCalledExactlyOnceWith(products[2]);
  });

  it('trocar filtro reinicia no primeiro resultado e hover compartilha uma única seleção', () => {
    const input = props(); const { rerender } = render(<PdvSalePreviewView {...input} />);
    const search = screen.getByRole('combobox'); search.focus();
    fireEvent.pointerMove(screen.getByRole('option', { name: 'Adicionar MAT-2 Material 2' }));
    expect(screen.getAllByRole('option').filter(option => option.getAttribute('aria-selected') === 'true')).toHaveLength(1);
    fireEvent.keyDown(search, { key: 'Enter' }); expect(input.onProductSelect).toHaveBeenCalledExactlyOnceWith(products[2]);
    rerender(<PdvSalePreviewView {...input} search="MAT-1" products={[products[1]]} />);
    expect(search).toHaveAttribute('aria-activedescendant', screen.getByRole('option').id);
  });

  it('compra permite material sem estoque usando o mesmo catálogo e busca', () => {
    const input = props(); render(<PdvSalePreviewView {...input} title="Nova compra" allowUnavailableProducts />);
    const search = screen.getByRole('combobox'); search.focus(); fireEvent.keyDown(search, { key: 'Enter' });
    expect(input.onProductSelect).toHaveBeenCalledExactlyOnceWith(products[0]);
  });

  it('não inclui em composição IME, Enter repetido, carregamento, nem quando desabilitado', () => {
    const input = props(); const { rerender } = render(<PdvSalePreviewView {...input} />);
    const search = screen.getByRole('combobox'); search.focus();
    fireEvent.keyDown(search, { key: 'Enter', isComposing: true });
    fireEvent.keyDown(search, { key: 'Enter', repeat: true });
    fireEvent.compositionStart(search); fireEvent.keyDown(search, { key: 'Enter' }); fireEvent.compositionEnd(search);
    rerender(<PdvSalePreviewView {...input} catalogLoading />); fireEvent.keyDown(search, { key: 'Enter' });
    rerender(<PdvSalePreviewView {...input} disabled />); fireEvent.keyDown(search, { key: 'Enter' });
    expect(input.onProductSelect).not.toHaveBeenCalled(); expect(input.onSearchKeyDown).not.toHaveBeenCalled();
  });

  it('preserva multiplicador do controlador no Enter em vez de incluir duas vezes', () => {
    const input = props(); const onSearchConfirm = vi.fn(); render(<PdvSalePreviewView {...input} onSearchConfirm={onSearchConfirm} />);
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Enter' });
    expect(onSearchConfirm).toHaveBeenCalledExactlyOnceWith(products[1]); expect(input.onProductSelect).not.toHaveBeenCalled();
  });

  it('rajada HID é capturada uma vez e não duplica pelo Enter do catálogo', () => {
    const input = props(); const onScan = vi.fn();
    function Connected() { useBarcodeScanner({ onScan, shouldCaptureTarget: target => canCapturePdvCatalogScan(target, input.searchInputRef.current) }); return <PdvSalePreviewView {...input} />; }
    render(<Connected />); const search = screen.getByRole('combobox'); search.focus();
    act(() => { [...'12345678', 'Enter'].forEach((key, index) => { const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }); Object.defineProperty(event, 'timeStamp', { value: 100 + index * 8 }); search.dispatchEvent(event); }); });
    expect(onScan).toHaveBeenCalledExactlyOnceWith('12345678'); expect(input.onProductSelect).not.toHaveBeenCalled();
  });
});


describe('foco inicial compartilhado do atendimento', () => {
  function controlFrame() {
    let callback: FrameRequestCallback | undefined;
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(next => { callback = next; return 1; });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => { callback = undefined; });
    return () => { act(() => { const current = callback; callback = undefined; current?.(0); }); };
  }
  it('leva o foco do botão de entrada à busca somente no desktop', () => {
    vi.stubGlobal('innerWidth', 1280); const flush = controlFrame(); const input = props();
    const { unmount } = render(<button type="button">Nova venda</button>); screen.getByRole('button').focus();
    render(<PdvSalePreviewView {...input} />); flush(); expect(screen.getByRole('combobox')).toHaveFocus(); unmount();
  });
  it('aguarda carregar o catálogo antes de focar a busca', () => {
    vi.stubGlobal('innerWidth', 1280); const flush = controlFrame(); const input = props();
    const { rerender } = render(<PdvSalePreviewView {...input} catalogLoading />); flush(); expect(screen.getByRole('combobox')).not.toHaveFocus();
    rerender(<PdvSalePreviewView {...input} />); flush(); expect(screen.getByRole('combobox')).toHaveFocus();
  });
  it('não abre o teclado automaticamente no celular', () => {
    vi.stubGlobal('innerWidth', 390); const flush = controlFrame(); render(<PdvSalePreviewView {...props()} />); flush(); expect(screen.getByRole('combobox')).not.toHaveFocus();
  });
  it('preserva controle já ativo no carrinho', () => {
    vi.stubGlobal('innerWidth', 1280); const flush = controlFrame(); render(<PdvSalePreviewView {...props()} cart={<input aria-label="Quantidade no carrinho" />} />);
    const quantity = screen.getByRole('textbox', { name: 'Quantidade no carrinho' }); quantity.focus(); flush(); expect(quantity).toHaveFocus();
  });
  it('preserva formulário externo e diálogo que cobre a tela', () => {
    vi.stubGlobal('innerWidth', 1280); const flush = controlFrame(); const { rerender } = render(<><input aria-label="Cliente em edição" /><PdvSalePreviewView {...props()} /></>);
    const customer = screen.getByRole('textbox', { name: 'Cliente em edição' }); customer.focus(); flush(); expect(customer).toHaveFocus();
    rerender(<><div role="dialog" data-state="open"><button type="button">Confirmar</button></div><PdvSalePreviewView {...props()} key="new" /></>);
    const confirm = screen.getByRole('button', { name: 'Confirmar' }); confirm.focus(); flush(); expect(confirm).toHaveFocus();
  });
});


describe('navegação em área livre da tela', () => {
  it.each(['Nova venda', 'Nova compra', 'Criar orçamento'].flatMap(title => ['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight'].map(key => ({title, key}))))('$title: $key começa fora da busca, faz a volta e Enter inclui uma vez', async ({title,key}) => {
    const input = props(); render(<PdvSalePreviewView {...input} title={title} search="" />);
    const search = screen.getByRole('combobox'); const grid = screen.getByRole('listbox'); search.blur();
    fireEvent.keyDown(document.body, { key: 'Enter' }); expect(input.onProductSelect).not.toHaveBeenCalled();
    fireEvent.keyDown(document.body, { key });
    const firstIndex = ['ArrowUp', 'ArrowLeft'].includes(key) ? 2 : 1;
    expect(grid).toHaveFocus(); expect(grid).toHaveAttribute('aria-activedescendant', screen.getByRole('option', {name:`Adicionar MAT-${firstIndex} Material ${firstIndex}`}).id);
    fireEvent.keyDown(grid, {key}); fireEvent.keyDown(grid, {key});
    expect(grid).toHaveAttribute('aria-activedescendant', screen.getByRole('option', {name:`Adicionar MAT-${firstIndex} Material ${firstIndex}`}).id);
    fireEvent.keyDown(grid, {key:'Enter'}); expect(input.onProductSelect).toHaveBeenCalledExactlyOnceWith(products[firstIndex]);
    await waitFor(() => expect(search).toHaveFocus());
    expect(input.onSearchKeyDown).not.toHaveBeenCalled(); expect(input.onGridKeyDown).not.toHaveBeenCalled();
  });

  it('aceita o título como área livre e mantém as quatro setas na grade com pesquisa preenchida', async () => {
    const input = props(); const onSearchConfirm = vi.fn(); render(<PdvSalePreviewView {...input} onSearchConfirm={onSearchConfirm} />);
    const search = screen.getByRole('combobox'); const grid = screen.getByRole('listbox'); search.blur();
    fireEvent.keyDown(screen.getByRole('heading', {name:'Nova venda'}), {key:'ArrowRight'});
    expect(grid).toHaveFocus(); expect(grid).toHaveAttribute('aria-activedescendant', screen.getByRole('option', {name:'Adicionar MAT-2 Material 2'}).id);
    fireEvent.keyDown(grid, {key:'ArrowLeft'}); expect(grid).toHaveAttribute('aria-activedescendant', screen.getByRole('option', {name:'Adicionar MAT-1 Material 1'}).id);
    fireEvent.keyDown(grid, {key:'ArrowUp'}); expect(grid).toHaveAttribute('aria-activedescendant', screen.getByRole('option', {name:'Adicionar MAT-2 Material 2'}).id);
    fireEvent.keyDown(grid, {key:'ArrowDown'}); expect(grid).toHaveAttribute('aria-activedescendant', screen.getByRole('option', {name:'Adicionar MAT-1 Material 1'}).id);
    fireEvent.keyDown(grid, {key:'Enter'}); expect(onSearchConfirm).toHaveBeenCalledExactlyOnceWith(products[1]); expect(input.onProductSelect).not.toHaveBeenCalled();
    await waitFor(() => expect(search).toHaveFocus());
  });

  it('não transforma a escolha automática ou o hover em Enter solto na página', () => {
    const input = props(); render(<PdvSalePreviewView {...input} />); screen.getByRole('combobox').blur();
    fireEvent.keyDown(document.body, {key:'Enter'}); fireEvent.pointerMove(screen.getByRole('option', {name:'Adicionar MAT-2 Material 2'})); fireEvent.keyDown(document.body, {key:'Enter'});
    expect(input.onProductSelect).not.toHaveBeenCalled();
  });

  it('preserva quantidade, seletor de cliente, botões e abas', () => {
    const input = props(); const editKey = vi.fn(); render(<PdvSalePreviewView {...input} search="" cart={<><input aria-label="Quantidade no item" defaultValue="2" onKeyDown={editKey}/><button type="button" role="combobox">Escolher cliente</button><button type="button">Receber</button><button type="button" role="tab">Histórico</button></>} />);
    const quantity = screen.getByRole('textbox', {name:'Quantidade no item'}); quantity.focus();
    ['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Enter'].forEach(key=>fireEvent.keyDown(quantity,{key}));
    expect(quantity).toHaveFocus(); expect(quantity).toHaveValue('2'); expect(editKey).toHaveBeenCalledTimes(5);
    for(const name of ['Escolher cliente','Receber','Histórico']) {const control=screen.getByText(name);control.focus();fireEvent.keyDown(control,{key:'ArrowDown'});fireEvent.keyDown(control,{key:'Enter'});expect(control).toHaveFocus();}
    expect(input.onProductSelect).not.toHaveBeenCalled(); expect(screen.getByRole('combobox',{name:'Buscar material por nome ou código'})).not.toHaveAttribute('aria-activedescendant');
  });

  it.each(['dialog','alertdialog','menu','listbox'])('pausa com %s aberto em portal, mesmo quando o foco está no body', role => {
    const input=props();render(<PdvSalePreviewView {...input} search="" />);screen.getByRole('combobox').blur();
    const overlay=document.createElement('div');overlay.setAttribute('role',role);overlay.setAttribute('data-state','open');document.body.appendChild(overlay);
    try{fireEvent.keyDown(document.body,{key:'ArrowDown'});fireEvent.keyDown(document.body,{key:'Enter'});expect(input.onProductSelect).not.toHaveBeenCalled();expect(screen.getByRole('combobox')).not.toHaveAttribute('aria-activedescendant');}
    finally{overlay.remove();}
  });

  it('permite a tela de orçamento em diálogo pai e pausa para um modal filho', () => {
    const input=props();const {rerender}=render(<div role="dialog" data-state="open"><h2 tabIndex={-1}>Área do orçamento</h2><PdvSalePreviewView {...input} search="" title="Criar orçamento" /></div>);
    const area=screen.getByRole('heading',{name:'Área do orçamento'});area.focus();fireEvent.keyDown(area,{key:'ArrowDown'});
    const grid=screen.getByRole('listbox');expect(grid).toHaveFocus();expect(grid).toHaveAttribute('aria-activedescendant',screen.getByRole('option',{name:'Adicionar MAT-1 Material 1'}).id);
    rerender(<div role="dialog" data-state="open"><h2 tabIndex={-1}>Área do orçamento</h2><PdvSalePreviewView {...input} search="" title="Criar orçamento" /><div role="alertdialog" data-state="open"><button type="button">Confirmar alteração</button></div></div>);
    area.focus();fireEvent.keyDown(area,{key:'ArrowDown'});fireEvent.keyDown(area,{key:'Enter'});
    expect(area).toHaveFocus();expect(input.onProductSelect).not.toHaveBeenCalled();expect(grid).toHaveAttribute('aria-activedescendant',screen.getByRole('option',{name:'Adicionar MAT-1 Material 1'}).id);
  });

  it.each([{repeat:true},{isComposing:true},{keyCode:229},{ctrlKey:true},{metaKey:true},{altKey:true}])('não captura evento reservado na área livre %o', flags => {
    const input=props();render(<PdvSalePreviewView {...input} search="" />);screen.getByRole('combobox').blur();
    fireEvent.keyDown(document.body,{key:'ArrowDown',...flags});fireEvent.keyDown(document.body,{key:'Enter',...flags});expect(input.onProductSelect).not.toHaveBeenCalled();expect(screen.getByRole('combobox')).not.toHaveAttribute('aria-activedescendant');
  });

  it('respeita evento já consumido e usa produtos e callbacks atuais após novo filtro', () => {
    const input=props();const updatedSelect=vi.fn();const {rerender}=render(<PdvSalePreviewView {...input} search="" />);screen.getByRole('combobox').blur();
    const event=new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true,cancelable:true});event.preventDefault();document.body.dispatchEvent(event);expect(screen.getByRole('combobox')).not.toHaveAttribute('aria-activedescendant');
    rerender(<PdvSalePreviewView {...input} search="MAT-2" products={[products[2]]} onProductSelect={updatedSelect} />);screen.getByRole('combobox').blur();
    fireEvent.keyDown(document.body,{key:'ArrowDown'});fireEvent.keyDown(screen.getByRole('listbox'),{key:'Enter'});expect(updatedSelect).toHaveBeenCalledExactlyOnceWith(products[2]);expect(input.onProductSelect).not.toHaveBeenCalled();
  });
});
