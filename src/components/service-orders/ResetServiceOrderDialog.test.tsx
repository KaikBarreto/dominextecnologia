import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ResetServiceOrderDialog } from './ResetServiceOrderDialog';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('ResetServiceOrderDialog', () => {
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

  const renderDialog = (
    onConfirm: (clearResponses: boolean) => Promise<void> | void,
    status: 'em_andamento' | 'concluida' = 'em_andamento',
  ) => {
    act(() => {
      root.render(
        <ResetServiceOrderDialog
          open
          onOpenChange={() => {}}
          orderNumber={123}
          status={status}
          onConfirm={onConfirm}
        />,
      );
    });
  };

  const confirmButton = () => Array.from(document.querySelectorAll('button'))
    .find((button) => button.textContent?.trim() === 'Resetar OS') as HTMLButtonElement;

  it('mantem o preenchimento por padrao', async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    renderDialog(onConfirm);

    expect(document.body.textContent).toContain('Resetar OS #123?');
    expect(document.body.textContent).toContain('Materiais, estoque, faturamento');

    await act(async () => {
      confirmButton().click();
    });

    expect(onConfirm).toHaveBeenCalledWith(false);
  });

  it('envia a escolha de apagar o preenchimento', async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    renderDialog(onConfirm);
    const radios = Array.from(document.querySelectorAll('[role="radio"]')) as HTMLElement[];

    act(() => radios[1].click());
    await act(async () => {
      confirmButton().click();
    });

    expect(onConfirm).toHaveBeenCalledWith(true);
  });

  it('mostra Reabrir OS quando a ordem está concluída', () => {
    renderDialog(vi.fn(), 'concluida');

    expect(document.body.textContent).toContain('Reabrir OS #123?');
    expect(Array.from(document.querySelectorAll('button')).some(
      (button) => button.textContent?.trim() === 'Reabrir OS',
    )).toBe(true);
  });
});
