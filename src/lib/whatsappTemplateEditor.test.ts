import { describe, expect, it } from 'vitest';
import {
  parseWhatsappLine,
  validateWhatsappCustomText,
  whatsappEditorDocToText,
  whatsappTextToEditorDoc,
} from './whatsappTemplateEditor';
import {
  WHATSAPP_CUSTOM_TEMPLATE_MAX_LENGTH,
  buildWhatsappPresetTemplate,
  type WhatsappPresetStyle,
} from './whatsappMessageTemplates';

const OS_EVENTS = ['criada', 'scheduled_reminder', 'a_caminho', 'em_andamento', 'concluida'];
const BILLING_EVENTS = ['created', 'before_due', 'due_today', 'after_due'];
const STYLES: WhatsappPresetStyle[] = ['objective', 'cordial', 'detailed'];
const BOOLS = [true, false];

describe('conversor texto do WhatsApp <-> documento do editor', () => {
  it('devolve exatamente o modelo pronto em todos os avisos, estilos e opções', () => {
    let checked = 0;
    for (const event of OS_EVENTS) {
      for (const style of STYLES) {
        for (const includeOsLink of BOOLS) {
          const text = buildWhatsappPresetTemplate('os', event, style, { includeOsLink });
          expect(text).toBeTruthy();
          expect(whatsappEditorDocToText(whatsappTextToEditorDoc(text as string))).toBe(text);
          checked += 1;
        }
      }
    }
    for (const event of BILLING_EVENTS) {
      for (const style of STYLES) {
        for (const includeAmount of BOOLS) {
          for (const includePaymentLink of BOOLS) {
            const text = buildWhatsappPresetTemplate('billing', event, style, {
              includeAmount,
              includePaymentLink,
            });
            expect(text).toBeTruthy();
            expect(whatsappEditorDocToText(whatsappTextToEditorDoc(text as string))).toBe(text);
            checked += 1;
          }
        }
      }
    }
    expect(checked).toBe(5 * 3 * 2 + 4 * 3 * 4);
  });

  it('linha vira parágrafo e linha em branco vira parágrafo vazio', () => {
    const doc = whatsappTextToEditorDoc('Olá\n\nTchau');
    expect(doc.content.map((p) => p.type)).toEqual(['paragraph', 'paragraph', 'paragraph']);
    expect(doc.content[1].content).toBeUndefined();
  });

  it('negrito, itálico e riscado viram marcas, e variável vira nó atômico', () => {
    const doc = whatsappTextToEditorDoc('A *{{empresa.nome}}* _chegou_ ~não~');
    const nodes = doc.content[0].content ?? [];
    expect(nodes.map((n) => n.type)).toEqual([
      'text',
      'whatsappVariable',
      'text',
      'text',
      'text',
      'text',
    ]);
    expect(nodes[1].attrs?.variableKey).toBe('empresa.nome');
    expect(nodes[1].marks).toEqual([{ type: 'bold' }]);
    expect(nodes[3].marks).toEqual([{ type: 'italic' }]);
    expect(nodes[5].marks).toEqual([{ type: 'strike' }]);
  });

  it('só formata o que está bem formado', () => {
    expect(parseWhatsappLine('* texto*')).toEqual([{ type: 'text', text: '* texto*', marks: [] }]);
    expect(parseWhatsappLine('*texto *')).toEqual([{ type: 'text', text: '*texto *', marks: [] }]);
    expect(parseWhatsappLine('snake_case_word')).toEqual([
      { type: 'text', text: 'snake_case_word', marks: [] },
    ]);
    expect(parseWhatsappLine('2 * 3 * 4')).toEqual([{ type: 'text', text: '2 * 3 * 4', marks: [] }]);
  });

  it('tira o espaço de dentro da marca ao gerar o texto', () => {
    const text = whatsappEditorDocToText({
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Oi ' },
            { type: 'text', text: ' texto ', marks: [{ type: 'bold' }] },
            { type: 'text', text: 'fim' },
          ],
        },
      ],
    });
    expect(text).toBe('Oi  *texto* fim');
  });

  it('aceita marcas aninhadas e ida e volta', () => {
    const text = '*negrito _e itálico_ juntos* e ~riscado~';
    expect(whatsappEditorDocToText(whatsappTextToEditorDoc(text))).toBe(text);
  });

  it('texto vazio gera um documento com um parágrafo vazio', () => {
    expect(whatsappTextToEditorDoc('').content).toEqual([{ type: 'paragraph' }]);
    expect(whatsappEditorDocToText(whatsappTextToEditorDoc(''))).toBe('');
  });
});

describe('lista com marcadores do WhatsApp', () => {
  it('linhas "- item" e "* item" vão e voltam intactas', () => {
    const text = '- primeiro\n- segundo\n\n* terceiro\n* quarto {{os.numero}}';
    expect(whatsappEditorDocToText(whatsappTextToEditorDoc(text))).toBe(text);
  });

  it('o "* " do começo é marcador de lista e só o segundo trecho vira negrito', () => {
    expect(parseWhatsappLine('* item com *negrito*')).toEqual([
      { type: 'text', text: '* item com ', marks: [] },
      { type: 'text', text: 'negrito', marks: ['bold'] },
    ]);
    const text = '* item com *negrito*';
    expect(whatsappEditorDocToText(whatsappTextToEditorDoc(text))).toBe(text);
  });

  it('item de lista com negrito no texto também faz a ida e volta', () => {
    const text = '- *Valor:* {{cobranca.valor}}';
    expect(whatsappEditorDocToText(whatsappTextToEditorDoc(text))).toBe(text);
  });
});

describe('validateWhatsappCustomText', () => {
  it('aceita texto com variáveis do domínio', () => {
    const result = validateWhatsappCustomText('Olá, {{cliente.nome}}! OS {{os.numero}}.', 'os');
    expect(result.valid).toBe(true);
    expect(result.error).toBeNull();
  });

  it('recusa texto vazio', () => {
    expect(validateWhatsappCustomText('  \n ', 'os').error).toBe('empty');
  });

  it('recusa texto acima do limite', () => {
    const result = validateWhatsappCustomText('a'.repeat(WHATSAPP_CUSTOM_TEMPLATE_MAX_LENGTH + 1), 'os');
    expect(result.error).toBe('too_long');
    expect(result.length).toBe(WHATSAPP_CUSTOM_TEMPLATE_MAX_LENGTH + 1);
  });

  it('recusa variável de outro domínio', () => {
    const result = validateWhatsappCustomText('Valor {{cobranca.valor}}', 'os');
    expect(result.error).toBe('invalid_variables');
    expect(result.invalidTokens).toEqual(['cobranca.valor']);
    expect(validateWhatsappCustomText('Valor {{cobranca.valor}}', 'billing').valid).toBe(true);
  });
});
