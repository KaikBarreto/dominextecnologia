import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { FONTES_TABELAS_SATURACAO } from './refrigerantSaturationSources';
import { REFRIGERANTES, pressaoParaTempSat, tempParaPressao, type Curva } from '@/lib/refrigerantes';

// Impressões das linhas documentais extraídas dos PDFs, antes da normalização
// no app. Atualizar exige conferir novamente documento/página, não só snapshots.
const DOCUMENTOS_CONFERIDOS: Record<string, [number, string]> = {
  R22: [45, 'a7d4f18fde5fa8d1e0bfd88af64b981eb559e8910a0c25a36e38ad4eb79ea759'],
  R410A: [37, '4d4c7565edfe23f19d64293c6741cb946b1639bfd13d00b8798410e4d9ff0ffd'],
  R134A: [45, '4d5249972acfe19fd80a5d9134daa13f742f7e27ad7e4ff7c62c5f863add4a40'],
  R290: [43, '0fc6f967524fdca949b3cfb3a58687dde4aac8b0d8300c211c9d0cdc7d693a58'],
  R404A: [44, '74a5668ae33ebe885ccf0ac0b1ce3991f560b58379585f7691b5fa292c105883'],
  R407C: [41, '71d6631fb02855a48800bf0a570c86ced7a533d31130e3abdb91bdb36599edb4'],
  R422D: [41, 'c108adff856b22e60d4d119abf467e16d0f69a4df8674b092f6364b014a15ddd'],
  R407A: [41, '847437481c36e9cbff6b8d4510fb8aebcf507a83e7e57ac13ce38d436075a1ea'],
  R449A: [39, '6d40a21054772604f49f4e4385c1bf6740471b287f1a52fae9788a49d38d3928'],
  R12: [45, 'c3a22503355ed844355a13dadfe958f17efecff8ed4d79560819f4c0ad6e51da'],
  R32: [59, 'b9dafea125aaebf515828a9fbc70640eaf10d1dddce42359372438c524ce4fe6'],
  R438A: [103, '569e0a52f813dd0cfd0d6dc4c924aaabdfce60802fccc32208ea31e0d8bf9972'],
  R448A: [56, '01cdab53822ca0fa6d5881416d6bd95585c941b281f6a7d2d94a4626ef92fae6'],
};

// Checkpoints independentes: frio/meio/quente das publicações originais.
// National: [°F, psia líquido, psia vapor?]. A pressão da fonte é absoluta.
const NATIONAL_CHECKPOINTS: Record<string, number[][]> = {
  'R-22': [[-60, 8.8], [50, 98.8], [160, 444.7]],
  'R-410A': [[-40, 25.6, 25.5], [50, 157.4, 156.9], [140, 555.9, 554.8]],
  'R-134a': [[-60, 4], [50, 60.2], [160, 314.7]],
  'R-290': [[-60, 9.7], [45, 85.3], [150, 343.6]],
  'R-404A': [[-60, 11.8, 11.3], [50, 120.7, 118.9], [155, 500, 498.4]],
  'R-407C': [[-60, 10.2, 6.9], [40, 94.9, 77.9], [140, 400.7, 366.1]],
  'R-422D': [[-60, 10, 7.5], [40, 90.6, 81.1], [140, 378, 364]],
  'R-407A': [[-60, 10.8, 7.6], [40, 100, 84.1], [140, 421, 390]],
  'R-449A': [[-40, 19.5, 14.6], [55, 132, 112], [150, 477, 444]],
  'R-12': [[-60, 5.4], [50, 61.3], [160, 279]],
};

describe('origem documental integral das curvas de saturação', () => {
  for (const [id, [count, checksum]] of Object.entries(DOCUMENTOS_CONFERIDOS)) {
    it(`${id}: todas as linhas conferidas permanecem intactas`, () => {
      const source = FONTES_TABELAS_SATURACAO[id];
      expect(source.rows).toHaveLength(count);
      expect(createHash('sha256').update(JSON.stringify(source.rows)).digest('hex')).toBe(checksum);
      expect(source.pdfSha256).toMatch(/^[a-f0-9]{64}$/);
      expect(source.url).toMatch(/^https:\/\//);
      expect(source.pages.length).toBeGreaterThan(0);
      expect(source.reviewedAt).toBe('2026-11-15');
    });
  }

  it('todos os pontos usados são linhas da fonte, com a transformação de unidade declarada', () => {
    let curveCount = 0;
    let pointCount = 0;
    for (const gas of REFRIGERANTES) {
      const source = gas.fonte;
      expect(source).toBe(FONTES_TABELAS_SATURACAO[gas.id.replace('-', '').toUpperCase()]);
      for (const curve of Object.keys(source.curves) as Curva[]) {
        curveCount++;
        const table = gas[curve]!;
        const column = source.curves[curve]!;
        const raw = source.rows.filter(row => !source.excluded?.some(ex => ex.curve === curve && ex.coordinate === row[0]));
        expect(table).toHaveLength(raw.length);
        pointCount += raw.length;
        for (let i = 0; i < raw.length; i++) {
          const row = raw[i];
          const temperature = source.axis === 'temperature' ? row[0] : row[column];
          const pressure = source.axis === 'pressure' ? row[0] : row[column];
          const expectedC = source.temperatureUnit === 'C' ? temperature : (temperature - 32) / 1.8;
          const expectedBar = source.pressureUnit === 'psia' ? (pressure - 14.695948776) / 14.503773773
            : source.pressureUnit === 'psig' ? pressure / 14.503773773 : pressure;
          expect(table[i].t).toBeCloseTo(expectedC, 10);
          expect(table[i].bar).toBeCloseTo(expectedBar, 10);
        }
      }
    }
    expect(curveCount).toBe(21);
    expect(pointCount).toBe(1039);
  });

  for (const [gasId, checkpoints] of Object.entries(NATIONAL_CHECKPOINTS)) {
    it(`${gasId}: confere frio, meio e quente com a tabela física National`, () => {
      for (const [f, liquidAbs, vaporAbs] of checkpoints) {
        const c = (f - 32) / 1.8;
        const curve = vaporAbs === undefined ? 'unica' : 'bubble';
        expect(tempParaPressao(gasId, c, 'psi', curve)).toBeCloseTo(liquidAbs - 14.695948776, 8);
        if (vaporAbs !== undefined) expect(tempParaPressao(gasId, c, 'psi', 'dew')).toBeCloseTo(vaporAbs - 14.695948776, 8);
      }
    });
  }
  it('R32 confere a coluna SI da Chemours sem confundir as colunas de blends', () => {
    for (const [c, bar] of [[-50, 0.09], [8, 9.41], [66, 43.78]]) {
      expect(tempParaPressao('R-32', c, 'bar', 'unica')).toBeCloseTo(bar, 10);
      expect(pressaoParaTempSat('R-32', bar, 'bar', 'unica')).toBeCloseTo(c, 10);
    }
  });
  it('R438A confere as duas colunas MO99, não as de R22/NU22B do mesmo documento', () => {
    for (const [psi, liquidF, vaporF] of [[-6, -63, -51.5], [95, 52.2, 61.2], [400, 148.1, 153.4]]) {
      expect(pressaoParaTempSat('R-438A', psi, 'psi', 'bubble')).toBeCloseTo((liquidF - 32) / 1.8, 10);
      expect(pressaoParaTempSat('R-438A', psi, 'psi', 'dew')).toBeCloseTo((vaporF - 32) / 1.8, 10);
    }
  });
  it('R448A confere os extremos e o ponto101psig da Solstice', () => {
    for (const [psi, liquidF, vaporF] of [[0, -51, -39.9], [101, 46.5, 56.3], [450, 146.9, 153]]) {
      expect(pressaoParaTempSat('R-448A', psi, 'psi', 'bubble')).toBeCloseTo((liquidF - 32) / 1.8, 10);
      expect(pressaoParaTempSat('R-448A', psi, 'psi', 'dew')).toBeCloseTo((vaporF - 32) / 1.8, 10);
    }
  });
  it('não troca as colunas de líquido e vapor nos blends, inclusive R410A', () => {
    for (const gas of REFRIGERANTES.filter(g => g.temGlide)) {
      const min = Math.max(gas.bubble![0].t, gas.dew![0].t);
      const max = Math.min(gas.bubble![gas.bubble!.length - 1].t, gas.dew![gas.dew!.length - 1].t);
      for (const fraction of [0, 0.2, 0.5, 0.8, 1]) {
        const temperature = min + (max - min) * fraction;
        expect(tempParaPressao(gas.id, temperature, 'psi', 'bubble')!)
          .toBeGreaterThanOrEqual(tempParaPressao(gas.id, temperature, 'psi', 'dew')!);
      }
    }
  });
  it('omite apenas os dois pontos tipográficos publicados, conservando bruto e dew válidos', () => {
    expect(FONTES_TABELAS_SATURACAO.R404A.rows.find(r => r[0] === 125)).toEqual([125, 384.4, 346.1]);
    expect(FONTES_TABELAS_SATURACAO.R407C.rows.find(r => r[0] === -30)).toEqual([-30, 226, 16.4]);
    for (const [id, f, badValue, dewValue] of [['R-404A', 125, 384.4, 346.1], ['R-407C', -30, 226, 16.4]] as const) {
      const gas = REFRIGERANTES.find(g => g.id === id)!;
      const c = (f - 32) * 5 / 9;
      expect(gas.bubble!.some(point => point.t === c)).toBe(false);
      expect(tempParaPressao(id, c, 'psi', 'bubble')).not.toBeCloseTo(badValue - 14.695948776, 2);
      expect(tempParaPressao(id, c, 'psi', 'dew')).toBeCloseTo(dewValue - 14.695948776, 8);
    }
  });
});
