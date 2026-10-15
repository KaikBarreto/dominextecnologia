import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WhatsappSectionNav } from './SettingsWhatsappContent';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const labels = {
  automations: 'Automações',
  inbox: 'Atendimento',
  templates: 'Modelos',
  campaigns: 'Campanhas',
  history: 'Histórico',
  connection: 'Conexão',
};

describe('WhatsappSectionNav', () => {
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

  it('mantém as áreas visíveis, mas bloqueadas, antes da conexão', () => {
    const onChange = vi.fn();
    act(() => {
      root.render(
        <WhatsappSectionNav
          active="connection"
          isConnected={false}
          lockedLabel="Conecte o WhatsApp para liberar esta área"
          onChange={onChange}
          labels={labels}
        />,
      );
    });

    const buttons = [...container.querySelectorAll('button')];
    expect(buttons).toHaveLength(6);
    expect(buttons.filter((button) => button.disabled)).toHaveLength(5);
    expect(buttons.find((button) => button.textContent?.includes('Conexão'))?.disabled).toBe(false);

    const automations = buttons.find((button) => button.textContent?.includes('Automações'));
    act(() => automations?.click());
    expect(onChange).not.toHaveBeenCalled();
  });

  it('libera todas as áreas depois da conexão', () => {
    const onChange = vi.fn();
    act(() => {
      root.render(
        <WhatsappSectionNav
          active="automations"
          isConnected
          lockedLabel="Conecte o WhatsApp para liberar esta área"
          onChange={onChange}
          labels={labels}
        />,
      );
    });

    const buttons = [...container.querySelectorAll('button')];
    expect(buttons.some((button) => button.disabled)).toBe(false);

    const inbox = buttons.find((button) => button.textContent?.includes('Atendimento'));
    act(() => inbox?.click());
    expect(onChange).toHaveBeenCalledWith('inbox');
  });
});
