import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react/pure';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { PdvOrderSwitcher, type PdvOrderSwitcherItem } from './PdvOrderSwitcher';

const orders: PdvOrderSwitcherItem[] = [
  { id: 'first', code: '#1048', customer: 'Carlos Almeida', total: 123456789.99, itemCount: 2, hasContent: true },
  { id: 'second', code: '#1049', customer: 'Marina Costa', total: 50, itemCount: 1, hasContent: true },
  { id: 'empty', code: '#1050', customer: '', total: 0, itemCount: 0, hasContent: false },
];
const texts = { number: 'Número', value: 'Valor', customer: 'Cliente', newOrder: 'Novo pedido/orçamento', unnamedCustomer: 'Sem cliente', editBadge: 'Editando', deleteLabel: 'Fechar', deleteTitle: 'Fechar atendimento?', deleteDescription: 'Este atendimento ainda tem conteúdo.', keepOrder: 'Continuar atendimento', confirmDelete: 'Fechar atendimento' };
const money = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
function setup() {
  const callbacks = { onCreate: vi.fn(), onSelect: vi.fn(), onDelete: vi.fn(), onReorder: vi.fn() };
  render(<TooltipProvider><PdvOrderSwitcher orders={orders} activeId="first" texts={texts} formatCurrency={money} {...callbacks} /></TooltipProvider>);
  return callbacks;
}

describe('abas reais dos atendimentos do PDV', () => {
  it('mostra pessoa, código e valor completo e mantém novo atendimento depois das abas', () => {
    const { onCreate } = setup();
    expect(screen.getAllByRole('tab')).toHaveLength(3);
    expect(screen.getByRole('tab', { selected: true })).toHaveTextContent('Carlos Almeida');
    expect(screen.getByText(/123\.456\.789,99/)).toBeVisible();
    const list = screen.getByRole('tablist');
    expect(list.nextElementSibling?.firstElementChild).toBe(screen.getByRole('button', { name: texts.newOrder }));
    expect(screen.queryByRole('button', { name: /atendimentos abertos/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: texts.newOrder }));
    expect(onCreate).toHaveBeenCalledOnce();
  });
  it('fecha vazio diretamente e confirma conteúdo antes de fechar', () => {
    const { onDelete } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Fechar: #1050' }));
    expect(onDelete).toHaveBeenCalledWith('empty');
    onDelete.mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'Fechar: #1048' }));
    expect(onDelete).not.toHaveBeenCalled();
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: texts.keepOrder }));
    expect(onDelete).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Fechar: #1048' }));
    expect(within(screen.getByRole('alertdialog')).getByRole('button', { name: texts.confirmDelete })).toHaveFocus();
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: texts.confirmDelete }));
    expect(onDelete).toHaveBeenCalledWith('first');
  });
  it('navega circularmente pelo teclado sem misturar os pedidos', () => {
    const { onSelect } = setup();
    const first = screen.getByRole('tab', { selected: true });
    act(() => first.focus()); fireEvent.keyDown(first, { key: 'ArrowLeft' });
    expect(onSelect).toHaveBeenLastCalledWith('empty');
    expect(screen.getAllByRole('tab')[2]).toHaveFocus();
    fireEvent.keyDown(screen.getAllByRole('tab')[2], { key: 'Home' });
    expect(onSelect).toHaveBeenLastCalledWith('first');
  });
  it('arrasta identidades preservando pessoa, valor e pedido ativo', () => {
    const { onReorder } = setup();
    const first = screen.getByRole('tab', { selected: true }).parentElement!;
    const last = screen.getAllByRole('tab')[2].parentElement!;
    fireEvent.dragStart(first, { dataTransfer: { setData: vi.fn(), effectAllowed: 'move' } });
    fireEvent.drop(last);
    expect(onReorder).toHaveBeenCalledWith(['second', 'empty', 'first']);
    expect(screen.getAllByRole('tab')[2]).toHaveTextContent('Carlos Almeida');
    expect(screen.getAllByRole('tab')[2]).toHaveTextContent(/R\$\s123\.456\.789,99/);
    expect(screen.getAllByRole('tab')[2]).toHaveAttribute('aria-selected', 'true');
  });
  it('lembra só a ordem dos IDs e isola a preferência entre caixas', () => {
    localStorage.clear();
    const props = { orders, activeId: 'first', texts, formatCurrency: money, onCreate: vi.fn(), onSelect: vi.fn(), onDelete: vi.fn() };
    const view = render(<TooltipProvider><PdvOrderSwitcher {...props} orderPreferenceKey="company:user:cash-1" /></TooltipProvider>);
    const first = screen.getAllByRole('tab')[0].parentElement!, last = screen.getAllByRole('tab')[2].parentElement!;
    fireEvent.dragStart(first, { dataTransfer: { setData: vi.fn(), effectAllowed: 'move' } }); fireEvent.drop(last);
    expect(JSON.parse(localStorage.getItem('company:user:cash-1')!)).toEqual(['second', 'empty', 'first']);
    view.rerender(<TooltipProvider><PdvOrderSwitcher {...props} orderPreferenceKey="company:user:cash-2" /></TooltipProvider>);
    expect(screen.getAllByRole('tab')[0]).toHaveTextContent('Carlos Almeida');
    view.rerender(<TooltipProvider><PdvOrderSwitcher {...props} orderPreferenceKey="company:user:cash-1" /></TooltipProvider>);
    expect(screen.getAllByRole('tab')[2]).toHaveTextContent('Carlos Almeida');
  });
});


// Real layout cannot be computed by jsdom; model content/viewport widths independently.
async function measuredStrip(activeId = 'first') {
  const observers: ResizeObserverCallback[] = [];
  vi.stubGlobal('ResizeObserver', class {
    constructor(callback: ResizeObserverCallback) { observers.push(callback); }
    observe() {} unobserve() {} disconnect() {}
  });
  const callbacks = { onSelect: vi.fn(), onCreate: vi.fn(), onDelete: vi.fn(), onReorder: vi.fn() };
  const props = { orders, texts, formatCurrency: money, ...callbacks };
  const view = render(<TooltipProvider><PdvOrderSwitcher {...props} activeId={activeId} /></TooltipProvider>);
  const strip = screen.getByRole('tablist'), root = strip.parentElement!;
  const geometry = { outer: 600, viewport: 430, content: 720 };
  Object.defineProperty(root, 'clientWidth', { configurable: true, get: () => geometry.outer });
  Object.defineProperty(strip, 'clientWidth', { configurable: true, get: () => geometry.viewport });
  Object.defineProperty(strip, 'scrollWidth', { configurable: true, get: () => geometry.content });
  strip.getBoundingClientRect = () => ({ left: 0, right: geometry.viewport } as DOMRect);
  screen.getAllByRole('tab').forEach((tab, index) => {
    tab.parentElement!.getBoundingClientRect = () => ({ left: index * 240 - strip.scrollLeft, right: (index + 1) * 240 - strip.scrollLeft } as DOMRect);
  });
  // Browser scroll events arrive after layout; firing one reentrantly inside a layout effect breaks act ownership.
  const scrollTo = vi.fn((options: ScrollToOptions) => { strip.scrollLeft = Number(options.left); });
  Object.defineProperty(strip, 'scrollTo', { configurable: true, value: scrollTo });
  const measure = async () => { await act(async () => { observers.forEach(callback => callback([], {} as ResizeObserver)); }); };
  await measure();
  return { ...callbacks, geometry, strip, root, scrollTo, measure,
    activate: async (id: string) => { await act(async () => { view.rerender(<TooltipProvider><PdvOrderSwitcher {...props} activeId={id} /></TooltipProvider>); }); },
    disable: async () => { await act(async () => { view.rerender(<TooltipProvider><PdvOrderSwitcher {...props} activeId={activeId} disabled /></TooltipProvider>); }); } };
}
beforeEach(() => { vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); });
afterEach(async () => {
  // Drain positioning/focus work while mounted, then unmount before restoring browser mocks.
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
  await act(async () => { cleanup(); });
  vi.unstubAllGlobals(); vi.restoreAllMocks();
});

describe('overflow das abas sem perder o atendimento', () => {
  it('mostra controles somente quando precisa e sai do overflow pelo espaço natural, mesmo perto do limite', async () => {
    const ui = await measuredStrip();
    expect(ui.root).toHaveAttribute('data-overflow', 'true');
    expect(screen.getByRole('button', { name: 'Ver atendimentos anteriores' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Ver próximos atendimentos' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Ver próximos atendimentos' }));
    fireEvent.scroll(ui.strip);
    expect(ui.strip.scrollLeft).toBe(290);
    expect(screen.getByRole('button', { name: 'Ver próximos atendimentos' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Ver atendimentos anteriores' })).toBeEnabled();
    // 720px of tabs + 36px of new button + padding/gap now fit WITHOUT extra controls.
    ui.geometry.outer = 800; await ui.measure();
    expect(ui.root).not.toHaveAttribute('data-overflow');
    expect(screen.queryByRole('button', { name: /atendimentos abertos/ })).not.toBeInTheDocument();
    expect(ui.strip.scrollLeft).toBe(0);
    ui.geometry.outer = 600; await ui.measure();
    expect(ui.root).toHaveAttribute('data-overflow', 'true');
  });
  it('revela a aba ativa fora da faixa sem tirar foco da busca nem rolar a página', async () => {
    const ui = await measuredStrip();
    const input = document.createElement('input'); document.body.append(input); await act(async () => { input.focus(); });
    await ui.activate('empty');
    expect(ui.scrollTo).toHaveBeenLastCalledWith({ left: 290, behavior: 'smooth' });
    expect(input).toHaveFocus();
    await ui.activate('first');
    expect(ui.scrollTo).toHaveBeenLastCalledWith({ left: 0, behavior: 'smooth' });
    expect(input).toHaveFocus(); await act(async () => { input.remove(); });
  });
  it('pesquisa cliente e código, mostra valor completo e seleciona sem devolver foco ao botão da lista', async () => {
    const ui = await measuredStrip();
    // cmdk scrolls its own options (never the strip/page); no browser layout in jsdom.
    Element.prototype.scrollIntoView = vi.fn();
    fireEvent.click(screen.getByRole('button', { name: 'Ver 3 atendimentos abertos' }));
    const search = await screen.findByRole('combobox', { name: 'Buscar atendimento por cliente ou código' });
    expect(screen.getByLabelText('Atendimento atual')).toBeInTheDocument();
    expect(within(screen.getByRole('listbox')).getByText(/123\.456\.789,99/)).toBeVisible();
    fireEvent.change(search, { target: { value: 'MARINA' } });
    expect(screen.getAllByRole('option')).toHaveLength(1);
    expect(screen.getByRole('option')).toHaveTextContent('Marina Costa');
    fireEvent.change(search, { target: { value: '#1050' } });
    expect(screen.getByRole('option')).toHaveTextContent('Sem cliente');
    fireEvent.click(screen.getByRole('option'));
    expect(ui.onSelect).toHaveBeenCalledWith('empty');
    expect(ui.scrollTo).toHaveBeenLastCalledWith({ left: 290, behavior: 'smooth' });
    expect(screen.getByRole('button', { name: 'Ver 3 atendimentos abertos' })).not.toHaveFocus();
    expect(ui.onDelete).not.toHaveBeenCalled();
  });
  it('mostra busca sem resultados e mantém as abas originais ao limpar', async () => {
    await measuredStrip(); Element.prototype.scrollIntoView = vi.fn();
    fireEvent.click(screen.getByRole('button', { name: 'Ver 3 atendimentos abertos' }));
    const search = await screen.findByRole('combobox', { name: 'Buscar atendimento por cliente ou código' });
    fireEvent.change(search, { target: { value: 'não existe' } });
    expect(screen.getByText('Nenhum atendimento encontrado.')).toBeVisible();
    fireEvent.change(search, { target: { value: '' } });
    expect(screen.getAllByRole('option')).toHaveLength(3);
    expect(screen.getAllByRole('tab')).toHaveLength(3);
  });
  it('reorganiza pelo atalho e impede que setas da aba cheguem ao catálogo global', async () => {
    const ui = await measuredStrip(); const globalKey = vi.fn(); document.addEventListener('keydown', globalKey);
    const first = screen.getByRole('tab', { selected: true });
    fireEvent.keyDown(first, { key: 'ArrowRight', altKey: true, shiftKey: true });
    expect(ui.onReorder).toHaveBeenCalledWith(['second', 'first', 'empty']);
    expect(ui.onSelect).not.toHaveBeenCalled();
    expect(globalKey).not.toHaveBeenCalled();
    expect(screen.getAllByRole('tab')[1]).toHaveTextContent(/123\.456\.789,99/);
    document.removeEventListener('keydown', globalKey);
  });
  it('bloqueia a escolha se o atendimento entra em processamento com a lista já aberta', async () => {
    const ui = await measuredStrip(); Element.prototype.scrollIntoView = vi.fn();
    fireEvent.click(screen.getByRole('button', { name: 'Ver 3 atendimentos abertos' }));
    await screen.findByRole('combobox', { name: 'Buscar atendimento por cliente ou código' });
    await ui.disable();
    const option = screen.getAllByRole('option')[1];
    expect(option).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(option);
    expect(ui.onSelect).not.toHaveBeenCalled();
  });
  it('respeita movimento reduzido ao revelar a nova aba', async () => {
    vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() } as unknown as MediaQueryList);
    const ui = await measuredStrip(); await ui.activate('empty');
    expect(ui.scrollTo).toHaveBeenLastCalledWith({ left: 290, behavior: 'auto' });
  });
});
