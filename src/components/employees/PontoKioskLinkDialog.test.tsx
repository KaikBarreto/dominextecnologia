import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { PontoKioskMobileShortcut } from './PontoKioskLinkDialog';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('PontoKioskMobileShortcut', () => {
  it('explica o ponto em grupo e abre o modal ao toque', () => {
    const onOpen = vi.fn();

    act(() => {
      root.render(
        <PontoKioskMobileShortcut
          title="Ponto em grupo (quiosque)"
          description="Abra, copie ou compartilhe o link do ponto da equipe"
          onOpen={onOpen}
        />,
      );
    });

    const button = container.querySelector('button');
    expect(button).not.toBeNull();
    expect(button?.textContent).toContain('Ponto em grupo (quiosque)');
    expect(button?.textContent).toContain('Abra, copie ou compartilhe o link do ponto da equipe');

    act(() => button?.click());
    expect(onOpen).toHaveBeenCalledOnce();
  });
});
