import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  activityArtFileName,
  formatConversionRate,
  goalProgress,
  generateActivityArtBlob,
  type ActivityArtInput,
} from '../salespersonActivityArt';

// html-to-image é mockado — o teste cobre a LÓGICA (slug, taxas, meta, fallback
// de foto), não a captura de imagem de verdade (isso é QA no navegador).
vi.mock('html-to-image', () => ({
  toBlob: vi.fn(async () => new Blob(['fake-png'], { type: 'image/png' })),
}));

function buildInput(overrides: Partial<ActivityArtInput> = {}): ActivityArtInput {
  return {
    salespersonName: 'Maicon Souza',
    salespersonPhotoUrl: null,
    activityDate: '2026-10-02',
    period: 'morning',
    contacts: 40,
    meetingsScheduled: 4,
    meetingsHeld: 2,
    salesCount: 1,
    notes: null,
    dayContacts: 140,
    dayMeetingsScheduled: 4,
    goalContacts: 200,
    goalMeetingsScheduled: 5,
    generatedAtIso: '2026-10-02T13:45:00.000Z',
    ...overrides,
  };
}

describe('activityArtFileName', () => {
  it('remove acento, baixa caixa e troca espaço por hífen', () => {
    expect(activityArtFileName('José Ávila', '2026-10-02', 'morning')).toBe(
      'atividade-jose-avila-2026-10-02-manha.png',
    );
  });

  it('normaliza nome em caixa alta com múltiplas palavras', () => {
    expect(activityArtFileName('MARIA DA SILVA', '2026-10-02', 'afternoon')).toBe(
      'atividade-maria-da-silva-2026-10-02-tarde.png',
    );
  });

  it('usa o sufixo certo por período: manha x tarde', () => {
    expect(activityArtFileName('Ana', '2026-10-02', 'morning')).toMatch(/-manha\.png$/);
    expect(activityArtFileName('Ana', '2026-10-02', 'afternoon')).toMatch(/-tarde\.png$/);
  });

  it('nunca produz arquivo sem nome quando o slug fica vazio', () => {
    expect(activityArtFileName('   ', '2026-10-02', 'morning')).toBe(
      'atividade-vendedor-2026-10-02-manha.png',
    );
  });
});

describe('formatConversionRate', () => {
  it('denominador 0 vira travessão, nunca NaN/Infinity', () => {
    expect(formatConversionRate(5, 0)).toBe('—');
    expect(formatConversionRate(0, 0)).toBe('—');
  });

  it('calcula a taxa arredondada quando o denominador é positivo', () => {
    expect(formatConversionRate(2, 4)).toBe('50%');
    expect(formatConversionRate(1, 3)).toBe('33%');
  });

  it('nunca retorna a string literal NaN% ou Infinity%', () => {
    const result = formatConversionRate(5, 0);
    expect(result).not.toContain('NaN');
    expect(result).not.toContain('Infinity');
  });
});

describe('goalProgress', () => {
  it('0 de progresso: percent e barPercent zerados, meta não batida', () => {
    expect(goalProgress(0, 200)).toEqual({ percent: 0, barPercent: 0, met: false });
  });

  it('progresso parcial', () => {
    expect(goalProgress(100, 200)).toEqual({ percent: 50, barPercent: 50, met: false });
  });

  it('exatamente 100% bate a meta', () => {
    expect(goalProgress(200, 200)).toEqual({ percent: 100, barPercent: 100, met: true });
  });

  it('acima de 100%: percent real passa de 100, barPercent capa em 100', () => {
    expect(goalProgress(250, 200)).toEqual({ percent: 125, barPercent: 100, met: true });
  });

  it('meta zero/indefinida não quebra em NaN', () => {
    expect(goalProgress(0, 0)).toEqual({ percent: 0, barPercent: 0, met: false });
    expect(goalProgress(5, 0)).toEqual({ percent: 100, barPercent: 100, met: true });
  });
});

describe('generateActivityArtBlob — fallback de foto', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = vi.fn().mockRejectedValue(new Error('network down')) as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.clearAllMocks();
  });

  it('gera a imagem mesmo quando o fetch da foto do vendedor falha (cai no monograma)', async () => {
    const input = buildInput({ salespersonPhotoUrl: 'https://example.com/foto.jpg' });

    const blob = await generateActivityArtBlob(input);

    expect(blob).toBeInstanceOf(Blob);
    expect(global.fetch).toHaveBeenCalledWith('https://example.com/foto.jpg');
  });

  it('gera a imagem normalmente quando não há foto nenhuma', async () => {
    const input = buildInput({ salespersonPhotoUrl: null });

    const blob = await generateActivityArtBlob(input);

    expect(blob).toBeInstanceOf(Blob);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
