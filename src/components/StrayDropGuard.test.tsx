import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { StrayDropGuard } from './StrayDropGuard';

/**
 * Regressão do bug de 2026-09-24: arrastar card do kanban e soltar FORA de uma
 * coluna fazia o Chrome navegar pra URL que o arrasto carregava (a foto do
 * avatar), matando o app — "a página atualizou e o card não mudou de coluna".
 */

// jsdom não implementa DataTransfer; um stub com `dropEffect` basta, porque é
// só isso que o guard toca.
function fireDragEvent(type: 'dragover' | 'drop', target: Element, opts?: { preventedByApp?: boolean }) {
  const dataTransfer = { dropEffect: 'move' };
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'dataTransfer', { value: dataTransfer });
  if (opts?.preventedByApp) {
    // Simula um handler de coluna que aceita o drop: cancela ANTES de o evento
    // chegar na window (mesma ordem do React, que escuta no container raiz).
    target.addEventListener(type, (e) => e.preventDefault(), { once: true });
  }
  target.dispatchEvent(event);
  return { event, dataTransfer };
}

describe('StrayDropGuard', () => {
  afterEach(cleanup);

  it('cancela o drop solto fora de qualquer zona (browser não navega)', () => {
    render(<StrayDropGuard />);
    const alvo = document.createElement('div');
    document.body.appendChild(alvo);

    const over = fireDragEvent('dragover', alvo);
    expect(over.event.defaultPrevented).toBe(true);
    expect(over.dataTransfer.dropEffect).toBe('none');

    const drop = fireDragEvent('drop', alvo);
    expect(drop.event.defaultPrevented).toBe(true);

    alvo.remove();
  });

  it('não interfere quando uma coluna do kanban já aceitou o drop', () => {
    render(<StrayDropGuard />);
    const coluna = document.createElement('div');
    document.body.appendChild(coluna);

    const over = fireDragEvent('dragover', coluna, { preventedByApp: true });
    expect(over.dataTransfer.dropEffect).toBe('move');

    coluna.remove();
  });

  it('deixa passar arrasto de texto pra dentro de campo editável', () => {
    render(<StrayDropGuard />);
    const campo = document.createElement('textarea');
    document.body.appendChild(campo);

    const over = fireDragEvent('dragover', campo);
    expect(over.event.defaultPrevented).toBe(false);
    expect(over.dataTransfer.dropEffect).toBe('move');

    campo.remove();
  });

  it('para de escutar ao desmontar', () => {
    const { unmount } = render(<StrayDropGuard />);
    unmount();
    const alvo = document.createElement('div');
    document.body.appendChild(alvo);

    const over = fireDragEvent('dragover', alvo);
    expect(over.event.defaultPrevented).toBe(false);

    alvo.remove();
  });
});
