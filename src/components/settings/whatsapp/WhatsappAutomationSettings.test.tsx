import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WhatsappAutomationSettings } from './WhatsappAutomationSettings';
import { DEFAULT_WHATSAPP_AUTOMATION_PREFERENCES } from '@/lib/whatsappAutomation';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('WhatsappAutomationSettings', () => {
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

  it('mostra os fluxos de OS e uma prévia sem controles interativos aninhados', () => {
    act(() => {
      root.render(
        <WhatsappAutomationSettings
          locale="pt-br"
          enabled
          preferences={DEFAULT_WHATSAPP_AUTOMATION_PREFERENCES}
          isSaving={false}
          isDirty={false}
          onEnabledChange={() => {}}
          onPreferencesChange={() => {}}
          onSave={() => {}}
        />,
      );
    });

    expect(container.textContent).toContain('Técnico a caminho');
    expect(container.textContent).toContain('Serviço iniciado');
    expect(container.textContent).toContain('OS concluída');
    expect(container.textContent).toContain('Acompanhe a OS: https://www.dominex.app/os/1048');
    expect(container.querySelector('strong')?.textContent).toBe('Acompanhe a OS:');
    expect(container.querySelector('a')?.getAttribute('href')).toBe('https://www.dominex.app/os/1048');
    expect(container.querySelectorAll('button button')).toHaveLength(0);
  });

  it('altera somente a regra escolhida pelo switch da lista', () => {
    const onPreferencesChange = vi.fn();
    act(() => {
      root.render(
        <WhatsappAutomationSettings
          locale="pt-br"
          enabled
          preferences={DEFAULT_WHATSAPP_AUTOMATION_PREFERENCES}
          isSaving={false}
          isDirty
          onEnabledChange={() => {}}
          onPreferencesChange={onPreferencesChange}
          onSave={() => {}}
        />,
      );
    });

    const target = container.querySelector('[aria-label="Enviar esta mensagem: Técnico a caminho"]');
    expect(target).toBeTruthy();
    act(() => target?.dispatchEvent(new MouseEvent('click', { bubbles: true })));

    expect(onPreferencesChange).toHaveBeenCalledTimes(1);
    const updated = onPreferencesChange.mock.calls[0][0];
    expect(updated.os.events.a_caminho.enabled).toBe(false);
    expect(updated.os.events.em_andamento.enabled).toBe(true);
  });
});
