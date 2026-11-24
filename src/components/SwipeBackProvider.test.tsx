import { useRef } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, afterEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import SwipeBackMotion from './SwipeBackProvider';

const state = vi.hoisted(() => {
  const stop = vi.fn();
  const completions: (() => void)[] = [];
  return { stop, completions, navigate: vi.fn(), animate: vi.fn((_value: unknown, _to: number, options: { onComplete?: () => void }) => {
    if (options.onComplete) completions.push(options.onComplete);
    return { stop };
  }) };
});
vi.mock('react-router-dom', () => ({ useNavigate: () => state.navigate }));
vi.mock('framer-motion', async importOriginal => ({ ...await importOriginal<typeof import('framer-motion')>(), animate: state.animate }));

function Tree({ controller = true }: { controller?: boolean }) {
  const targetRef = useRef<HTMLDivElement>(null);
  return <div ref={targetRef} data-testid="target"><input aria-label="Campo" />{controller ? <SwipeBackMotion targetRef={targetRef} /> : null}</div>;
}
function start() {
  fireEvent.touchStart(document, { touches: [{ clientX: 10, clientY: 100 }] });
}
function move(clientX: number) {
  fireEvent.touchMove(document, { touches: [{ clientX, clientY: 100 }] });
}
function end(clientX: number) {
  fireEvent.touchEnd(document, { changedTouches: [{ clientX, clientY: 100 }] });
}
let now: MockInstance<() => number>;
beforeEach(() => {
  vi.clearAllMocks(); state.completions.length = 0;
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true })));
  vi.spyOn(window.history, 'length', 'get').mockReturnValue(2);
  now = vi.spyOn(Date, 'now').mockReturnValue(1000);
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('Controlador swipe-back sobre alvo estável', () => {
  it('mantém cancelamento e confirmação do gesto no PWA e remove transform ao zerar', () => {
    render(<Tree />);
    const target = screen.getByTestId('target');
    expect(target.style.transform).toBe('');
    start(); move(30); now.mockReturnValue(2000); end(30);
    expect(state.animate).toHaveBeenLastCalledWith(expect.anything(), 0, expect.objectContaining({ type: 'spring' }));
    expect(state.navigate).not.toHaveBeenCalled();
    start(); move(800); end(800);
    expect(target.style.transform).toBe('translateX(790px)');
    expect(state.completions).toHaveLength(1);
    act(() => state.completions[0]());
    expect(state.navigate).toHaveBeenCalledWith(-1);
    expect(target.style.transform).toBe('');
  });

  it('interrompe animação pendente e impede navegação após desmontar o controlador', () => {
    const { rerender } = render(<Tree />);
    const target = screen.getByTestId('target');
    start(); move(800); end(800);
    const complete = state.completions[0];
    rerender(<Tree controller={false} />);
    expect(screen.getByTestId('target')).toBe(target);
    expect(state.stop).toHaveBeenCalled();
    expect(target.style.transform).toBe('');
    act(() => complete());
    expect(state.navigate).not.toHaveBeenCalled();
  });

  it('respeita bloqueio por modal, campo em foco e navegador fora do PWA', () => {
    render(<Tree />);
    const target = screen.getByTestId('target');
    const modal = document.createElement('div'); modal.dataset.state = 'open'; document.body.appendChild(modal);
    start(); move(800); end(800); modal.remove();
    expect(target.style.transform).toBe('');
    const input = screen.getByRole('textbox'); input.focus();
    start(); move(800); end(800); input.blur();
    expect(target.style.transform).toBe('');
    vi.mocked(window.matchMedia).mockReturnValue({ matches: false } as MediaQueryList);
    start(); move(800); end(800);
    expect(state.animate).not.toHaveBeenCalled();
    expect(state.navigate).not.toHaveBeenCalled();
  });
});
