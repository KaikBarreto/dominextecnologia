import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CleanTemplate } from './CleanTemplate';
import { AuroraTemplate } from './AuroraTemplate';
import { PrismaTemplate } from './PrismaTemplate';
import { VanguardaTemplate } from './VanguardaTemplate';
import { resolveSectionText, scaledLogoHeightPx } from './shared';
import type { ProposalTemplateProps } from './types';
import type { Quote, QuoteItem } from '@/hooks/useQuotes';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * Cobertura cross-template: logo_scale e customText da seção "sobre" têm que
 * se comportar IDÊNTICO nos 4 templates (Clean, Aurora, Prisma, Vanguarda).
 * O incidente clássico aqui é consertar 3 superfícies e esquecer a 4ª — ela
 * passa a mentir sem nenhum alarme de tipo (customization?.logo_scale é
 * opcional nos 4; um template que ignora o campo não quebra o build).
 *
 * Alturas-base de HOJE (px), por template e posição (capa/cabeçalho,
 * rodapé/fechamento) — as que o código já usava em classes Tailwind fixas
 * (h-14=56, h-12=48, h-11=44, h-8=32) antes deste patch:
 */
const TEMPLATES = [
  { name: 'Clean', Component: CleanTemplate, baseHeights: [56, 32] as const },
  { name: 'Aurora', Component: AuroraTemplate, baseHeights: [48, 44] as const },
  { name: 'Prisma', Component: PrismaTemplate, baseHeights: [44, 44] as const },
  { name: 'Vanguarda', Component: VanguardaTemplate, baseHeights: [48, 44] as const },
];

const item: QuoteItem = {
  id: 'item-1',
  position: 0,
  item_type: 'servico',
  description: 'Manutenção corretiva',
  quantity: 1,
  unit_price: 395,
  total_price: 395,
};

function buildQuote(overrides: Partial<Quote> = {}): Quote {
  return {
    id: 'quote-142', quote_number: 142, customer_id: null,
    prospect_name: 'Anglo', prospect_phone: null, prospect_email: 'tania@ccrdo.com.br',
    status: 'enviado', valid_until: '2026-10-20', discount_type: null, discount_value: null,
    subtotal: 395, discount_amount: 0, total_value: 395, notes: null, terms: null,
    assigned_to: null, proposal_template_id: null, token: 'token', created_by: null,
    created_at: '2026-10-14T12:00:00-03:00', updated_at: '2026-10-14T12:00:00-03:00',
    converted_to_os_id: null, final_price: 395, quote_items: [item],
    ...overrides,
  };
}

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

function render(Component: (props: ProposalTemplateProps) => JSX.Element, props: ProposalTemplateProps) {
  act(() => {
    root.render(<Component {...props} />);
  });
}

describe('logo_scale — proporcional sobre a altura-base, idêntico nos 4 templates', () => {
  for (const { name, Component, baseHeights } of TEMPLATES) {
    it(`${name}: sem logo_scale, altura do logo é EXATAMENTE a de hoje (${baseHeights.join('px / ')}px)`, () => {
      const quote = buildQuote();
      render(Component, {
        quote,
        company: null,
        items: [item],
        customization: { logo_url: 'https://example.com/logo.png' },
      });

      const imgs = Array.from(container.querySelectorAll('img')) as HTMLImageElement[];
      expect(imgs.length).toBeGreaterThanOrEqual(2);
      const heights = imgs.slice(0, 2).map((img) => img.style.height);
      expect(heights).toEqual(baseHeights.map((h) => `${h}px`));
    });

    // Controle positivo: se o default estivesse errado (ex.: aplicando a escala
    // mesmo com logo_scale ausente, ou ignorando a escala quando presente),
    // esta asserção FALHARIA. 200% tem que DOBRAR a altura-base de cada posição.
    it(`${name}: logo_scale 200 DOBRA a altura do logo em cada posição (controle positivo)`, () => {
      const quote = buildQuote();
      render(Component, {
        quote,
        company: null,
        items: [item],
        customization: { logo_url: 'https://example.com/logo.png', logo_scale: 200 },
      });

      const imgs = Array.from(container.querySelectorAll('img')) as HTMLImageElement[];
      const heights = imgs.slice(0, 2).map((img) => img.style.height);
      expect(heights).toEqual(baseHeights.map((h) => `${h * 2}px`));
    });
  }
});

describe('seção "Sobre a empresa" — customText honrado nos 4 templates', () => {
  for (const { name, Component } of TEMPLATES) {
    it(`${name}: sem customText, mostra a frase automática de hoje`, () => {
      const quote = buildQuote();
      render(Component, {
        quote,
        company: { id: 'c1', name: 'Clima Frio Ar Condicionado' } as any,
        items: [item],
        customization: {},
      });

      // A frase automática interpola o nome da empresa em negrito — ela SEMPRE
      // contém o nome da empresa quando não há customText.
      expect(container.textContent).toContain('Clima Frio Ar Condicionado');
      // E não deve mostrar nenhum texto livre de empresa (sem customText configurado).
    });

    it(`${name}: com customText, mostra o texto da empresa e NÃO a frase automática`, () => {
      const quote = buildQuote();
      const customText = 'Somos uma empresa familiar fundada em 2010.\nAtendemos toda a região metropolitana.';
      render(Component, {
        quote,
        company: { id: 'c1', name: 'Clima Frio Ar Condicionado' } as any,
        items: [item],
        customization: { sections: [{ key: 'sobre', enabled: true, order: 0, customText }] },
      });

      expect(container.textContent).toContain('Somos uma empresa familiar fundada em 2010.');
      expect(container.textContent).toContain('Atendemos toda a região metropolitana.');
      // A frase automática traz "especialmente para" (presente nos 4 locales
      // pt-br como parte de aboutText2) — não pode aparecer quando há customText.
      expect(container.textContent).not.toContain('especialmente para');
    });

    it(`${name}: texto do orçamento não vaza pra seção "sobre" (escopo do resolveSectionText)`, () => {
      // Regressão-alvo: um resolveSectionText mal portado (ex.: "quote.terms ||
      // customText" genérico, sem checar a KEY) deixaria o texto de
      // 'informacoes' (quote.terms) vazar pra dentro da seção 'sobre'. A mesma
      // função compartilhada (shared.ts) usada pelos 4 templates só lê
      // quote.terms para a key 'informacoes' e quote.notes para 'observacoes' —
      // nunca para 'sobre'.
      //
      // IMPORTANTE: quote.terms é renderizado LEGITIMAMENTE em outro bloco do
      // documento ("Condições e termos" / 'informacoes'), então a asserção não
      // pode ser "o termo não aparece em lugar nenhum do container" — ela tem
      // que mirar ESPECIFICAMENTE o parágrafo da seção "sobre": seu texto tem
      // que ser EXATAMENTE o customText, nada a mais (prova que não há
      // concatenação/vazamento do quote.terms ali dentro).
      const quote = buildQuote({ terms: 'TEXTO DE TERMOS DO ORCAMENTO, NAO PODE VAZAR' });
      const customText = 'Texto próprio da empresa para a seção sobre.';
      render(Component, {
        quote,
        company: { id: 'c1', name: 'Clima Frio Ar Condicionado' } as any,
        items: [item],
        customization: { sections: [{ key: 'sobre', enabled: true, order: 0, customText }] },
      });

      const sobreParagraph = Array.from(container.querySelectorAll('p'))
        .find((p) => p.textContent?.trim() === customText);
      expect(sobreParagraph, 'esperava achar um <p> com o texto EXATO do customText da seção sobre').toBeTruthy();
      expect(sobreParagraph?.textContent).not.toContain('TEXTO DE TERMOS DO ORCAMENTO');
    });
  }
});

/**
 * resolveSectionText é a MESMA função (shared.ts) usada pelos 4 templates
 * (os 3 novos chamam pra 'sobre'; o Clean a chama pra todas as chaves de
 * PROPOSAL_TEXT_SECTION_KEYS). Hoje só 'informacoes' (quote.terms) e
 * 'observacoes' (quote.notes) têm campo próprio no ORÇAMENTO — 'sobre' não
 * tem (daí o teste acima, de isolamento, ser o que prova a regra pra ela).
 * Este teste prova a metade que falta: quando a KEY tem campo no orçamento,
 * ele REALMENTE vence o customText da empresa — a mesma função que os 4
 * templates importam de shared.ts.
 */
describe('resolveSectionText — precedência real (quote > customText) nas chaves que têm campo no orçamento', () => {
  it('informacoes: quote.terms vence o customText da empresa', () => {
    const quote = buildQuote({ terms: 'Texto de termos do orçamento' });
    const result = resolveSectionText('informacoes', quote, 'Texto default da empresa');
    expect(result).toBe('Texto de termos do orçamento');
  });

  it('informacoes: sem quote.terms, cai no customText da empresa', () => {
    const quote = buildQuote({ terms: null });
    const result = resolveSectionText('informacoes', quote, 'Texto default da empresa');
    expect(result).toBe('Texto default da empresa');
  });
});

/**
 * `proposal_customization` é uma coluna JSONB livre: o slider do painel manda
 * 50–200, mas o valor pode chegar torto ao render (config editada à mão, string
 * vinda do banco, `null` gravado por um save antigo). Nenhum desses casos pode
 * virar logo invisível nem logo estourando a capa — e o PDF clona o que a tela
 * renderiza, então o estrago vai junto pro arquivo que o cliente recebe.
 */
describe('scaledLogoHeightPx — valor torto vindo do JSONB não quebra o logo', () => {
  const BASE = 48;

  it('não configurado (undefined/null) vale 100% — o tamanho de hoje', () => {
    expect(scaledLogoHeightPx(BASE, undefined)).toBe(BASE);
    // `Number(null)` é 0, que é finito e cairia no clamp em 50%: `null` tem que
    // ser tratado ANTES, senão quem nunca configurou nada tem o logo encolhido.
    expect(scaledLogoHeightPx(BASE, null as unknown as number)).toBe(BASE);
  });

  it('valor não numérico cai em 100%, nunca em NaN', () => {
    // `height: NaNpx` é inválido: o navegador cai em `auto` e o logo estoura a capa.
    expect(scaledLogoHeightPx(BASE, NaN)).toBe(BASE);
    expect(scaledLogoHeightPx(BASE, Infinity)).toBe(BASE);
    expect(scaledLogoHeightPx(BASE, 'grande' as unknown as number)).toBe(BASE);
  });

  it('string numérica do JSONB é aceita como número', () => {
    expect(scaledLogoHeightPx(BASE, '150' as unknown as number)).toBe(BASE * 1.5);
  });

  it('fora da faixa é limitado à MESMA faixa do slider (50–200)', () => {
    // 0 e negativo fariam o logo sumir sem erro nenhum — ninguém descobre até o
    // cliente receber a proposta.
    expect(scaledLogoHeightPx(BASE, 0)).toBe(BASE * 0.5);
    expect(scaledLogoHeightPx(BASE, -100)).toBe(BASE * 0.5);
    expect(scaledLogoHeightPx(BASE, 5000)).toBe(BASE * 2);
  });

  it('dentro da faixa passa intacto (controle positivo do clamp)', () => {
    // Falharia se o clamp estivesse grudado num valor fixo.
    expect(scaledLogoHeightPx(BASE, 50)).toBe(BASE * 0.5);
    expect(scaledLogoHeightPx(BASE, 100)).toBe(BASE);
    expect(scaledLogoHeightPx(BASE, 130)).toBe(BASE * 1.3);
    expect(scaledLogoHeightPx(BASE, 200)).toBe(BASE * 2);
  });
});
