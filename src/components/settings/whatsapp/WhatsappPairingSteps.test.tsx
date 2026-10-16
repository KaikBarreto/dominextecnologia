import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { WhatsappPairingSteps } from './WhatsappPairingSteps';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('WhatsappPairingSteps', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => root.render(<WhatsappPairingSteps />));
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('tem os quatro passos numerados, na ordem', () => {
    const itens = container.querySelectorAll('li');
    expect(itens).toHaveLength(4);
    expect(Array.from(itens).map((li) => li.textContent?.trim().charAt(0))).toEqual(['1', '2', '3', '4']);
  });

  it('cobre Android e iPhone no mesmo passo', () => {
    const texto = container.textContent ?? '';
    expect(texto).toContain('Mais opções');
    expect(texto).toContain('no Android');
    expect(texto).toContain('Configurações');
    expect(texto).toContain('no iPhone');
  });

  it('o passo final é escanear o QR Code, não conectar por número de telefone', () => {
    const ultimo = container.querySelectorAll('li')[3]?.textContent ?? '';
    expect(ultimo).toContain('QR Code');
    expect(ultimo).toContain('câmera');
    expect(ultimo).not.toContain('número de telefone');
    expect(container.textContent).not.toContain('número de telefone');
  });

  it('destaca em negrito os termos que o cliente procura no aplicativo', () => {
    const negritos = Array.from(container.querySelectorAll('strong')).map((n) => n.textContent);
    expect(negritos).toContain('WhatsApp');
    expect(negritos).toContain('Mais opções');
    expect(negritos).toContain('Configurações');
    expect(negritos).toContain('Dispositivos conectados');
    expect(negritos).toContain('Conectar dispositivo');
    expect(negritos).toContain('QR Code');
  });
});
