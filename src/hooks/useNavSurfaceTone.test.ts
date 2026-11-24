import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { useNavSurfaceTone } from './useNavSurfaceTone';

const root = document.documentElement;

afterEach(() => {
  cleanup();
  root.classList.remove('dark');
  root.removeAttribute('data-nav-theme');
});

describe('useNavSurfaceTone', () => {
  it('segue o tema claro do sistema quando a nav não está forçada', () => {
    const { result } = renderHook(() => useNavSurfaceTone());
    expect(result.current).toBe('light');
  });

  it('considera a preferência de navegação escura', () => {
    root.dataset.navTheme = 'dark';
    const { result } = renderHook(() => useNavSurfaceTone());
    expect(result.current).toBe('dark');
  });

  it('considera o tema escuro do app quando a nav segue o sistema', () => {
    root.classList.add('dark');
    const { result } = renderHook(() => useNavSurfaceTone());
    expect(result.current).toBe('dark');
  });

  it('reage a mudanças feitas por outra tela na mesma aba', async () => {
    const { result } = renderHook(() => useNavSurfaceTone());
    expect(result.current).toBe('light');

    await act(async () => {
      root.dataset.navTheme = 'dark';
      await Promise.resolve();
    });
    expect(result.current).toBe('dark');

    await act(async () => {
      root.removeAttribute('data-nav-theme');
      await Promise.resolve();
    });
    expect(result.current).toBe('light');
  });
});
