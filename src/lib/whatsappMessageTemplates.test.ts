import { describe, expect, it } from 'vitest';
import {
  WHATSAPP_CUSTOM_TEMPLATE_MAX_LENGTH,
  WHATSAPP_TEMPLATE_VARIABLES,
  buildWhatsappPresetTemplate,
  findInvalidWhatsappTemplateTokens,
  formatWhatsappCompanyDocument,
  formatWhatsappEquipmentNames,
  listWhatsappTemplateTokens,
  normalizeWhatsappCustomTemplate,
  renderWhatsappTemplate,
  resolveWhatsappCompanyValues,
  resolveWhatsappTemplate,
  whatsappVariablesForDomain,
} from './whatsappMessageTemplates';

const OS_VALUES = {
  'destinatario.nome': 'Mariana',
  'cliente.nome': 'Mariana',
  'empresa.nome': 'Clima Forte Serviços',
  'os.numero': '#1048',
  'os.agendamento': '28/10/2026, às 09:00',
  'os.data': '28/10/2026',
  'os.horario': '09:00',
  'os.servico': 'Manutenção preventiva',
  'os.tecnico': 'Carlos',
  'os.equipamentos': 'Split 12.000 BTUs da sala',
  'os.link': 'https://www.dominex.app/os-tecnico/abc123?modo=cliente',
};

const BILLING_VALUES = {
  'destinatario.nome': 'Felix',
  'cliente.nome': 'Felix',
  'empresa.nome': 'KGIE Tecnologia LTDA',
  'cobranca.valor': 'R$ 207,13',
  'cobranca.vencimento': '28/12/2026',
  'cobranca.link': 'https://www.dominex.app/pagar/88mhmkkbp8sh',
  'cobranca.dias_antes': 3,
  'cobranca.dias_depois': 5,
};

describe('modelos prontos reproduzem exatamente os textos que já eram enviados', () => {
  it('OS a caminho, objetiva, com link', () => {
    const template = buildWhatsappPresetTemplate('os', 'a_caminho', 'objective', {
      includeOsLink: true,
    });
    expect(renderWhatsappTemplate(template!, OS_VALUES)).toBe(
      [
        'Olá, Mariana!',
        '',
        'O técnico Carlos está a caminho para atender a OS #1048.',
        '',
        '*Acompanhe a OS:* https://www.dominex.app/os-tecnico/abc123?modo=cliente',
      ].join('\n'),
    );
  });

  it('lembrete de visita detalhado, sem link quando a opção está desligada', () => {
    const template = buildWhatsappPresetTemplate('os', 'scheduled_reminder', 'detailed', {
      includeOsLink: false,
    });
    expect(renderWhatsappTemplate(template!, OS_VALUES)).toBe(
      [
        'Olá, Mariana!',
        '',
        'Sua visita para Manutenção preventiva, referente à OS #1048, está agendada para 28/10/2026, às 09:00.',
      ].join('\n'),
    );
  });

  it('OS para um contato identifica o cliente logo após a saudação', () => {
    const template = buildWhatsappPresetTemplate('os', 'concluida', 'objective', {
      includeOsLink: false,
    });
    expect(
      renderWhatsappTemplate(template!, {
        ...OS_VALUES,
        'destinatario.nome': 'Síndico Paulo',
        'aviso.cliente': 'Condomínio Aurora',
      }),
    ).toBe(
      [
        'Olá, Síndico Paulo!',
        '',
        'Aviso referente a *Condomínio Aurora*.',
        '',
        'A OS #1048 foi concluída.',
      ].join('\n'),
    );
  });

  it('cobrança gerada, detalhada, igual à mensagem real enviada em 19/11/2026', () => {
    const template = buildWhatsappPresetTemplate('billing', 'created', 'detailed', {
      includeAmount: true,
      includePaymentLink: true,
    });
    expect(renderWhatsappTemplate(template!, BILLING_VALUES)).toBe(
      [
        'Olá, Felix!',
        '',
        'Uma nova cobrança da *KGIE Tecnologia LTDA* foi gerada para você.',
        '',
        '*Valor:* R$ 207,13',
        '*Vencimento:* 28/12/2026',
        '*Pagar agora:* https://www.dominex.app/pagar/88mhmkkbp8sh',
        '',
        'Se você já realizou o pagamento, desconsidere esta mensagem.',
        '',
        'Em caso de dúvida, fale com a nossa equipe por aqui.',
      ].join('\n'),
    );
  });

  it('cobrança para um contato, sem valor e sem link de pagamento disponível', () => {
    const template = buildWhatsappPresetTemplate('billing', 'after_due', 'cordial', {
      includeAmount: false,
      includePaymentLink: true,
    });
    expect(
      renderWhatsappTemplate(template!, {
        ...BILLING_VALUES,
        'aviso.cliente': 'Condomínio Aurora',
        'cobranca.link': null,
      }),
    ).toBe(
      [
        'Olá, Felix!',
        '',
        'A *KGIE Tecnologia LTDA* lembra que sua cobrança venceu há 5 dias.',
        '',
        '*Cliente:* Condomínio Aurora',
        '*Vencimento:* 28/12/2026',
        '',
        'Se você já realizou o pagamento, desconsidere esta mensagem.',
        '',
        'Em caso de dúvida, fale com a nossa equipe por aqui.',
      ].join('\n'),
    );
  });

  it('existe modelo para todo aviso nos três estilos', () => {
    const events: Array<['os' | 'billing' | 'birthday', string]> = [
      ['os', 'criada'],
      ['os', 'scheduled_reminder'],
      ['os', 'a_caminho'],
      ['os', 'em_andamento'],
      ['os', 'concluida'],
      ['billing', 'created'],
      ['billing', 'before_due'],
      ['billing', 'due_today'],
      ['billing', 'after_due'],
      ['birthday', 'greeting'],
    ];
    for (const [domain, event] of events) {
      for (const style of ['objective', 'cordial', 'detailed'] as const) {
        const template = buildWhatsappPresetTemplate(domain, event, style);
        expect(template, `${domain}.${event}.${style}`).toBeTruthy();
        expect(findInvalidWhatsappTemplateTokens(template!, domain)).toEqual([]);
      }
    }
    expect(buildWhatsappPresetTemplate('os', 'inexistente', 'cordial')).toBeNull();
  });
});

describe('aviso de OS criada', () => {
  it('deixa claro que a data é uma previsão', () => {
    const template = buildWhatsappPresetTemplate('os', 'criada', 'cordial', {
      includeOsLink: false,
    });
    const message = renderWhatsappTemplate(template!, OS_VALUES);
    expect(message).toContain('agendou o seu serviço para 28/10/2026, às 09:00');
    expect(message).toContain('podem ser alterados por imprevistos na agenda do técnico');
  });

  it('OS sem data usa o texto reserva em vez de deixar a frase quebrada', () => {
    const template = buildWhatsappPresetTemplate('os', 'criada', 'cordial', {
      includeOsLink: false,
    });
    const message = renderWhatsappTemplate(template!, { ...OS_VALUES, 'os.agendamento': null });
    expect(message).toContain('agendou o seu serviço para data a definir.');
  });
});

describe('texto personalizado', () => {
  it('troca as variáveis e preserva a formatação do WhatsApp', () => {
    const message = renderWhatsappTemplate(
      'Olá, {{ cliente.nome }}! A *{{empresa.nome}}* agendou _{{os.servico}}_ para {{os.data}}.\nEquipamento: {{os.equipamentos}}',
      OS_VALUES,
    );
    expect(message).toBe(
      'Olá, Mariana! A *Clima Forte Serviços* agendou _Manutenção preventiva_ para 28/10/2026.\nEquipamento: Split 12.000 BTUs da sala',
    );
  });

  it('dado digitado não consegue injetar formatação nem quebra de linha', () => {
    const message = renderWhatsappTemplate('Cliente: {{cliente.nome}}', {
      'cliente.nome': '*Ana*\n_Maria_ ~x~',
    });
    expect(message).toBe('Cliente: Ana Maria x');
  });

  it('linha cujo link não existe some inteira, sem deixar buraco', () => {
    const message = renderWhatsappTemplate(
      'Sua OS foi aberta.\n\nAcompanhe: {{os.link}}\n\nObrigado!',
      { 'os.link': '' },
    );
    expect(message).toBe('Sua OS foi aberta.\n\nObrigado!');
  });

  it('variável desconhecida sai vazia e é apontada pela validação', () => {
    expect(renderWhatsappTemplate('Total {{cobranca.valor}} {{foo.bar}}fim', BILLING_VALUES)).toBe(
      'Total R$ 207,13 fim',
    );
    expect(findInvalidWhatsappTemplateTokens('{{cobranca.valor}} {{foo.bar}}', 'os')).toEqual([
      'cobranca.valor',
      'foo.bar',
    ]);
    expect(listWhatsappTemplateTokens('{{os.data}} {{os.data}} {{os.numero}}')).toEqual([
      'os.data',
      'os.numero',
    ]);
  });

  it('aviso para contato identifica o cliente mesmo se o texto não citar', () => {
    const message = renderWhatsappTemplate('Olá!\n\nSua OS {{os.numero}} foi aberta.', {
      ...OS_VALUES,
      'aviso.cliente': 'Condomínio Aurora',
    });
    expect(message).toBe(
      'Olá!\n\nAviso referente a *Condomínio Aurora*.\n\nSua OS #1048 foi aberta.',
    );
  });

  it('normaliza, corta no limite e recusa texto vazio', () => {
    expect(normalizeWhatsappCustomTemplate('  Oi\r\n\r\n\r\n\r\ntudo bem?\u0007  ')).toBe(
      'Oi\n\ntudo bem?',
    );
    expect(normalizeWhatsappCustomTemplate('   \n ')).toBeNull();
    expect(normalizeWhatsappCustomTemplate(42)).toBeNull();
    expect(
      normalizeWhatsappCustomTemplate('a'.repeat(WHATSAPP_CUSTOM_TEMPLATE_MAX_LENGTH + 50)),
    ).toHaveLength(WHATSAPP_CUSTOM_TEMPLATE_MAX_LENGTH);
  });
});

describe('escolha do texto', () => {
  it('usa o personalizado quando válido e cai no modelo cordial quando vazio', () => {
    expect(
      resolveWhatsappTemplate({
        domain: 'os',
        event: 'criada',
        choice: 'custom',
        customText: 'Oi {{cliente.nome}}',
      }),
    ).toBe('Oi {{cliente.nome}}');

    expect(
      resolveWhatsappTemplate({ domain: 'os', event: 'criada', choice: 'custom', customText: ' ' }),
    ).toBe(buildWhatsappPresetTemplate('os', 'criada', 'cordial'));
  });

  it('automático usa o estilo sorteado pelo chamador', () => {
    expect(
      resolveWhatsappTemplate({
        domain: 'billing',
        event: 'due_today',
        choice: 'automatic',
        automaticStyle: 'objective',
      }),
    ).toBe(buildWhatsappPresetTemplate('billing', 'due_today', 'objective'));
  });

  it('aniversário personalizado usa somente os dados comuns disponíveis', () => {
    const template = resolveWhatsappTemplate({
      domain: 'birthday',
      event: 'greeting',
      choice: 'custom',
      customText: 'Parabéns, {{destinatario.nome}}! A {{empresa.nome}} celebra com você.',
    });

    expect(renderWhatsappTemplate(template!, {
      'destinatario.nome': 'Paulo',
      'empresa.nome': 'Dominex Climatização',
    })).toBe('Parabéns, Paulo! A Dominex Climatização celebra com você.');
  });
});

describe('catálogo de variáveis', () => {
  it('separa o que vale para OS e para cobrança', () => {
    const os = whatsappVariablesForDomain('os').map((meta) => meta.key);
    const billing = whatsappVariablesForDomain('billing').map((meta) => meta.key);
    const birthday = whatsappVariablesForDomain('birthday').map((meta) => meta.key);
    expect(os).toContain('os.equipamentos');
    expect(os).not.toContain('cobranca.valor');
    expect(billing).toContain('cobranca.link');
    expect(billing).not.toContain('os.numero');
    expect(os).toContain('cliente.nome');
    expect(billing).toContain('cliente.nome');
    expect(birthday).toEqual([
      'destinatario.nome',
      'cliente.nome',
      'empresa.nome',
      'empresa.cnpj',
      'empresa.telefone',
      'aviso.cliente',
    ]);
  });

  it('toda chave segue o formato que o editor e o enviador reconhecem', () => {
    for (const meta of WHATSAPP_TEMPLATE_VARIABLES) {
      expect(meta.key).toMatch(/^[a-z]+\.[a-z_]+$/);
      expect(listWhatsappTemplateTokens(`{{${meta.key}}}`)).toEqual([meta.key]);
    }
  });
});

describe('lista de equipamentos', () => {
  it('fica curta e legível em qualquer quantidade', () => {
    expect(formatWhatsappEquipmentNames([])).toBe('');
    expect(formatWhatsappEquipmentNames(['Split sala'])).toBe('Split sala');
    expect(formatWhatsappEquipmentNames(['Split sala', 'Cassete recepção'])).toBe(
      'Split sala e Cassete recepção',
    );
    expect(formatWhatsappEquipmentNames(['A', 'B', 'C'])).toBe('A, B e C');
    expect(formatWhatsappEquipmentNames(['A', 'B', 'C', 'D', 'E'])).toBe('A, B, C e mais 2');
  });

  it('ignora nome vazio, repetido e formatação digitada', () => {
    expect(formatWhatsappEquipmentNames(['*Split*', '', 'Split', ' Split '])).toBe('Split');
  });
});

describe('dados fixos da empresa', () => {
  it('configurações vencem o cadastro e o CNPJ sai formatado', () => {
    expect(
      resolveWhatsappCompanyValues({
        name: ' KGIE Tecnologia LTDA ',
        cnpj: '11222333000144',
        phone: '6233334444',
        settingsDocument: '',
        settingsPhone: '(62) 99999-0000',
      }),
    ).toEqual({
      'empresa.nome': 'KGIE Tecnologia LTDA',
      'empresa.cnpj': '11.222.333/0001-44',
      'empresa.telefone': '(62) 99999-0000',
    });
    expect(formatWhatsappCompanyDocument('123.456.789-09')).toBe('123.456.789-09');
    expect(resolveWhatsappCompanyValues({})).toEqual({
      'empresa.nome': '',
      'empresa.cnpj': '',
      'empresa.telefone': '',
    });
  });

  it('empresa sem CNPJ cadastrado não deixa a linha vazia na mensagem', () => {
    const message = renderWhatsappTemplate(
      'Olá!\nCNPJ: {{empresa.cnpj}}\nFale com a gente: {{empresa.telefone}}',
      { 'empresa.cnpj': '', 'empresa.telefone': '(62) 3333-4444' },
    );
    expect(message).toBe('Olá!\nFale com a gente: (62) 3333-4444');
  });

  it('só os dados da empresa são marcados como fixos', () => {
    expect(WHATSAPP_TEMPLATE_VARIABLES.filter((meta) => meta.fixed).map((meta) => meta.key)).toEqual([
      'empresa.nome',
      'empresa.cnpj',
      'empresa.telefone',
    ]);
  });
});
