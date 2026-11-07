import { useState } from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CostResource, CostResourceCategory } from '@/hooks/useCostResources';
import { QuoteServiceResourcesEditor } from './QuoteServiceResourcesEditor';
import { QuoteServiceCostEditor, createQuoteCostComposition, type QuoteCostLine } from './QuoteServiceCostEditor';

const viewport = vi.hoisted(() => ({ mobile: false }));
vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => viewport.mobile, useIsCompact: () => viewport.mobile }));
vi.mock('@/components/service-orders/LaborCalculatorModal', () => ({ LaborCalculatorModal: () => null }));
vi.mock('@/components/service-orders/ExtraCostModal', () => ({ ExtraCostModal: () => null }));
vi.mock('@/components/service-orders/ContextualCostResourceEditor', () => ({
  ContextualCostResourceEditor: ({ resource, onClose }: { resource: CostResource; onClose: () => void }) => <div data-testid="context-resource-editor" data-resource-id={resource.id}><button type="button" onClick={onClose}>Fechar cadastro</button></div>,
}));

const money = (value: number) => `R$ ${value.toFixed(2).replace('.', ',')}`;
const resource = (id: string, name: string, category: CostResourceCategory = 'tool'): CostResource => ({
  id, name, category, company_id: 'company-1', is_active: true, monthly_hours: 176,
  notes: null, photo_url: null, created_at: '', updated_at: '', hourly_rate: 10, total_monthly_cost: 7,
});
const extra: QuoteCostLine = { id: 'extra-1', label: 'Custo extra preservado', quantity: 1, unitCost: 30, source: 'extra' };
beforeEach(() => { viewport.mobile = false; });

function setup(resources: CostResource[], initialLines: QuoteCostLine[] = [extra], hours = 2.5) {
  const onChange = vi.fn();
  function Harness() {
    const [lines, setLines] = useState(initialLines);
    return <QuoteServiceResourcesEditor lines={lines} resources={resources} hours={hours} formatMoney={money} onChange={next => { onChange(next); setLines(next); }} />;
  }
  render(<Harness />);
  return { onChange };
}

describe('QuoteServiceResourcesEditor', () => {
  it('mantém custo por horas e brindes por execução sem modificar extras', () => {
    const tool = resource('tool-1', 'Bomba de vácuo');
    const gift = resource('gift-1', 'Kit de orientação', 'gift');
    const { onChange } = setup([tool, gift]);
    fireEvent.click(screen.getByLabelText('Incluir recurso Bomba de vácuo'));
    fireEvent.click(screen.getByLabelText('Incluir recurso Kit de orientação'));

    expect(onChange).toHaveBeenLastCalledWith([
      extra,
      expect.objectContaining({ resourceId: tool.id, quantity: 1, unitCost: 25, source: 'resource' }),
      expect.objectContaining({ resourceId: gift.id, quantity: 1, unitCost: 7, source: 'gift' }),
    ]);
    expect(screen.getByLabelText('Total de recursos vinculados').textContent).toBe('R$ 32,00');
    expect(screen.getByText('2,5h × R$ 10,00')).toBeTruthy();
    expect(screen.getByText('Por execução')).toBeTruthy();
  });

  it('busca sem acentos, filtra categoria e preserva a seleção ao alternar os filtros', () => {
    const tool = resource('tool-1', 'Bomba de vácuo');
    const vehicle = resource('vehicle-1', 'Veículo de manutenção', 'vehicle');
    setup([tool, vehicle]);
    fireEvent.click(screen.getByLabelText('Incluir recurso Bomba de vácuo'));
    fireEvent.click(screen.getByRole('button', { name: /^Veículos/ }));
    expect(screen.queryByLabelText('Incluir recurso Bomba de vácuo')).toBeNull();
    expect(screen.getByLabelText('Incluir recurso Veículo de manutenção')).toBeTruthy();
    expect(screen.getByLabelText('Total de recursos vinculados').textContent).toBe('R$ 25,00');
    fireEvent.change(screen.getByLabelText('Buscar recursos'), { target: { value: 'veiculo' } });
    expect(screen.getByLabelText('Incluir recurso Veículo de manutenção')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Limpar busca de recursos' }));
    fireEvent.click(screen.getByRole('button', { name: /^Todos/ }));
    fireEvent.click(screen.getByRole('button', { name: /^Só selecionados/ }));
    expect(screen.getByLabelText('Incluir recurso Bomba de vácuo')).toBeChecked();
    expect(screen.queryByLabelText('Incluir recurso Veículo de manutenção')).toBeNull();
  });

  it('pagina catálogos longos e volta à primeira página ao pesquisar', () => {
    const catalog = Array.from({ length: 18 }, (_, index) => resource(`tool-${index}`, `Ferramenta técnica ${String(index + 1).padStart(2, '0')}`));
    catalog.push(resource('tool-special', 'Recolhedora exclusiva'));
    setup(catalog);
    expect(screen.getAllByRole('checkbox')).toHaveLength(8);
    expect(screen.getByText('Mostrando 1 a 8 de 19 recursos')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Próxima página de recursos' }));
    expect(screen.getAllByRole('checkbox')).toHaveLength(8);
    expect(screen.queryByLabelText('Incluir recurso Ferramenta técnica 01')).toBeNull();
    expect(screen.getByText('Mostrando 9 a 16 de 19 recursos')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Buscar recursos'), { target: { value: 'Recolhedora exclusiva' } });
    expect(screen.getAllByRole('checkbox')).toHaveLength(1);
    expect(screen.getByText('Mostrando 1 a 1 de 1 recurso')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Página anterior de recursos' })).toBeNull();
  });

  it('mantém snapshots inativos e ausentes visíveis com custo e remoção, mesmo sem resultado na busca', () => {
    const inactive = { ...resource('inactive-1', 'Plataforma desativada'), is_active: false };
    const snapshots: QuoteCostLine[] = [extra,
      { id: 'line-inactive', label: inactive.name, resourceId: inactive.id, source: 'resource', quantity: 1, unitCost: 90 },
      { id: 'line-missing', label: 'Brinde removido do catálogo', resourceId: 'missing-1', source: 'gift', quantity: 2, unitCost: 25 },
    ];
    const { onChange } = setup([inactive], snapshots);
    fireEvent.change(screen.getByLabelText('Buscar recursos'), { target: { value: 'Não existe' } });
    const unavailable = screen.getByRole('region', { name: 'Recursos selecionados indisponíveis' });
    expect(within(unavailable).getByText(inactive.name)).toBeTruthy();
    expect(within(unavailable).getByText('Brinde removido do catálogo')).toBeTruthy();
    expect(screen.getByLabelText('Total de recursos vinculados').textContent).toBe('R$ 140,00');
    expect(screen.queryByRole('checkbox')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: `Remover recurso ${inactive.name}` }));
    expect(onChange).toHaveBeenLastCalledWith([extra, snapshots[2]]);
    expect(screen.getByLabelText('Total de recursos vinculados').textContent).toBe('R$ 50,00');
    expect(within(unavailable).queryByText(inactive.name)).toBeNull();
  });

  it('oferece recuperação para filtros vazios sem perder o catálogo ou o total', () => {
    setup([resource('tool-1', 'Bomba de vácuo')]);
    fireEvent.click(screen.getByLabelText('Incluir recurso Bomba de vácuo'));
    fireEvent.change(screen.getByLabelText('Buscar recursos'), { target: { value: 'Nenhum destes nomes' } });
    expect(screen.getByText('Nenhum recurso encontrado neste filtro.')).toBeTruthy();
    expect(screen.getByLabelText('Total de recursos vinculados').textContent).toBe('R$ 25,00');
    fireEvent.click(screen.getByRole('button', { name: 'Limpar filtros' }));
    expect(screen.getByLabelText('Incluir recurso Bomba de vácuo')).toBeChecked();
  });

  it('no mobile mantém contagem e valor indisponível explícitos e permite abrir o snapshot para remover', () => {
    viewport.mobile = true;
    const snapshot: QuoteCostLine = { id: 'old-1', resourceId: 'missing-1', label: 'Recurso antigo', source: 'resource', quantity: 2, unitCost: 15 };
    const { onChange } = setup([], [extra, snapshot]);
    const unavailable = screen.getByRole('region', { name: 'Recursos selecionados indisponíveis' });
    const summary = within(unavailable).getByText('1 recurso indisponível').closest('summary')!;
    const details = summary.parentElement!;
    expect(details).not.toHaveAttribute('open');
    expect(within(summary).getByText('R$ 30,00')).toBeTruthy();
    expect(screen.getByLabelText('Total de recursos vinculados').textContent).toBe('R$ 30,00');
    fireEvent.click(summary);
    expect(details).toHaveAttribute('open');
    fireEvent.click(screen.getByRole('button', { name: 'Remover recurso Recurso antigo' }));
    expect(onChange).toHaveBeenLastCalledWith([extra]);
  });

  it('continua usando zero horas como piso para estimar um recurso', () => {
    const { onChange } = setup([resource('tool-1', 'Ferramenta')], [extra], -2);
    fireEvent.click(screen.getByLabelText('Incluir recurso Ferramenta'));
    expect(onChange).toHaveBeenLastCalledWith([extra, expect.objectContaining({ unitCost: 0 })]);
  });

  it('abre o cadastro correto sem incluir o recurso na composição', () => {
    const tool = resource('tool-1', 'Bomba de vácuo');
    const { onChange } = setup([tool]);
    const edit = screen.getByRole('button', { name: 'Editar cadastro do recurso Bomba de vácuo' });
    expect(edit.closest('label')).toBeNull();
    fireEvent.click(edit);
    expect(screen.getByTestId('context-resource-editor')).toHaveAttribute('data-resource-id', tool.id);
    expect(screen.getByLabelText('Incluir recurso Bomba de vácuo')).not.toBeChecked();
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Fechar cadastro' }));
    expect(screen.queryByTestId('context-resource-editor')).toBeNull();
  });

  it('permite editar o cadastro inativo existente e não oferece edição para um snapshot removido', () => {
    const inactive = { ...resource('inactive-1', 'Plataforma desativada'), is_active: false };
    setup([inactive], [extra,
      { id: 'old-1', label: inactive.name, resourceId: inactive.id, source: 'resource', quantity: 1, unitCost: 20 },
      { id: 'old-2', label: 'Recurso excluído', resourceId: 'missing', source: 'resource', quantity: 1, unitCost: 10 },
    ]);
    expect(screen.queryByRole('button', { name: 'Editar cadastro do recurso Recurso excluído' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Editar cadastro do recurso Plataforma desativada' }));
    expect(screen.getByTestId('context-resource-editor')).toHaveAttribute('data-resource-id', inactive.id);
  });

  it('preserva no editor principal a atualização por horas, sem multiplicar brindes nem extras', () => {
    const tool = resource('tool-1', 'Bomba');
    const gift = resource('gift-1', 'Brinde', 'gift');
    const composition = createQuoteCostComposition({ labor: { hourlyRate: 50, hours: 2 }, resources: [extra,
      { id: 'line-tool', label: tool.name, resourceId: tool.id, source: 'resource', quantity: 2, unitCost: 20 },
      { id: 'line-gift', label: gift.name, resourceId: gift.id, source: 'gift', quantity: 1, unitCost: 7 },
    ] });
    const onChange = vi.fn();
    const { rerender } = render(<QuoteServiceCostEditor value={{ composition }} costResources={[tool, gift]} bdiFactor={0.68} formatMoney={money} currencySymbol="R$" onChange={onChange} />);
    expect(onChange).not.toHaveBeenCalled();
    rerender(<QuoteServiceCostEditor value={{ composition: { ...composition, labor: { ...composition.labor, hours: 4 } } }} costResources={[tool, gift]} bdiFactor={0.68} formatMoney={money} currencySymbol="R$" onChange={onChange} />);
    expect(onChange).toHaveBeenLastCalledWith({ composition: { ...composition, labor: { ...composition.labor, hours: 4 }, resources: [extra,
      { ...composition.resources[1], unitCost: 40 }, composition.resources[2],
    ] } });
  });
});
