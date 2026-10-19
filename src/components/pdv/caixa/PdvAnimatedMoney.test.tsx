import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { usePdvAnimatedNumber } from './usePdvAnimatedNumber';

describe('usePdvAnimatedNumber', () => {
  let nextFrameId = 1;
  let frames: Map<number, FrameRequestCallback>;

  const flushFrame = (now: number) => {
    const queued = Array.from(frames.values());
    frames.clear();
    queued.forEach((callback) => callback(now));
  };

  beforeEach(() => {
    frames = new Map();
    nextFrameId = 1;
    vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => {
      const id = nextFrameId++;
      frames.set(id, callback);
      return id;
    }));
    vi.stubGlobal('cancelAnimationFrame', vi.fn((id: number) => {
      frames.delete(id);
    }));
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false })));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('anima do valor exibido para cima e depois para baixo sem reiniciar em zero', () => {
    const { result, rerender } = renderHook(
      ({ target }) => usePdvAnimatedNumber(target, 1_000),
      { initialProps: { target: 100 } },
    );

    act(() => flushFrame(0));
    act(() => flushFrame(500));
    expect(result.current).toBeGreaterThan(50);
    expect(result.current).toBeLessThan(100);

    act(() => flushFrame(1_000));
    expect(result.current).toBe(100);

    rerender({ target: 40 });
    act(() => flushFrame(2_000));
    expect(result.current).toBe(100);
    act(() => flushFrame(2_500));
    expect(result.current).toBeGreaterThan(40);
    expect(result.current).toBeLessThan(100);
    act(() => flushFrame(3_000));
    expect(result.current).toBe(40);
  });

  it('salta direto para o alvo quando o usuario reduz movimento', () => {
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true })));

    const { result } = renderHook(() => usePdvAnimatedNumber(318.47));

    expect(result.current).toBe(318.47);
    expect(requestAnimationFrame).not.toHaveBeenCalled();
  });
});
