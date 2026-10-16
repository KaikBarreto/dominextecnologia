import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WhatsappProtectionSettings } from './WhatsappProtectionSettings';
import {
  DEFAULT_WHATSAPP_AUTOMATION_PREFERENCES,
  type WhatsappAutomationPreferences,
} from '@/lib/whatsappAutomation';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const OS = 'Avisos de serviço';
const COBRANCA = 'Lembretes de cobrança';

describe('WhatsappProtectionSettings', () => {
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

  const render = (
    preferences: WhatsappAutomationPreferences,
    onPreferencesChange: (next: WhatsappAutomationPreferences) => void = () => {},
    readOnly = false,
  ) => {
    act(() => {
      root.render(
        <WhatsappProtectionSettings
          locale="pt-br"
          preferences={preferences}
          readOnly={readOnly}
          onPreferencesChange={onPreferencesChange}
        />,
      );
    });
  };

  const day = (group: string, label: string) =>
    container.querySelector(`[aria-label="${group}: ${label}"]`);

  const click = (node: Element | null) =>
    act(() => node?.dispatchEvent(new MouseEvent('click', { bubbles: true })));

  it('mostra as duas janelas com os dias padrão de cada uma', () => {
    render(DEFAULT_WHATSAPP_AUTOMATION_PREFERENCES);

    expect(container.textContent).toContain('Proteção do número');
    expect(container.textContent).toContain(OS);
    expect(container.textContent).toContain(COBRANCA);
    expect(container.textContent).toContain('Horário de Brasília.');

    // OS nasce nos 7 dias: o cliente chama técnico no domingo também.
    expect(day(OS, 'Dom')?.getAttribute('aria-pressed')).toBe('true');
    // Cobrança nasce sem domingo.
    expect(day(COBRANCA, 'Dom')?.getAttribute('aria-pressed')).toBe('false');
    expect(day(COBRANCA, 'Sáb')?.getAttribute('aria-pressed')).toBe('true');
  });

  it('mexer nos dias da cobrança não altera a janela de OS', () => {
    const onPreferencesChange = vi.fn();
    render(DEFAULT_WHATSAPP_AUTOMATION_PREFERENCES, onPreferencesChange);

    click(day(COBRANCA, 'Sáb'));

    expect(onPreferencesChange).toHaveBeenCalledTimes(1);
    const atualizado = onPreferencesChange.mock.calls[0][0];
    expect(atualizado.sendWindow.reminders.days).toEqual([1, 2, 3, 4, 5]);
    expect(atualizado.sendWindow.transactional).toEqual(
      DEFAULT_WHATSAPP_AUTOMATION_PREFERENCES.sendWindow.transactional,
    );
  });

  it('mexer nos dias da OS não altera a janela de cobrança', () => {
    const onPreferencesChange = vi.fn();
    render(DEFAULT_WHATSAPP_AUTOMATION_PREFERENCES, onPreferencesChange);

    click(day(OS, 'Dom'));

    const atualizado = onPreferencesChange.mock.calls[0][0];
    expect(atualizado.sendWindow.transactional.days).toEqual([1, 2, 3, 4, 5, 6]);
    expect(atualizado.sendWindow.reminders).toEqual(
      DEFAULT_WHATSAPP_AUTOMATION_PREFERENCES.sendWindow.reminders,
    );
  });

  it('marca um dia que estava de fora mantendo a ordem da semana', () => {
    const onPreferencesChange = vi.fn();
    render(
      {
        ...DEFAULT_WHATSAPP_AUTOMATION_PREFERENCES,
        sendWindow: {
          transactional: DEFAULT_WHATSAPP_AUTOMATION_PREFERENCES.sendWindow.transactional,
          reminders: { startHour: 9, endHour: 18, days: [1, 5] },
        },
      },
      onPreferencesChange,
    );

    click(day(COBRANCA, 'Qua'));

    expect(onPreferencesChange.mock.calls[0][0].sendWindow.reminders.days).toEqual([1, 3, 5]);
  });

  it('avisa quando um dos grupos fica sem nenhum dia', () => {
    render({
      ...DEFAULT_WHATSAPP_AUTOMATION_PREFERENCES,
      sendWindow: {
        transactional: DEFAULT_WHATSAPP_AUTOMATION_PREFERENCES.sendWindow.transactional,
        reminders: { startHour: 8, endHour: 20, days: [] },
      },
    });

    expect(container.textContent).toContain('esses avisos nunca saem');
  });

  it('liga a leitura prévia preservando o "digitando"', () => {
    const onPreferencesChange = vi.fn();
    render(DEFAULT_WHATSAPP_AUTOMATION_PREFERENCES, onPreferencesChange);

    const leitura = container.querySelector(
      '[aria-label="Marcar a conversa como lida antes de responder"]',
    );
    expect(leitura).toBeTruthy();
    click(leitura);

    const atualizado = onPreferencesChange.mock.calls[0][0];
    expect(atualizado.humanBehavior.markAsReadBeforeReply).toBe(true);
    expect(atualizado.humanBehavior.simulateTyping).toBe(true);
  });

  it('não deixa editar nada em modo somente leitura', () => {
    const onPreferencesChange = vi.fn();
    render(DEFAULT_WHATSAPP_AUTOMATION_PREFERENCES, onPreferencesChange, true);

    click(day(OS, 'Dom'));
    click(day(COBRANCA, 'Sáb'));
    click(
      container.querySelector('[aria-label="Marcar a conversa como lida antes de responder"]'),
    );

    expect(onPreferencesChange).not.toHaveBeenCalled();
  });
});
