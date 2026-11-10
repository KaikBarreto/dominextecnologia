import { describe, it, expect } from 'vitest';
import { sugerirRegime, regimeEcfMaisRecente } from '@/utils/regimeSugerido';

/**
 * Os literais esperados aqui são os MESMOS do select de regime em
 * `ImpostosSection.tsx` e vão pro provedor de emissão. Se este teste quebrar
 * por mudança de literal, conferir os dois lados antes de "consertar".
 */

describe('regimeEcfMaisRecente', () => {
  it('pega o item de MAIOR ano, não o último do array', () => {
    const lista = [
      { ano: 2024, forma_de_tributacao: 'LUCRO PRESUMIDO' },
      { ano: 2019, forma_de_tributacao: 'LUCRO REAL' },
    ];
    expect(regimeEcfMaisRecente(lista)).toEqual({
      ano: 2024,
      formaDeTributacao: 'LUCRO PRESUMIDO',
    });
  });

  it('ignora itens sem forma de tributação e lista ausente', () => {
    expect(regimeEcfMaisRecente([{ ano: 2024, forma_de_tributacao: '' }])).toBeNull();
    expect(regimeEcfMaisRecente([])).toBeNull();
    expect(regimeEcfMaisRecente(null)).toBeNull();
    expect(regimeEcfMaisRecente(undefined)).toBeNull();
  });
});

describe('sugerirRegime — tri-state', () => {
  it('null em opcao_pelo_simples NÃO é "não é optante"', () => {
    expect(sugerirRegime({ optanteSimples: null, optanteMei: null })).toBeNull();
    expect(sugerirRegime({})).toBeNull();
  });

  it('false não sugere nada por si só', () => {
    expect(sugerirRegime({ optanteSimples: false, optanteMei: false })).toBeNull();
  });

  it('MEI vence Simples (todo MEI é optante do Simples)', () => {
    expect(
      sugerirRegime({ optanteSimples: true, optanteMei: true, anoOpcaoMei: 2021 }),
    ).toEqual({ regime: 'mei', fonte: 'mei', ano: 2021 });
  });

  it('optante do Simples sugere simples_nacional com o ano da opção', () => {
    expect(
      sugerirRegime({ optanteSimples: true, optanteMei: false, anoOpcaoSimples: 2019 }),
    ).toEqual({ regime: 'simples_nacional', fonte: 'simples', ano: 2019 });
  });

  it('sem ano informado, a sugestão continua valendo com ano null', () => {
    expect(sugerirRegime({ optanteSimples: true })).toEqual({
      regime: 'simples_nacional',
      fonte: 'simples',
      ano: null,
    });
  });
});

describe('sugerirRegime — escrituração (ECF)', () => {
  it('LUCRO REAL e LUCRO PRESUMIDO mapeiam pros literais do select', () => {
    expect(
      sugerirRegime({
        optanteSimples: false,
        regimeEcf: { ano: 2024, formaDeTributacao: 'LUCRO REAL' },
      }),
    ).toEqual({ regime: 'lucro_real', fonte: 'ecf', ano: 2024 });

    expect(
      sugerirRegime({ regimeEcf: { ano: 2023, formaDeTributacao: 'Lucro Presumido' } }),
    ).toEqual({ regime: 'lucro_presumido', fonte: 'ecf', ano: 2023 });
  });

  it('ISENTO/IMUNE DE IRPJ e texto desconhecido não sugerem nada', () => {
    expect(sugerirRegime({ regimeEcf: { ano: 2024, formaDeTributacao: 'ISENTO DO IRPJ' } })).toBeNull();
    expect(sugerirRegime({ regimeEcf: { ano: 2024, formaDeTributacao: 'IMUNE DE IRPJ' } })).toBeNull();
    expect(sugerirRegime({ regimeEcf: { ano: 2024, formaDeTributacao: 'LUCRO ARBITRADO' } })).toBeNull();
    expect(sugerirRegime({ regimeEcf: { ano: 2024, formaDeTributacao: 'REGIME NOVO X' } })).toBeNull();
  });

  it('opção pelo Simples vence a escrituração antiga', () => {
    expect(
      sugerirRegime({
        optanteSimples: true,
        anoOpcaoSimples: 2025,
        regimeEcf: { ano: 2024, formaDeTributacao: 'LUCRO PRESUMIDO' },
      }),
    ).toEqual({ regime: 'simples_nacional', fonte: 'simples', ano: 2025 });
  });
});
