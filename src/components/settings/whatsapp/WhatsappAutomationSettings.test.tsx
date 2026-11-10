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
    expect(container.textContent).toContain('Lembrete de visita agendada');
    expect(container.textContent).toContain('Serviço iniciado');
    expect(container.textContent).toContain('OS concluída');
    expect(container.textContent).toContain('Acompanhe a OS: https://www.dominex.app/os/1048');
    expect(container.querySelector('strong')?.textContent).toBe('Acompanhe a OS:');
    expect(container.querySelector('a')?.getAttribute('href')).toBe('https://www.dominex.app/os/1048');
    expect(container.querySelectorAll('button button')).toHaveLength(0);
    const reminderSwitch = container.querySelector(
      '[aria-label="Enviar esta mensagem: Lembrete de visita agendada"]',
    );
    expect(reminderSwitch?.parentElement?.closest('button')).toBeNull();
  });

  it('mostra o lembrete desligado por padrão e permite escolher envio no dia', () => {
    const onPreferencesChange = vi.fn();
    act(() => {
      root.render(
        <WhatsappAutomationSettings
          locale="pt-br"
          enabled
          preferences={DEFAULT_WHATSAPP_AUTOMATION_PREFERENCES}
          isSaving={false}
          isDirty={false}
          onEnabledChange={() => {}}
          onPreferencesChange={onPreferencesChange}
          onSave={() => {}}
        />,
      );
    });

    const reminderSwitch = container.querySelector(
      '[aria-label="Enviar esta mensagem: Lembrete de visita agendada"]',
    );
    expect(reminderSwitch?.getAttribute('data-state')).toBe('unchecked');
    act(() => reminderSwitch?.dispatchEvent(new MouseEvent('click', { bubbles: true })));

    expect(onPreferencesChange).toHaveBeenCalledWith(expect.objectContaining({
      os: expect.objectContaining({
        events: expect.objectContaining({
          scheduled_reminder: expect.objectContaining({ enabled: true, timing: 'day_before' }),
        }),
      }),
    }));

    const reminderRow = Array.from(container.querySelectorAll('button[aria-pressed]'))
      .find((element) => element.textContent?.includes('Lembrete de visita agendada'));
    expect(reminderRow).toBeTruthy();
    act(() => reminderRow?.dispatchEvent(new MouseEvent('click', { bubbles: true })));

    expect(container.textContent).toContain('1 dia antes · recomendado');
    expect(container.textContent).toContain('O envio usa o horário dos lembretes em qualquer dia');

    const sameDay = Array.from(container.querySelectorAll('[role="radio"]'))
      .find((element) => element.textContent?.includes('No dia'));
    expect(sameDay).toBeTruthy();
    act(() => sameDay?.dispatchEvent(new MouseEvent('click', { bubbles: true })));

    expect(onPreferencesChange).toHaveBeenCalledWith(expect.objectContaining({
      os: expect.objectContaining({
        events: expect.objectContaining({
          scheduled_reminder: expect.objectContaining({ timing: 'same_day' }),
        }),
      }),
    }));
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

  it('mostra a nova copy de cobrança sem campos internos', () => {
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

    const billingTab = Array.from(container.querySelectorAll('[role="radio"]'))
      .find((element) => element.textContent?.includes('Cobranças'));
    expect(billingTab).toBeTruthy();
    act(() => billingTab?.dispatchEvent(new MouseEvent('click', { bubbles: true })));

    expect(container.textContent).toContain('nova cobrança da Clima Forte Serviços');
    expect(container.textContent).toContain('Se você já realizou o pagamento, desconsidere esta mensagem.');
    expect(container.textContent).not.toContain('Quem gerou');
    expect(container.textContent).not.toContain('Descrição');
  });

  it('permite consultar cobranças em modo somente leitura sem liberar edições', () => {
    const onPreferencesChange = vi.fn();
    act(() => {
      root.render(
        <WhatsappAutomationSettings
          locale="pt-br"
          enabled
          preferences={DEFAULT_WHATSAPP_AUTOMATION_PREFERENCES}
          isSaving={false}
          isDirty={false}
          readOnly
          onEnabledChange={() => {}}
          onPreferencesChange={onPreferencesChange}
          onSave={() => {}}
        />,
      );
    });

    const billingTab = Array.from(container.querySelectorAll('[role="radio"]'))
      .find((element) => element.textContent?.includes('Cobranças'));
    expect(billingTab?.getAttribute('aria-disabled')).not.toBe('true');
    act(() => billingTab?.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect(container.textContent).toContain('Cobrança gerada');

    const billingSwitch = container.querySelector('[aria-label="Enviar esta mensagem: Cobrança gerada"]');
    expect(billingSwitch).toHaveProperty('disabled', true);
    act(() => billingSwitch?.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect(onPreferencesChange).not.toHaveBeenCalled();
  });

  it('bloqueia mutações enquanto o salvamento está pendente', () => {
    const onPreferencesChange = vi.fn();
    act(() => {
      root.render(
        <WhatsappAutomationSettings
          locale="pt-br"
          enabled
          preferences={DEFAULT_WHATSAPP_AUTOMATION_PREFERENCES}
          isSaving
          isDirty
          onEnabledChange={() => {}}
          onPreferencesChange={onPreferencesChange}
          onSave={() => {}}
        />,
      );
    });

    const reminderSwitch = container.querySelector(
      '[aria-label="Enviar esta mensagem: Lembrete de visita agendada"]',
    );
    expect(reminderSwitch).toHaveProperty('disabled', true);
    act(() => reminderSwitch?.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect(onPreferencesChange).not.toHaveBeenCalled();
  });

  it('explica em outros idiomas que a mensagem enviada continua em português do Brasil', () => {
    act(() => {
      root.render(
        <WhatsappAutomationSettings
          locale="en"
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

    expect(container.textContent).toContain('Automatic messages are currently sent in Brazilian Portuguese.');
  });
});
