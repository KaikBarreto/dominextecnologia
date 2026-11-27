import { useEffect, useState } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';
import { SwipeBackProvider } from './SwipeBack';
import { AppViewport, type AppViewportMode } from './layout/AppViewport';
import { AppRouteTransition } from './layout/AppRouteTransition';

const state = vi.hoisted(() => {
  let resolve!: () => void;
  const ready = new Promise<void>(done => { resolve = done; });
  return { compact: false, ready, resolve, mounts: vi.fn(), unmounts: vi.fn(), loaded: vi.fn() };
});
vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => state.compact }));
vi.mock('./SwipeBackProvider', async () => {
  state.loaded();
  await state.ready;
  const { createElement } = await import('react');
  return { default: () => createElement('span', { 'data-testid': 'swipe-controller' }) };
});
function Form() {
  const [quantity, setQuantity] = useState('1');
  useEffect(() => { state.mounts(); return () => { state.unmounts(); }; }, []);
  return <input aria-label="Quantidade do orçamento" value={quantity} onChange={event => setQuantity(event.target.value)} />;
}
function Tree({ mode, owner = 'user-1:company-1' }: { mode: AppViewportMode; owner?: string }) {
  return <MemoryRouter initialEntries={['/pdv/orcamentos']}><SwipeBackProvider><AppViewport
    mode={mode} sidebarPinnedOpen={false} sidebar={null} header={null} notices={null} desktopFooter={null} mobileFooter={null}
    bottomNavigation={null} onRefresh={() => {}} scrollResetKey={owner}
  ><AppRouteTransition ownerKey={owner}><Form /></AppRouteTransition></AppViewport></SwipeBackProvider></MemoryRouter>;
}

it('preserva o editor ao cruzar breakpoints e carregar o controlador lazy; limpa ao trocar empresa', async () => {
  vi.stubGlobal('scrollTo', vi.fn());
  const { rerender } = render(<Tree mode="sidebar" />);
  const input = screen.getByRole('textbox', { name: 'Quantidade do orçamento' });
  fireEvent.change(input, { target: { value: '3.5' } });
  expect(state.loaded).not.toHaveBeenCalled();
  state.compact = true;
  rerender(<Tree mode="compact" />);
  expect(screen.getByRole('textbox')).toBe(input);
  expect(screen.getByRole('textbox')).toHaveValue('3.5');
  expect(screen.queryByTestId('swipe-controller')).not.toBeInTheDocument();
  await act(async () => { state.resolve(); await state.ready; });
  expect(screen.getByTestId('swipe-controller')).toBeInTheDocument();
  expect(screen.getByRole('textbox')).toBe(input);
  for (const mode of ['sidebar', 'compact', 'topbar', 'compact', 'sidebar'] as const) {
    state.compact = mode === 'compact'; rerender(<Tree mode={mode} />);
    expect(screen.getByRole('textbox')).toBe(input);
    expect(input).toHaveValue('3.5');
    expect(screen.getAllByRole('main')).toHaveLength(1);
  }
  expect(state.mounts).toHaveBeenCalledTimes(1);
  expect(state.unmounts).not.toHaveBeenCalled();
  rerender(<Tree mode="sidebar" owner="user-1:company-2" />);
  expect(screen.getByRole('textbox')).not.toBe(input);
  expect(screen.getByRole('textbox')).toHaveValue('1');
  expect(state.mounts).toHaveBeenCalledTimes(2);
});
