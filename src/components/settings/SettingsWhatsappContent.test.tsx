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

  it('mostra as seis áreas e não navega para nenhuma bloqueada antes da conexão', () => {
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

    // Sem conexão, só Conexão navega. As abas underline não têm estado
    // desabilitado: o bloqueio é o guarda no onTabChange, então o teste
    // verifica o efeito, não o atributo.
    for (const label of ['Automações', 'Atendimento', 'Modelos', 'Campanhas', 'Histórico']) {
      act(() => buttons.find((b) => b.textContent?.includes(label))?.click());
    }
    expect(onChange).not.toHaveBeenCalled();

    act(() => buttons.find((b) => b.textContent?.includes('Conexão'))?.click());
    expect(onChange).toHaveBeenCalledWith('connection');
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
    const clicar = (label: string) =>
      act(() => buttons.find((b) => b.textContent?.includes(label))?.click());

    // Etapas futuras seguem bloqueadas mesmo com o WhatsApp conectado.
    clicar('Atendimento');
    clicar('Campanhas');
    expect(onChange).not.toHaveBeenCalled();

    clicar('Histórico');
    expect(onChange).toHaveBeenCalledWith('history');
    clicar('Modelos');
    expect(onChange).toHaveBeenCalledWith('templates');
  });
});
