import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DreHierarchyTable, type DreHierarchySection } from './DreHierarchyTable';

const sections: DreHierarchySection[] = [
  {
    id: 'receitas',
    code: '01',
    label: '(+) Receita Bruta',
    operation: '+',
    current: 100,
    previous: 0,
    impactPercent: 100,
    variationPercent: null,
    comparisonValues: [{ value: 90, impactPercent: 100 }],
    groups: [
      {
        id: 'servicos',
        code: '01.01',
        label: 'Grupo de serviços',
        current: 100,
        previous: 0,
        impactPercent: 100,
        variationPercent: null,
        comparisonValues: [{ value: 90, impactPercent: 100 }],
        lines: [
          {
            id: 'manutencao',
            code: '01.01.001',
            label: 'Manutenção',
            current: 100,
            previous: 0,
            impactPercent: 100,
            variationPercent: null,
            comparisonValues: [{ value: 90, impactPercent: 100 }],
            children: [
              {
                id: 'preventiva',
                code: '01.01.001.01',
                label: 'Manutenção preventiva',
                current: 100,
                previous: 0,
                impactPercent: 100,
                variationPercent: null,
                comparisonValues: [{ value: 90, impactPercent: 100 }],
              },
            ],
          },
        ],
      },
    ],
    resultsAfter: [
      {
        id: 'resultado-bruto',
        code: '03',
        label: 'Resultado bruto',
        current: 100,
        previous: 0,
        impactPercent: 100,
        variationPercent: null,
        comparisonValues: [{ value: 90, impactPercent: 100 }],
      },
    ],
  },
  {
    id: 'ajustes',
    code: '09',
    label: '(+) Ajustes sem detalhamento',
    operation: '+',
    current: 0,
    previous: 0,
    impactPercent: 0,
    variationPercent: null,
    comparisonValues: [{ value: 0, impactPercent: 0 }],
    groups: [],
  },
];

describe('DreHierarchyTable — recolhimento dos macrogrupos', () => {
  it('inicia aberto, recolhe só o conteúdo interno e preserva os níveis abertos ao reabrir', () => {
    render(
      <DreHierarchyTable
        sections={sections}
        currentPeriodLabel="Outubro de 2026"
        comparisonPeriodLabels={['Setembro de 2026']}
        renderValue={(value) => `R$ ${value}`}
        hasComparison
      />,
    );

    const macro = screen.getByRole('button', { name: 'Recolher 01 Receita Bruta' });
    expect(macro).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Grupo de serviços')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Grupo de serviços/ }));
    fireEvent.click(screen.getByRole('button', { name: /Manutenção/ }));
    expect(screen.getByText('Manutenção preventiva')).toBeInTheDocument();

    fireEvent.click(macro);
    expect(screen.queryByText('Grupo de serviços')).not.toBeInTheDocument();
    expect(screen.queryByText('Manutenção preventiva')).not.toBeInTheDocument();
    expect(screen.getByText(/Resultado bruto/)).toBeInTheDocument();
    expect(screen.getByText('Setembro de 2026')).toBeInTheDocument();

    const collapsedMacro = screen.getByRole('button', { name: 'Expandir 01 Receita Bruta' });
    expect(collapsedMacro).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(collapsedMacro);

    expect(screen.getByText('Manutenção preventiva')).toBeInTheDocument();
  });

  it('reserva a mesma largura do chevron nas linhas macro sem expansão e nos resultados', () => {
    render(
      <DreHierarchyTable
        sections={sections}
        currentPeriodLabel="Outubro de 2026"
        renderValue={(value) => `R$ ${value}`}
        hasComparison={false}
      />,
    );

    const expandableColumn = screen.getByRole('button', { name: 'Recolher 01 Receita Bruta' }).firstElementChild;
    expect(expandableColumn?.firstElementChild).toHaveClass('h-4', 'w-4', 'shrink-0');

    const resultColumn = screen.getByText(/Resultado bruto/).parentElement;
    expect(resultColumn).toHaveClass('items-center', 'gap-3');
    expect(resultColumn?.firstElementChild).toHaveClass('invisible', 'h-4', 'w-4', 'shrink-0');
    expect(resultColumn?.firstElementChild).toHaveAttribute('aria-hidden', 'true');

    const plainMacroColumn = screen.getByText(/Ajustes sem detalhamento/).parentElement;
    expect(plainMacroColumn).toHaveClass('items-center', 'gap-3');
    expect(plainMacroColumn?.firstElementChild).toHaveClass('invisible', 'h-4', 'w-4', 'shrink-0');
    expect(plainMacroColumn?.firstElementChild).toHaveAttribute('aria-hidden', 'true');
  });
});
