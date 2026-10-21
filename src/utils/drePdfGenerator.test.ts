import { describe, expect, it } from 'vitest';
import { buildDrePdf, type DrePdfData } from './drePdfGenerator';

const makeData = (periodLabels: string[], detailCount = 8): DrePdfData => ({
  company: {
    name: 'Empresa Demonstração',
    document: '00.000.000/0001-00',
    phone: '(00) 0000-0000',
    email: 'financeiro@exemplo.com',
    address: 'Rua Exemplo, 100',
  },
  brandName: 'Produto Teste',
  brandLogoUrl: '/logo-inexistente.png',
  periodLabels,
  regime: 'competencia',
  currency: 'BRL',
  rows: [
    {
      code: '01',
      label: 'Receita Bruta',
      level: 'section',
      values: periodLabels.map(() => ({ value: 100_000, impactPercent: 100 })),
    },
    ...Array.from({ length: detailCount }, (_, index) => ({
      code: `01.01.${String(index + 1).padStart(3, '0')}`,
      label: `Categoria de receita ${index + 1}`,
      level: 'category' as const,
      values: periodLabels.map(() => ({ value: 1_000 + index, impactPercent: 1 + index / 100 })),
    })),
    {
      code: '09',
      label: 'Resultado Final',
      level: 'result',
      isFinalResult: true,
      values: periodLabels.map(() => ({ value: 15_000, impactPercent: 15 })),
    },
  ],
});

describe('buildDrePdf', () => {
  it('usa A4 retrato sem comparação e paisagem com até três comparações', async () => {
    const portrait = await buildDrePdf(makeData(['Outubro de 2026']));
    expect(portrait.internal.pageSize.getHeight()).toBeGreaterThan(portrait.internal.pageSize.getWidth());

    const landscape = await buildDrePdf(makeData([
      'Outubro de 2026',
      'Setembro de 2026',
      'Agosto de 2026',
      'Julho de 2026',
    ]));
    expect(landscape.internal.pageSize.getWidth()).toBeGreaterThan(landscape.internal.pageSize.getHeight());
  });

  it('pagina um DRE denso e produz um PDF válido sem cortar linhas', async () => {
    const document = await buildDrePdf(makeData(['Outubro de 2026', 'Setembro de 2026'], 140));
    expect(document.getNumberOfPages()).toBeGreaterThan(1);
    expect(document.output('arraybuffer').byteLength).toBeGreaterThan(15_000);
  });
});
