/**
 * O que estes testes garantem: que a pistola e a pessoa NÃO caem no mesmo
 * caminho. O bug que se está prevenindo é o operador digitar "4" na busca, dar
 * Enter, e o PDV tratar aquilo como leitura de código de barras.
 */
import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_MAX_KEY_GAP_MS,
  DEFAULT_MIN_LENGTH,
  isFreeTextTarget,
  isPrintableKey,
  isScannerBurst,
  useBarcodeScanner,
} from './useBarcodeScanner';

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

function teclar(key: string, target: EventTarget = document.body) {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
  target.dispatchEvent(event);
  return event;
}

describe('isScannerBurst', () => {
  it('aceita rajada longa e sem pausa', () => {
    expect(isScannerBurst({ length: 13, largestGapMs: 8 })).toBe(true);
  });

  it('recusa código curto demais, mesmo instantâneo', () => {
    expect(isScannerBurst({ length: DEFAULT_MIN_LENGTH - 1, largestGapMs: 0 })).toBe(false);
  });

  it('recusa quando UM intervalo passou do teto', () => {
    // O operador começou a digitar, pensou, continuou. Isso é busca.
    expect(isScannerBurst({ length: 13, largestGapMs: DEFAULT_MAX_KEY_GAP_MS + 1 })).toBe(false);
  });

  it('aceita exatamente no teto (comparação é inclusiva)', () => {
    expect(isScannerBurst({ length: 13, largestGapMs: DEFAULT_MAX_KEY_GAP_MS })).toBe(true);
  });

  it('respeita teto e mínimo customizados', () => {
    expect(isScannerBurst({ length: 6, largestGapMs: 90 }, 100, 5)).toBe(true);
    expect(isScannerBurst({ length: 4, largestGapMs: 90 }, 100, 5)).toBe(false);
  });
});

describe('isPrintableKey', () => {
  it('separa caractere de tecla de controle', () => {
    expect(isPrintableKey('7')).toBe(true);
    expect(isPrintableKey('A')).toBe(true);
    expect(isPrintableKey('Enter')).toBe(false);
    expect(isPrintableKey('Shift')).toBe(false);
    expect(isPrintableKey('F2')).toBe(false);
  });
});

describe('isFreeTextTarget', () => {
  it('cala dentro de textarea e de contenteditable', () => {
    const textarea = document.createElement('textarea');
    expect(isFreeTextTarget(textarea)).toBe(true);

    const div = document.createElement('div');
    div.contentEditable = 'true';
    // jsdom não deriva isContentEditable do atributo; forçamos o que o browser faria.
    Object.defineProperty(div, 'isContentEditable', { value: true });
    expect(isFreeTextTarget(div)).toBe(true);
  });

  it('NÃO cala dentro de input de uma linha, que é onde o código deve aparecer', () => {
    expect(isFreeTextTarget(document.createElement('input'))).toBe(false);
  });

  it('tolera alvo nulo', () => {
    expect(isFreeTextTarget(null)).toBe(false);
  });
});

describe('useBarcodeScanner', () => {
  it('dispara onScan e CORTA o Enter numa rajada', () => {
    const onScan = vi.fn();
    renderHook(() => useBarcodeScanner({ onScan }));

    '7891234567895'.split('').forEach((c) => teclar(c));
    const enter = teclar('Enter');

    expect(onScan).toHaveBeenCalledExactlyOnceWith('7891234567895');
    // Cortar o Enter é o que impede o campo de também disparar busca por texto.
    expect(enter.defaultPrevented).toBe(true);
  });

  it('ignora Enter de digitação humana e DEIXA o evento passar', async () => {
    const onScan = vi.fn();
    renderHook(() => useBarcodeScanner({ onScan }));

    // Pausas acima do teto entre as teclas: é alguém digitando.
    for (const c of '1234') {
      teclar(c);
      await dormir(DEFAULT_MAX_KEY_GAP_MS + 25);
    }
    const enter = teclar('Enter');

    expect(onScan).not.toHaveBeenCalled();
    expect(enter.defaultPrevented).toBe(false);
  });

  it('ignora rajada curta demais', () => {
    const onScan = vi.fn();
    renderHook(() => useBarcodeScanner({ onScan }));

    '12'.split('').forEach((c) => teclar(c));
    expect(teclar('Enter').defaultPrevented).toBe(false);
    expect(onScan).not.toHaveBeenCalled();
  });

  it('Shift no meio não quebra a rajada (leitor manda maiúscula)', () => {
    const onScan = vi.fn();
    renderHook(() => useBarcodeScanner({ onScan }));

    teclar('A');
    teclar('Shift');
    teclar('B');
    teclar('C');
    teclar('1');
    teclar('Enter');

    expect(onScan).toHaveBeenCalledExactlyOnceWith('ABC1');
  });

  it('se cala dentro de textarea', () => {
    const onScan = vi.fn();
    const textarea = document.createElement('textarea');
    document.body.appendChild(textarea);
    renderHook(() => useBarcodeScanner({ onScan }));

    '7891234567895'.split('').forEach((c) => teclar(c, textarea));
    expect(teclar('Enter', textarea).defaultPrevented).toBe(false);
    expect(onScan).not.toHaveBeenCalled();

    textarea.remove();
  });

  it('não escuta nada quando desligado', () => {
    const onScan = vi.fn();
    renderHook(() => useBarcodeScanner({ onScan, enabled: false }));

    '7891234567895'.split('').forEach((c) => teclar(c));
    expect(teclar('Enter').defaultPrevented).toBe(false);
    expect(onScan).not.toHaveBeenCalled();
  });

  it('trocar o callback não perde a rajada em andamento', () => {
    const primeiro = vi.fn();
    const segundo = vi.fn();
    const { rerender } = renderHook(({ cb }) => useBarcodeScanner({ onScan: cb }), {
      initialProps: { cb: primeiro },
    });

    '789123'.split('').forEach((c) => teclar(c));
    rerender({ cb: segundo });
    '4567895'.split('').forEach((c) => teclar(c));
    teclar('Enter');

    expect(primeiro).not.toHaveBeenCalled();
    expect(segundo).toHaveBeenCalledExactlyOnceWith('7891234567895');
  });
});
