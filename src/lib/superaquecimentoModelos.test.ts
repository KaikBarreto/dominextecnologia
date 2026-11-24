import { describe, expect, it } from 'vitest';
import { MODELOS_SUPERAQUECIMENTO, MODELO_PADRAO_ID, getModeloSuperaquecimento } from './superaquecimentoModelos';

describe('rastreabilidade dos perfis de SH e SC', () => {
  it('mantém a referência padrão explicitamente genérica, sem fonte de fabricante inventada', () => {
    const padrao = getModeloSuperaquecimento(MODELO_PADRAO_ID);
    expect(padrao).toMatchObject({ alvoSH: [4, 8], alvoSC: null, confianca: 'generico' });
    expect(padrao?.fonteUrl).toBeUndefined();
    expect(padrao?.refrigPadrao).toBeUndefined();
  });
  it('mantém os IDs dos perfis salvos, mas nenhum alvo ou gás automático sem manual confirmado', () => {
    const idsLegados = ['split-11d', 'samsung', 'comfee', 'philco-elgin', 'hitachi-hiwall', 'york-hiwall', 'rheem-k7-hiwall', 'carrier-springer-pt-k7', 'hitachi-serie-e', 'carrier-ecosplit'];
    for (const id of idsLegados) {
      const perfil = getModeloSuperaquecimento(id);
      expect(perfil?.id).toBe(id);
      expect(perfil?.label).toBeTruthy();
      expect(perfil?.alvoSH).toBeNull();
      expect(perfil?.alvoSC).toBeNull();
      expect(perfil?.confianca).toBe('generico');
      expect(perfil?.refrigPadrao).toBeUndefined();
      expect(perfil?.fonteUrl).toBeUndefined();
      expect(perfil?.nota).toContain('modelo exato');
      expect(perfil?.nota).not.toMatch(/\d.*(?:°C|g\/m)/);
    }
  });
  it('somente publica dados documentados com modelo, revisão, páginas e condição de aplicação', () => {
    const verificados = MODELOS_SUPERAQUECIMENTO.filter(modelo => modelo.fonteUrl);
    expect(verificados.length).toBeGreaterThanOrEqual(11);
    for (const modelo of verificados) {
      expect(new URL(modelo.fonteUrl!).protocol).toBe('https:');
      expect(modelo.fonteDocumento).toBeTruthy();
      expect(modelo.fontePaginas?.length).toBeGreaterThan(0);
      expect(modelo.fontePaginas?.every(pagina => Number.isInteger(pagina) && pagina > 0)).toBe(true);
      expect(modelo.revisadoEm).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(modelo.modelosAbrangidos?.length).toBeGreaterThan(0);
      expect(modelo.condicoes).toBeTruthy();
      expect(modelo.confianca).toBe('alta');
      if (modelo.copiaDistribuidor) expect(modelo.fonteSuporteUrl).toMatch(/^https:\/\//);
    }
  });
  it.each([
    ['carrier-space-42xqm-18-24-r22-2015', [5, 10], null, 'R-22'],
    ['carrier-ecosplit-ct-2014', [3, 15], [4, 8], 'R-410A'],
    ['philco-pac30000-m8w', [7, 11], null, 'R-410A'],
  ])('preserva a faixa da revisão documentada: %s', (id, alvoSH, alvoSC, refrigPadrao) => {
    expect(getModeloSuperaquecimento(id as string)).toMatchObject({ alvoSH, alvoSC, refrigPadrao, metodoCarga: 'sh-sc' });
  });
  it.each([
    'gree-gtop-auto-r32-rev00',
    'gree-ghcn36-60-r410-2020',
    'midea-ai-airvolution-efv-r32',
    'daikin-ftkp-q-09-18',
    'daikin-ecoswing-gold-s-r32',
    'samsung-dxea-dxfa-dyfa-dyfz-2024',
    'hitachi-airhome600-2023',
    'elgin-eco-hv-b2-2019',
  ])('não inventa alvo de SH/SC para procedimento por peso: %s', id => {
    expect(getModeloSuperaquecimento(id)).toMatchObject({ alvoSH: null, alvoSC: null, metodoCarga: 'peso' });
  });
  it('preserva as condições ARI e não generaliza o gás das outras combinações Carrier Space', () => {
    const modelo = getModeloSuperaquecimento('carrier-space-42xqm-18-24-r22-2015');
    expect(modelo?.condicoes).toContain('26,7');
    expect(modelo?.condicoes).toContain('19,4');
    expect(modelo?.modelosAbrangidos).toHaveLength(4);
    expect(modelo?.modelosAbrangidos?.every(codigo => /38K[QC]D0(?:18|24)515MC/.test(codigo))).toBe(true);
  });
  it('não publica uma fórmula com a divergência de comprimentos da revisão Samsung', () => {
    const modelo = getModeloSuperaquecimento('samsung-dxea-dxfa-dyfa-dyfz-2024');
    expect(modelo?.nota).not.toMatch(/\d.*(?:g\/m|metros|m\b)/);
    expect(modelo?.nota).toContain('revisão específica');
    expect(modelo?.nota).toContain('não calcula a massa');
  });
  it('publica os mesmos dados pelo getter, sem duplicar IDs nem alterar rascunhos antigos', () => {
    expect(new Set(MODELOS_SUPERAQUECIMENTO.map(modelo => modelo.id)).size).toBe(MODELOS_SUPERAQUECIMENTO.length);
    for (const modelo of MODELOS_SUPERAQUECIMENTO) {
      expect(modelo).toEqual(getModeloSuperaquecimento(modelo.id));
    }
    expect(getModeloSuperaquecimento('modelo-inexistente')).toBeUndefined();
  });
});
