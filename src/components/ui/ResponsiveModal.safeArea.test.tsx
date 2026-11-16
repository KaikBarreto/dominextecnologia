import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ResponsiveModal } from './ResponsiveModal';

vi.mock('@/hooks/use-mobile', () => ({ useIsCompact: () => false }));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('ResponsiveModal fullscreen', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    document.body.innerHTML = '';
  });

  it('mantem a saida abaixo da safe area superior e respeita as laterais', () => {
    act(() => {
      root.render(
        <ResponsiveModal open onOpenChange={() => undefined} title="Criar OS" fullScreen>
          <p>Conteúdo</p>
        </ResponsiveModal>,
      );
    });

    const header = document.querySelector('[data-fullscreen-header]');

    expect(header).not.toBeNull();
    expect(header?.className).toContain('pt-[calc(env(safe-area-inset-top)+0.75rem)]');
    expect(header?.className).toContain('pl-[calc(env(safe-area-inset-left)+1rem)]');
    expect(header?.className).toContain('pr-[calc(env(safe-area-inset-right)+1rem)]');
    expect(document.querySelector('button[aria-label="Sair"]')).not.toBeNull();
  });
});
