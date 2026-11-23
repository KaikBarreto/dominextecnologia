import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WhatsappAutomationSettings } from './WhatsappAutomationSettings';
import {
  DEFAULT_WHATSAPP_AUTOMATION_PREFERENCES,
  type WhatsappAutomationPreferences,
} from '@/lib/whatsappAutomation';

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
    const boldTexts = Array.from(container.querySelectorAll('strong')).map((el) => el.textContent);
    expect(boldTexts).toContain('Acompanhe a OS:');
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

  it('oculta Cobranças quando somente Ordens de serviço está contratado', () => {
    renderSettings({ availableDomains: ['os'] });

    expect(container.textContent).toContain('Técnico a caminho');
    expect(container.textContent).not.toContain('Cobrança gerada');
    expect(Array.from(container.querySelectorAll('[role="radio"]'))
      .some((element) => element.textContent?.includes('Cobranças'))).toBe(false);
  });

  it('oculta OS quando somente Cobranças está contratado', () => {
    renderSettings({ availableDomains: ['billing'] });

    expect(container.textContent).toContain('Cobrança gerada');
    expect(container.textContent).not.toContain('Técnico a caminho');
    expect(Array.from(container.querySelectorAll('[role="radio"]'))
      .some((element) => element.textContent?.includes('Ordens de serviço'))).toBe(false);
  });

  it('mostra os dois domínios quando ambos estão contratados', () => {
    renderSettings({ availableDomains: ['os', 'billing'] });

    const domains = Array.from(container.querySelectorAll('[role="radio"]'))
      .map((element) => element.textContent);
    expect(domains).toContain('Ordens de serviço');
    expect(domains).toContain('Cobranças');
  });

  it('mostra estado vazio quando nenhum domínio de automação está contratado', () => {
    renderSettings({ availableDomains: [] });

    expect(container.textContent).toContain('Nenhuma automação disponível neste plano');
    expect(container.textContent).not.toContain('Técnico a caminho');
    expect(container.textContent).not.toContain('Cobrança gerada');
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
    // Regra do servidor: vencimento a mais de 10 dias não avisa na criação.
    expect(container.textContent).toContain('a mais de 10 dias, o aviso não sai na criação');

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

  const withCustomATaminho = (customText = 'Oi {{cliente.nome}}, a OS {{os.numero}} saiu.'): WhatsappAutomationPreferences => ({
    ...DEFAULT_WHATSAPP_AUTOMATION_PREFERENCES,
    os: {
      ...DEFAULT_WHATSAPP_AUTOMATION_PREFERENCES.os,
      events: {
        ...DEFAULT_WHATSAPP_AUTOMATION_PREFERENCES.os.events,
        a_caminho: { enabled: true, template: 'custom', customText },
      },
    },
  });

  const renderSettings = (props: Partial<React.ComponentProps<typeof WhatsappAutomationSettings>> = {}) => {
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
          {...props}
        />,
      );
    });
  };

  const getProseMirror = () => container.querySelector('.ProseMirror') as (HTMLElement & {
    editor: { commands: { insertContent: (content: string) => boolean } };
  }) | null;

  it('mostra "OS criada" como primeiro aviso, desligado, com a explicação sobre contratos', () => {
    renderSettings();

    const rows = Array.from(container.querySelectorAll('button[aria-pressed]'));
    expect(rows[0].textContent).toContain('OS criada');
    expect(rows[0].textContent).toContain('Quando uma OS é aberta manualmente');
    const createdSwitch = container.querySelector('[aria-label="Enviar esta mensagem: OS criada"]');
    expect(createdSwitch?.getAttribute('data-state')).toBe('unchecked');

    act(() => rows[0].dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect(container.textContent).toContain('OS geradas por contrato, por recorrência ou por importação não disparam este aviso');
    expect(container.textContent).toContain('respeita o horário configurado para lembretes');
  });

  it('mostra o modelo pronto no editor, já com as etiquetas', () => {
    renderSettings();
    const editorText = getProseMirror()?.textContent ?? '';
    expect(editorText).toContain('Nome de quem recebe');
    expect(editorText).toContain('Número da OS');
    expect(editorText).not.toContain('{{');
  });

  it('editar o texto passa o aviso para Personalizada e guarda o texto', () => {
    const onPreferencesChange = vi.fn();
    renderSettings({ onPreferencesChange });

    const editorEl = getProseMirror();
    expect(editorEl).toBeTruthy();
    act(() => { editorEl?.editor.commands.insertContent('Até já! '); });

    expect(onPreferencesChange).toHaveBeenCalledTimes(1);
    const updated = onPreferencesChange.mock.calls[0][0] as WhatsappAutomationPreferences;
    expect(updated.os.events.a_caminho.template).toBe('custom');
    expect(updated.os.events.a_caminho.customText).toContain('Até já!');
    expect(updated.os.events.a_caminho.customText).toContain('{{os.numero}}');
    expect(updated.os.events.em_andamento.template).toBe('automatic');
  });

  it('restaurar o modelo padrão volta ao modelo e remove o texto personalizado', () => {
    const onPreferencesChange = vi.fn();
    renderSettings({ preferences: withCustomATaminho(), onPreferencesChange });

    expect(getProseMirror()?.textContent).toContain('saiu.');
    expect(container.textContent).toContain('só se você inserir a variável correspondente');
    const restore = Array.from(container.querySelectorAll('button'))
      .find((el) => el.textContent?.includes('Restaurar modelo padrão'));
    expect(restore).toBeTruthy();
    act(() => restore?.dispatchEvent(new MouseEvent('click', { bubbles: true })));

    const updated = onPreferencesChange.mock.calls[0][0] as WhatsappAutomationPreferences;
    expect(updated.os.events.a_caminho.template).toBe('automatic');
    expect('customText' in updated.os.events.a_caminho).toBe(false);
  });

  it('só mostra "Restaurar modelo padrão" quando o aviso é personalizado', () => {
    renderSettings();
    const restore = Array.from(container.querySelectorAll('button'))
      .find((el) => el.textContent?.includes('Restaurar modelo padrão'));
    expect(restore).toBeUndefined();
  });

  it('bloqueia salvar enquanto o texto personalizado estiver vazio ou inválido', () => {
    renderSettings({ preferences: withCustomATaminho('Valor {{cobranca.valor}}'), isDirty: true });
    const save = Array.from(container.querySelectorAll('button'))
      .find((el) => el.textContent?.includes('Salvar configurações'));
    expect(save).toHaveProperty('disabled', true);
    expect(container.textContent).toContain('Corrija a mensagem personalizada para salvar');
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('não vale para este aviso');
  });

  it('em somente leitura trava o editor e o botão de restaurar', () => {
    const onPreferencesChange = vi.fn();
    renderSettings({ preferences: withCustomATaminho(), readOnly: true, onPreferencesChange });

    expect(getProseMirror()?.getAttribute('contenteditable')).toBe('false');
    const restore = Array.from(container.querySelectorAll('button'))
      .find((el) => el.textContent?.includes('Restaurar modelo padrão'));
    expect(restore).toHaveProperty('disabled', true);
    const bold = container.querySelector('[aria-label="Negrito"]');
    expect(bold).toHaveProperty('disabled', true);
    expect(onPreferencesChange).not.toHaveBeenCalled();
  });

  const clickVariable = (key: string) => {
    const badge = getProseMirror()?.querySelector(`[data-whatsapp-var="${key}"]`);
    expect(badge).toBeTruthy();
    act(() => badge?.dispatchEvent(new MouseEvent('click', { bubbles: true })));
  };
  const findBodyButton = (text: string) => Array.from(document.body.querySelectorAll('button'))
    .find((el) => el.textContent?.includes(text));

  it('clicar numa etiqueta e escolher outra variável troca só aquela etiqueta', () => {
    const onPreferencesChange = vi.fn();
    renderSettings({ preferences: withCustomATaminho('Oi *{{cliente.nome}}*, tudo bem?'), onPreferencesChange });

    clickVariable('cliente.nome');
    act(() => findBodyButton('Nome do técnico')?.dispatchEvent(new MouseEvent('click', { bubbles: true })));

    const updated = onPreferencesChange.mock.calls.at(-1)?.[0] as WhatsappAutomationPreferences;
    expect(updated.os.events.a_caminho.template).toBe('custom');
    expect(updated.os.events.a_caminho.customText).toBe('Oi *{{os.tecnico}}*, tudo bem?');
  });

  it('clicar numa etiqueta e remover apaga a etiqueta', () => {
    const onPreferencesChange = vi.fn();
    renderSettings({ preferences: withCustomATaminho('Oi {{cliente.nome}}!'), onPreferencesChange });

    clickVariable('cliente.nome');
    act(() => findBodyButton('Remover etiqueta')?.dispatchEvent(new MouseEvent('click', { bubbles: true })));

    const updated = onPreferencesChange.mock.calls.at(-1)?.[0] as WhatsappAutomationPreferences;
    expect(updated.os.events.a_caminho.customText).toBe('Oi !');
  });

  it('mostra o valor real só nas variáveis fixas e avisa quando não está cadastrado', () => {
    renderSettings({
      preferences: withCustomATaminho('Oi {{cliente.nome}}!'),
      companyValues: { 'empresa.nome': 'KGIE Tecnologia LTDA', 'empresa.cnpj': '', 'empresa.telefone': '(62) 3333-4444' },
    });

    clickVariable('cliente.nome');
    expect(document.body.querySelector('[data-testid="variable-value-empresa.nome"]')?.textContent)
      .toBe('KGIE Tecnologia LTDA');
    expect(document.body.querySelector('[data-testid="variable-value-empresa.telefone"]')?.textContent)
      .toBe('(62) 3333-4444');
    expect(document.body.querySelector('[data-testid="variable-value-empresa.cnpj"]')?.textContent)
      .toBe('não cadastrado');
    expect(document.body.querySelector('[data-testid="variable-value-os.numero"]')).toBeNull();
    expect(document.body.querySelector('[data-testid="variable-value-cliente.nome"]')).toBeNull();
  });

  it('em somente leitura a etiqueta não abre ações', () => {
    renderSettings({ preferences: withCustomATaminho('Oi {{cliente.nome}}!'), readOnly: true });
    clickVariable('cliente.nome');
    expect(findBodyButton('Remover etiqueta')).toBeUndefined();
  });

  it('a prévia usa o nome real da empresa quando ele é informado', () => {
    renderSettings({ companyValues: { 'empresa.nome': 'KGIE Tecnologia LTDA' }, preferences: withCustomATaminho('Aqui é a {{empresa.nome}}.') });
    expect(container.textContent).toContain('Aqui é a KGIE Tecnologia LTDA.');
  });

  type TestEditor = {
    state: { selection: { from: number; to: number }; doc: { content: { size: number } } };
    commands: { setContent: (c: string, e?: boolean) => boolean; setTextSelection: (p: number | { from: number; to: number }) => boolean; focus: (p?: string) => boolean };
    view: { someProp: (name: string, f: (handler: (view: unknown, e: KeyboardEvent) => boolean) => boolean) => boolean; dom: HTMLElement };
  };
  const getEditor = () => (getProseMirror() as unknown as { editor: TestEditor }).editor;
  const pressEnter = () => {
    const editor = getEditor();
    act(() => {
      editor.view.someProp('handleKeyDown', (handler) => handler(editor.view, new KeyboardEvent('keydown', { key: 'Enter' })));
    });
  };
  const lastText = (fn: ReturnType<typeof vi.fn>) =>
    (fn.mock.calls.at(-1)?.[0] as WhatsappAutomationPreferences).os.events.a_caminho.customText;

  it('o botão Lista acrescenta "- " nas linhas selecionadas e remove quando todas já têm', () => {
    const onPreferencesChange = vi.fn();
    renderSettings({ preferences: withCustomATaminho('Primeira\nSegunda'), onPreferencesChange });
    const editor = getEditor();
    act(() => { editor.commands.setTextSelection({ from: 1, to: editor.state.doc.content.size - 1 }); });

    const listButton = container.querySelector('[aria-label="Lista"]') as HTMLElement;
    expect(listButton.getAttribute('aria-pressed')).toBe('false');
    act(() => listButton.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect(lastText(onPreferencesChange)).toBe('- Primeira\n- Segunda');
  });

  it('o botão Lista remove o marcador quando todas as linhas já são itens', () => {
    const onPreferencesChange = vi.fn();
    renderSettings({ preferences: withCustomATaminho('- Primeira\n- Segunda'), onPreferencesChange });
    const editor = getEditor();
    act(() => { editor.commands.setTextSelection({ from: 1, to: editor.state.doc.content.size - 1 }); });
    const listButton = container.querySelector('[aria-label="Lista"]') as HTMLElement;
    expect(listButton.getAttribute('aria-pressed')).toBe('true');
    act(() => listButton.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect(lastText(onPreferencesChange)).toBe('Primeira\nSegunda');
  });

  it('Enter no fim de um item cria o próximo item', () => {
    const onPreferencesChange = vi.fn();
    renderSettings({ preferences: withCustomATaminho('- Primeira'), onPreferencesChange });
    const editor = getEditor();
    act(() => { editor.commands.setTextSelection(editor.state.doc.content.size - 1); });
    pressEnter();
    expect(lastText(onPreferencesChange)).toBe('- Primeira\n- ');
  });

  it('Enter num item vazio tira o marcador e sai da lista', () => {
    const onPreferencesChange = vi.fn();
    renderSettings({ preferences: withCustomATaminho('- Primeira\n- '), onPreferencesChange });
    const editor = getEditor();
    act(() => { editor.commands.setTextSelection(editor.state.doc.content.size - 1); });
    pressEnter();
    expect(lastText(onPreferencesChange)).toBe('- Primeira\n');
  });

  it('a prévia mostra "- " e "* " como itens de lista e mantém a formatação do resto', () => {
    renderSettings({ preferences: withCustomATaminho('Itens:\n- um *forte*\n* dois\n1. texto') });
    const bullets = Array.from(container.querySelectorAll('[data-whatsapp-bullet]'));
    expect(bullets).toHaveLength(2);
    expect(bullets[0].textContent).toBe('•um forte');
    expect(bullets[0].querySelector('strong')?.textContent).toBe('forte');
    expect(bullets[1].textContent).toBe('•dois');
    expect(container.textContent).toContain('1. texto');
  });

  it('mostra a dica de formatação e não oferece sublinhado', () => {
    renderSettings();
    expect(container.textContent).toContain('Sublinhado não existe no WhatsApp');
    expect(container.querySelector('[aria-label="Sublinhado"]')).toBeNull();
  });

  it('etiqueta sai da ordem do teclado quando o editor está travado', () => {
    renderSettings({ preferences: withCustomATaminho('Oi {{cliente.nome}}!'), readOnly: true });
    const badge = getProseMirror()?.querySelector('[data-whatsapp-var]') as HTMLElement;
    expect(badge.tabIndex).toBe(-1);
  });
});
