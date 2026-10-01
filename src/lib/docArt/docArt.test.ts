import { describe, it, expect } from 'vitest';

import { layoutParagraph, layoutParagraphs, parseInlineHtml, transformRuns } from './inline';
import {
  alignOffsetMm,
  buildPalette,
  getSlotHtml,
  idealForeground,
  isToggleOn,
  lineBaselineMm,
  parseHex,
  resolveDocArt,
  resolveTheme,
} from './resolve';
import { DOC_ART_TEMPLATES, getDocArtTemplate } from './templates/index';
import type { DocArtConfig, ResolvedTextShape } from './types';

/**
 * Medida determinística: cada caractere vale 0,5 do corpo. Não depende de
 * canvas nem de fonte — o que está sob teste é a REGRA de quebra, não a
 * métrica da fonte.
 */
const measure = (text: string, { size }: { size: number }) => text.length * size * 0.5;

/** Reconstitui o texto de uma linha a partir dos trechos posicionados. */
const text = (line: { pieces: Array<{ text: string }> }) =>
  line.pieces.map((p) => p.text).join(' ');

describe('parseInlineHtml', () => {
  it('quebra parágrafos e preserva negrito e itálico', () => {
    const paragraphs = parseInlineHtml(
      '<p>Olá <strong>Mundo</strong> e <em>outro</em></p><p>Segundo</p>',
    );
    expect(paragraphs).toHaveLength(2);
    expect(paragraphs[0]).toEqual([
      { text: 'Olá ', bold: false, italic: false },
      { text: 'Mundo', bold: true, italic: false },
      { text: ' e ', bold: false, italic: false },
      { text: 'outro', bold: false, italic: true },
    ]);
    expect(paragraphs[1]).toEqual([{ text: 'Segundo', bold: false, italic: false }]);
  });

  it('trata <br> como quebra dura', () => {
    expect(parseInlineHtml('um<br>dois')).toEqual([
      [{ text: 'um', bold: false, italic: false }],
      [{ text: 'dois', bold: false, italic: false }],
    ]);
  });

  it('decodifica entidades e colapsa espaço', () => {
    expect(parseInlineHtml('<p>a&nbsp;&amp;   b</p>')).toEqual([
      [{ text: 'a & b', bold: false, italic: false }],
    ]);
  });

  it('ignora tag desconhecida mas mantém o texto', () => {
    expect(parseInlineHtml('<p>a <u>sublinhado</u> b</p>')).toEqual([
      [{ text: 'a sublinhado b', bold: false, italic: false }],
    ]);
  });

  it('não deixa parágrafo vazio nas pontas', () => {
    expect(parseInlineHtml('<p>&nbsp;</p><p>texto</p><p>&nbsp;</p>')).toEqual([
      [{ text: 'texto', bold: false, italic: false }],
    ]);
  });

  it('html vazio vira lista vazia', () => {
    expect(parseInlineHtml('')).toEqual([]);
    expect(parseInlineHtml('   ')).toEqual([]);
  });
});

describe('transformRuns', () => {
  it('aplica uppercase em todos os runs', () => {
    const out = transformRuns([[{ text: 'olá ação', bold: false, italic: false }]], 'uppercase');
    expect(out[0][0].text).toBe('OLÁ AÇÃO');
  });

  it('não mexe quando o transform é none ou ausente', () => {
    const input = [[{ text: 'Olá', bold: false, italic: false }]];
    expect(transformRuns(input, 'none')).toBe(input);
    expect(transformRuns(input, undefined)).toBe(input);
  });
});

describe('layoutParagraph', () => {
  it('quebra ao estourar a largura', () => {
    // 10pt × 0,5 = 5pt por caractere. 40pt = 8 caracteres por linha.
    const lines = layoutParagraph([{ text: 'aaa bbb ccc', bold: false, italic: false }], {
      maxWidth: 40,
      size: 10,
      measure,
    });
    expect(lines.map(text)).toEqual(['aaa bbb', 'ccc']);
  });

  it('não corta palavra que sozinha não cabe', () => {
    const lines = layoutParagraph(
      [{ text: 'incomensuravelmente', bold: false, italic: false }],
      { maxWidth: 20, size: 10, measure },
    );
    expect(lines).toHaveLength(1);
    expect(text(lines[0])).toBe('incomensuravelmente');
  });

  it('preserva o negrito ao atravessar a quebra', () => {
    const lines = layoutParagraph(
      [
        { text: 'aaa ', bold: false, italic: false },
        { text: 'bbbb cccc', bold: true, italic: false },
      ],
      { maxWidth: 45, size: 10, measure },
    );
    expect(lines.map(text)).toEqual(['aaa bbbb', 'cccc']);
    const flat = lines.flatMap((l) => l.pieces);
    expect(flat.filter((p) => p.bold).map((p) => p.text)).toEqual(['bbbb', 'cccc']);
  });

  it('parágrafo vazio vira uma linha em branco (o respiro do gestor)', () => {
    expect(layoutParagraph([], { maxWidth: 100, size: 10, measure })).toEqual([
      { pieces: [], width: 0, paragraphIndex: 0 },
    ]);
  });

  it('não perde o espaço quando o separador fica no FIM do run anterior', () => {
    // "A empresa " + <strong>Acme</strong> — o bug saía como "A empresaAcme".
    const lines = layoutParagraph(
      [
        { text: 'A empresa ', bold: false, italic: false },
        { text: 'Acme', bold: true, italic: false },
      ],
      { maxWidth: 1000, size: 10, measure },
    );
    expect(text(lines[0])).toBe('A empresa Acme');
  });

  it('o espaço sobrevive ao html real com <strong> no meio da frase', () => {
    // Regressão do bug que saía "A empresaAcme" no PDF: entre a palavra normal
    // e a em negrito tem que haver DISTÂNCIA, e a vírgula logo depois do
    // negrito tem que vir COLADA.
    const paragraphs = parseInlineHtml(
      '<p>A empresa <strong>Acme</strong>, inscrita no CNPJ nº <strong>123</strong>.</p>',
    );
    const [line] = layoutParagraph(paragraphs[0], { maxWidth: 1000, size: 10, measure });
    const at = (t: string) => line.pieces.find((p) => p.text === t)!;

    const empresa = at('empresa');
    const acme = at('Acme');
    expect(acme.bold).toBe(true);
    // 'empresa' tem 7 caracteres × 5pt = 35pt; o espaço vale mais 5pt.
    expect(acme.x).toBeCloseTo(empresa.x + 35 + 5, 6);

    // A vírgula colou no negrito: começa exatamente onde 'Acme' (4 letras) termina.
    const virgula = at(',');
    expect(virgula.x).toBeCloseTo(acme.x + 4 * 5, 6);
  });
});

describe('layoutParagraphs', () => {
  it('respeita maxLines', () => {
    const paragraphs = parseInlineHtml('<p>aaa bbb ccc ddd eee fff</p>');
    const lines = layoutParagraphs(paragraphs, {
      maxWidth: 40,
      size: 10,
      maxLines: 2,
      measure,
    });
    expect(lines).toHaveLength(2);
  });
});

describe('cor', () => {
  it('parseHex aceita 3 e 6 dígitos e rejeita lixo', () => {
    expect(parseHex('#fff')).toEqual([255, 255, 255]);
    expect(parseHex('1e3a8a')).toEqual([30, 58, 138]);
    expect(parseHex('azul')).toBeNull();
    expect(parseHex(undefined)).toBeNull();
  });

  it('idealForeground escolhe por luminância', () => {
    expect(idealForeground('#ffffff')).toBe('#0f172a');
    expect(idealForeground('#1e3a8a')).toBe('#ffffff');
  });

  it('a paleta deriva ink e onPrimary do tema, sem escurecer a marca', () => {
    const palette = buildPalette({
      primary: '#1e3a8a',
      accent: '#c08a2e',
      bg: '#ffffff',
      paper: '#ffffff',
    });
    expect(palette.primary).toBe('#1e3a8a');
    expect(palette.ink).toBe('#0f172a');
    expect(palette.onPrimary).toBe('#ffffff');
    // inkSoft fica entre o ink e o papel — mais claro que ink, sem virar branco.
    expect(palette.inkSoft).not.toBe(palette.ink);
    expect(palette.inkSoft).not.toBe('#ffffff');
  });
});

describe('tema e toggles', () => {
  const template = DOC_ART_TEMPLATES[0];

  it('config sobrescreve campo a campo, ignorando hex inválido', () => {
    const theme = resolveTheme(template, {
      theme: { primary: '#ff0000', accent: 'vermelho' },
    });
    expect(theme.primary).toBe('#ff0000');
    expect(theme.accent).toBe(template.defaultTheme.accent);
  });

  it('toggle ausente nasce ligado', () => {
    expect(isToggleOn('signature', undefined)).toBe(true);
    expect(isToggleOn('signature', { toggles: {} })).toBe(true);
    expect(isToggleOn('signature', { toggles: { signature: false } })).toBe(false);
  });
});

describe('peso da caixa de texto', () => {
  it('caixa em negrito marca TODOS os runs — medida e desenho usam a mesma fonte', () => {
    // Regressão: medir em peso normal e desenhar em negrito deixa o texto mais
    // largo que o medido e come o espaço entre as palavras.
    const template = DOC_ART_TEMPLATES[0];
    const art = resolveDocArt(template, { slots: { assinaturaNome: 'Carlos Eduardo' } });
    const nome = art.shapes.find(
      (s): s is ResolvedTextShape => s.kind === 'text' && s.slot === 'assinaturaNome',
    );
    expect(nome?.weight).toBe('bold');
    expect(nome?.paragraphs[0].every((r) => r.bold)).toBe(true);
  });
});

describe('getSlotHtml', () => {
  const template = DOC_ART_TEMPLATES[0];

  it('usa o default da arte quando o gestor não salvou nada', () => {
    expect(getSlotHtml(template, undefined, 'titulo')).toBe(template.defaultSlots.titulo);
  });

  it('string vazia salva pelo gestor VENCE o default (é como se apaga um slot)', () => {
    expect(getSlotHtml(template, { slots: { titulo: '' } }, 'titulo')).toBe('');
  });
});

describe('resolveDocArt', () => {
  it('toggle desligado remove os shapes que dependem dele', () => {
    const template = DOC_ART_TEMPLATES[0];
    const com = resolveDocArt(template, {});
    const sem = resolveDocArt(template, { toggles: { signature: false } });
    const conta = (art: typeof com) =>
      art.shapes.filter((s) => s.kind === 'image' && s.src === 'signature').length;
    expect(conta(com)).toBe(1);
    expect(conta(sem)).toBe(0);
  });

  it('slot esvaziado some do desenho', () => {
    const template = DOC_ART_TEMPLATES[0];
    const config: DocArtConfig = { slots: { destaque: '' } };
    const art = resolveDocArt(template, config);
    const temDestaque = art.shapes.some((s) => s.kind === 'text' && s.slot === 'destaque');
    expect(temDestaque).toBe(false);
  });

  it('aplica o substitute nas variáveis antes de montar os runs', () => {
    const template = DOC_ART_TEMPLATES[0];
    const art = resolveDocArt(
      template,
      { slots: { titulo: 'Certificado de <span data-pmoc-var="empresa.nome"></span>' } },
      { substitute: (html) => html.replace(/<span[^>]*><\/span>/g, 'Acme') },
    );
    const titulo = art.shapes.find(
      (s): s is ResolvedTextShape => s.kind === 'text' && s.slot === 'titulo',
    );
    // O título das artes atuais não é caixa alta — a hierarquia vem do corpo
    // da fonte, não do `transform`.
    expect(titulo?.paragraphs[0].map((r) => r.text).join('')).toBe('Certificado de Acme');
  });

  it('resolve token de cor em hex final', () => {
    for (const template of DOC_ART_TEMPLATES) {
      const art = resolveDocArt(template, { theme: { primary: '#123456' } });
      // Nenhum token sobrevive ao resolve: tudo que chega no renderizador é hex.
      for (const shape of art.shapes) {
        for (const key of ['fill', 'stroke', 'color'] as const) {
          const value = (shape as Record<string, unknown>)[key];
          if (typeof value === 'string') {
            expect(value, `${template.slug}/${shape.kind}/${key}`).toMatch(/^#[0-9a-f]{6}$/i);
          }
        }
      }
      // E a cor da marca chegou de fato em algum lugar do desenho.
      const usaPrimary = art.shapes.some((s) =>
        (['fill', 'color'] as const).some(
          (k) => (s as Record<string, unknown>)[k] === '#123456',
        ),
      );
      expect(usaPrimary, template.slug).toBe(true);
    }
  });

  it('a página segue a orientação declarada pela arte', () => {
    expect(resolveDocArt(getDocArtTemplate('portico')!).page).toEqual({ w: 210, h: 297 });
    expect(resolveDocArt(getDocArtTemplate('bloco')!).page).toEqual({ w: 297, h: 210 });
  });
});

describe('registro de artes', () => {
  it('slug desconhecido NÃO cai num default — volta null pra preservar o layout legado', () => {
    expect(getDocArtTemplate('nao-existe')).toBeNull();
    expect(getDocArtTemplate(null)).toBeNull();
    expect(getDocArtTemplate('')).toBeNull();
  });

  it('nenhuma arte carimba o selo de conformidade (era um PNG inventado)', () => {
    for (const template of DOC_ART_TEMPLATES) {
      const refs = template.shapes
        .map((s) => s.shape)
        .filter((s) => s.kind === 'image')
        .map((s) => s.src);
      expect(refs, template.slug).not.toContain('seal');
      expect(template.toggles, template.slug).not.toContain('seal');
    }
  });

  it('todo slug é único', () => {
    const slugs = DOC_ART_TEMPLATES.map((t) => t.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('todo slot desenhado pela arte está declarado em `slots` e tem default', () => {
    for (const template of DOC_ART_TEMPLATES) {
      for (const { shape } of template.shapes) {
        if (shape.kind !== 'text') continue;
        expect(template.slots, `${template.slug}/${shape.slot}`).toContain(shape.slot);
        expect(
          template.defaultSlots[shape.slot],
          `${template.slug}/${shape.slot} sem texto default`,
        ).toBeTruthy();
      }
    }
  });

  it('nenhum texto invade a margem de 10 mm de segurança de impressão', () => {
    for (const template of DOC_ART_TEMPLATES) {
      const page = resolveDocArt(template).page;
      for (const { shape } of template.shapes) {
        if (shape.kind !== 'text') continue;
        const label = `${template.slug}/${shape.slot}`;
        expect(shape.x, label).toBeGreaterThanOrEqual(10);
        expect(shape.y, label).toBeGreaterThanOrEqual(10);
        // O slot girado ocupa a vertical, não a horizontal — por isso a
        // largura da caixa só vale como limite quando não há rotação.
        if (!shape.rotate) {
          expect(shape.x + shape.w, label).toBeLessThanOrEqual(page.w - 10);
        }
        expect(shape.y, label).toBeLessThanOrEqual(page.h - 10);
      }
    }
  });
});

describe('geometria compartilhada', () => {
  it('a baseline da primeira linha desce pelo ascendente, não pela altura de linha', () => {
    // size 12pt → ascendente 9,12pt → 3,217mm
    expect(lineBaselineMm(100, 18, 12, 0)).toBeCloseTo(100 + (12 * 0.76 * 25.4) / 72, 4);
    // a segunda linha soma uma altura de linha inteira
    expect(lineBaselineMm(100, 18, 12, 1) - lineBaselineMm(100, 18, 12, 0)).toBeCloseTo(
      (18 * 25.4) / 72,
      4,
    );
  });

  it('alignOffsetMm centraliza e alinha à direita pela largura medida', () => {
    const boxW = 100;
    const lineWidthPt = (50 * 72) / 25.4; // 50 mm em pt
    expect(alignOffsetMm('left', boxW, lineWidthPt)).toBe(0);
    expect(alignOffsetMm('center', boxW, lineWidthPt)).toBeCloseTo(25, 6);
    expect(alignOffsetMm('right', boxW, lineWidthPt)).toBeCloseTo(50, 6);
  });
});
