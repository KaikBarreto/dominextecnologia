import { useEffect, useState } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppViewport, type AppViewportMode } from './AppViewport';
import { AppRouteTransition } from './AppRouteTransition';
import { useSidebar } from '@/components/ui/sidebar';

const state = vi.hoisted(() => ({ compact: false, mounts: vi.fn(), unmounts: vi.fn() }));
vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => state.compact }));

function Editor() {
  const [text, setText] = useState('');
  const [quantity, setQuantity] = useState('1');
  const navigate = useNavigate();
  useEffect(() => { state.mounts(); return () => { state.unmounts(); }; }, []);
  return <>
    <input aria-label="Texto do atendimento" value={text} onChange={event => setText(event.target.value)} />
    <input aria-label="Quantidade" value={quantity} onChange={event => setQuantity(event.target.value)} />
    <button onClick={() => navigate('/clientes/customer-1')}>Abrir ficha</button>
    <button onClick={() => navigate('/estoque')}>Outra tela</button>
  </>;
}
function SidebarState() {
  const sidebar = useSidebar();
  return <aside aria-label="Menu lateral"><span>{sidebar.open ? 'Menu expandido' : 'Menu recolhido'}</span></aside>;
}
function SidebarControl() {
  const sidebar = useSidebar();
  return <button onClick={() => sidebar.setOpen(false)}>Forçar recolhimento</button>;
}
function Tree({ mode, owner = 'user-1:company-1', sidebarPinnedOpen = false }: { mode: AppViewportMode; owner?: string; sidebarPinnedOpen?: boolean }) {
  return <MemoryRouter initialEntries={['/clientes']}><AppViewport
    mode={mode}
    sidebarPinnedOpen={sidebarPinnedOpen}
    sidebar={<SidebarState />}
    header={<header>{mode === 'compact' ? 'Cabeçalho móvel' : mode === 'topbar' ? 'Menu superior' : 'Cabeçalho desktop'}<SidebarControl /></header>}
    subscriptionNotice={<p>Vigência da assinatura</p>}
    notices={<p>Avisos do sistema</p>}
    desktopFooter={<footer>Rodapé desktop</footer>}
    mobileFooter={<footer>Rodapé móvel</footer>}
    bottomNavigation={<nav aria-label="Menu inferior">Navegação móvel</nav>}
    onRefresh={vi.fn()}
    scrollResetKey={owner}
  ><AppRouteTransition ownerKey={owner}><Editor /></AppRouteTransition></AppViewport></MemoryRouter>;
}

beforeEach(() => {
  state.compact = false; vi.clearAllMocks();
  vi.stubGlobal('scrollTo', vi.fn());
});

describe('AppViewport — conteúdo estável na mudança de apresentação', () => {
  it('preserva o mesmo formulário e quantidades entre sidebar, mobile, topbar e retorno', () => {
    const { rerender } = render(<Tree mode="sidebar" />);
    const input = screen.getByRole('textbox', { name: 'Texto do atendimento' });
    fireEvent.change(input, { target: { value: 'Orçamento da loja' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Quantidade' }), { target: { value: '3.5' } });
    expect(screen.getAllByRole('main')).toHaveLength(1);
    expect(screen.getByText('Rodapé desktop')).toBeInTheDocument();
    for (const mode of ['compact', 'topbar', 'sidebar'] as const) {
      state.compact = mode === 'compact'; rerender(<Tree mode={mode} />);
      expect(screen.getByRole('textbox', { name: 'Texto do atendimento' })).toBe(input);
      expect(input).toHaveValue('Orçamento da loja');
      expect(screen.getByRole('textbox', { name: 'Quantidade' })).toHaveValue('3.5');
      expect(screen.getAllByRole('main')).toHaveLength(1);
      expect(screen.getByText('Avisos do sistema')).toBeInTheDocument();
      if (mode === 'compact') {
        expect(screen.getByText('Cabeçalho móvel')).toBeInTheDocument();
        expect(screen.getByRole('navigation', { name: 'Menu inferior' })).toBeInTheDocument();
        expect(screen.getByText('Rodapé móvel')).toBeInTheDocument();
        expect(screen.queryByText('Rodapé desktop')).not.toBeInTheDocument();
      } else {
        expect(screen.getByText('Rodapé desktop')).toBeInTheDocument();
        expect(screen.queryByRole('navigation', { name: 'Menu inferior' })).not.toBeInTheDocument();
      }
    }
    expect(state.mounts).toHaveBeenCalledTimes(1);
    expect(state.unmounts).not.toHaveBeenCalled();
  });

  it.each(['user-2:company-1', 'user-1:company-2'])('descarta o formulário quando o owner muda para %s', owner => {
    const { rerender } = render(<Tree mode="sidebar" />);
    const previous = screen.getByRole('textbox', { name: 'Texto do atendimento' });
    fireEvent.change(previous, { target: { value: 'Dados da conta anterior' } });
    rerender(<Tree mode="sidebar" owner={owner} />);
    expect(screen.getByRole('textbox', { name: 'Texto do atendimento' })).not.toBe(previous);
    expect(screen.getByRole('textbox', { name: 'Texto do atendimento' })).toHaveValue('');
    expect(state.mounts).toHaveBeenCalledTimes(2);
    expect(state.unmounts).toHaveBeenCalledTimes(1);
  });

  it('mantém lista → ficha na mesma tela e limpa ao navegar para outra tela', () => {
    render(<Tree mode="sidebar" />);
    fireEvent.change(screen.getByRole('textbox', { name: 'Texto do atendimento' }), { target: { value: 'Ainda em Clientes' } });
    fireEvent.click(screen.getByRole('button', { name: 'Abrir ficha' }));
    expect(screen.getByRole('textbox', { name: 'Texto do atendimento' })).toHaveValue('Ainda em Clientes');
    expect(state.mounts).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Outra tela' }));
    expect(screen.getByRole('textbox', { name: 'Texto do atendimento' })).toHaveValue('');
    expect(state.mounts).toHaveBeenCalledTimes(2);
  });

  it('desliga Ctrl+B fora da sidebar e preserva a escolha desktop ao voltar', () => {
    const { rerender } = render(<Tree mode="sidebar" />);
    const desktop = new KeyboardEvent('keydown', { key: 'b', ctrlKey: true, cancelable: true });
    act(() => window.dispatchEvent(desktop));
    expect(desktop.defaultPrevented).toBe(true);
    expect(screen.getByText('Menu expandido')).toBeInTheDocument();
    for (const mode of ['compact', 'topbar'] as const) {
      state.compact = mode === 'compact'; rerender(<Tree mode={mode} />);
      const event = new KeyboardEvent('keydown', { key: 'b', ctrlKey: true, cancelable: true });
      act(() => window.dispatchEvent(event));
      expect(event.defaultPrevented).toBe(false);
    }
    state.compact = false; rerender(<Tree mode="sidebar" />);
    expect(screen.getByText('Menu expandido')).toBeInTheDocument();
  });

  it('mantém recolhido por padrão e só aplica a fixação no shell lateral', () => {
    const { rerender } = render(<Tree mode="sidebar" />);
    expect(screen.getByText('Menu recolhido')).toBeInTheDocument();
    rerender(<Tree mode="sidebar" sidebarPinnedOpen />);
    expect(screen.getByText('Menu expandido')).toBeInTheDocument();
    state.compact = true; rerender(<Tree mode="compact" />);
    fireEvent.click(screen.getByRole('button', { name: 'Forçar recolhimento' }));
    state.compact = false; rerender(<Tree mode="topbar" />);
    fireEvent.click(screen.getByRole('button', { name: 'Forçar recolhimento' }));
    rerender(<Tree mode="sidebar" />);
    expect(screen.getByText('Menu recolhido')).toBeInTheDocument();
  });

  it('não cria containing block por transform no desktop', () => {
    const { container, rerender } = render(<Tree mode="sidebar" />);
    const main = screen.getByRole('main');
    expect(main.parentElement).toHaveClass('contents');
    expect(main.parentElement?.style.transform).toBe('');
    expect(container.querySelector('[data-scroll-container]')).toHaveClass('contents');
    state.compact = true; rerender(<Tree mode="compact" />);
    expect(main.parentElement?.style.transform).toBe('translateY(0px)');
  });

  it('reserva espaço físico para a navegação inferior dentro do conteúdo rolável', () => {
    state.compact = true;
    const { container } = render(<Tree mode="compact" />);
    const main = screen.getByRole('main');
    const contentWrapper = main.parentElement!;
    const scroller = container.querySelector<HTMLDivElement>('[data-scroll-container]')!;

    expect(scroller).toHaveClass('overflow-y-auto');
    expect(scroller).toHaveClass('scroll-pb-[calc(8rem+env(safe-area-inset-bottom))]');
    expect(contentWrapper).toHaveClass('pb-[calc(8rem+env(safe-area-inset-bottom))]');
    expect(main).not.toHaveClass('pb-[calc(8rem+env(safe-area-inset-bottom))]');
  });

  it('transfere a rolagem entre os containers sem perder a posição', () => {
    const { container, rerender } = render(<Tree mode="sidebar" />);
    const main = screen.getByRole('main');
    const mobileScroller = container.querySelector<HTMLDivElement>('[data-scroll-container]')!;
    main.scrollTop = 120;
    fireEvent.scroll(main);
    state.compact = true; rerender(<Tree mode="compact" />);
    expect(mobileScroller.scrollTop).toBe(120);
    mobileScroller.scrollTop = 44;
    fireEvent.scroll(mobileScroller);
    state.compact = false; rerender(<Tree mode="sidebar" />);
    expect(main.scrollTop).toBe(44);
    rerender(<Tree mode="sidebar" owner="user-1:company-2" />);
    expect(main.scrollTop).toBe(0);
  });

  it('cancela o gesto de atualizar ao ir para desktop e mantém os mesmos nós', () => {
    state.compact = true;
    const { container, rerender } = render(<Tree mode="compact" />);
    const main = screen.getByRole('main');
    const wrapper = main.parentElement!;
    const scroller = container.querySelector<HTMLDivElement>('[data-scroll-container]')!;
    fireEvent.touchStart(scroller, { touches: [{ clientY: 100 }] });
    fireEvent.touchMove(scroller, { touches: [{ clientY: 180 }] });
    expect(wrapper.style.transform).toBe('translateY(40px)');
    state.compact = false; rerender(<Tree mode="sidebar" />);
    expect(main.parentElement).toBe(wrapper);
    expect(wrapper.style.transform).toBe('');
    state.compact = true; rerender(<Tree mode="compact" />);
    expect(main.parentElement).toBe(wrapper);
    expect(wrapper.style.transform).toBe('translateY(0px)');
    fireEvent.touchMove(scroller, { touches: [{ clientY: 200 }] });
    expect(wrapper.style.transform).toBe('translateY(0px)');
  });
});
