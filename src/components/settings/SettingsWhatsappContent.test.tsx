import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AsaasContent, WhatsappSectionNav } from './SettingsWhatsappContent';

vi.mock('@/contexts/AppLocaleContext', () => ({
  useAppLocaleContext: () => ({ locale: 'pt-br' }),
}));

vi.mock('@/components/mobile/MobilePillTabs', () => ({
  MobilePillTabs: ({ tabs, activeTab, onTabChange }: {
    tabs: Array<{ value: string; label: string }>;
    activeTab: string;
    onTabChange: (value: string) => void;
  }) => (
    <div role="tablist">
      {tabs.map((tab) => (
        <button
          key={tab.value}
          role="tab"
          aria-selected={activeTab === tab.value}
          onClick={() => onTabChange(tab.value)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  ),
}));

vi.mock('@/components/settings/SettingsAsaasContent', () => ({
  SettingsAsaasContent: () => <div>Configuração da conta Asaas</div>,
}));

vi.mock('@/components/settings/SettingsAsaasSimulator', () => ({
  SettingsAsaasSimulator: () => <div>Conteúdo do simulador Asaas</div>,
}));

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

  it('libera automações, modelos e histórico, mantendo atendimento e campanhas futuros', () => {
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
    expect(buttons.filter((button) => button.disabled)).toHaveLength(2);

    const inbox = buttons.find((button) => button.textContent?.includes('Atendimento'));
    const history = buttons.find((button) => button.textContent?.includes('Histórico'));
    act(() => inbox?.click());
    expect(onChange).not.toHaveBeenCalled();
    act(() => history?.click());
    expect(onChange).toHaveBeenCalledWith('history');
  });
});

describe('AsaasContent', () => {
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

  it('mantém o simulador dentro de Cobranças (Asaas)', () => {
    act(() => root.render(<AsaasContent />));

    expect(container.textContent).toContain('Configurações');
    expect(container.textContent).toContain('Simulador');
    expect(container.textContent).toContain('Configuração da conta Asaas');

    const simulatorTab = [...container.querySelectorAll('button')]
      .find((button) => button.textContent === 'Simulador');
    act(() => simulatorTab?.click());

    expect(container.textContent).toContain('Conteúdo do simulador Asaas');
    expect(container.textContent).not.toContain('Configuração da conta Asaas');
  });
});
