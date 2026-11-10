import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { CostResource } from '@/hooks/useCostResources';
import type { useServiceCostResources } from '@/hooks/useServiceCostResources';
import { LinkedResourcesSection } from './LinkedResourcesSection';

vi.mock('@/contexts/AppLocaleContext', () => ({ useAppLocaleContext: () => ({ locale: 'pt-br', currency: 'BRL' }) }));
vi.mock('@/hooks/useServiceCostResources', () => ({ useServiceCostResources: () => ({}) }));
vi.mock('./ContextualCostResourceEditor', () => ({
  ContextualCostResourceEditor: ({ resource, onClose }: { resource: CostResource; onClose: () => void }) => <div data-testid="context-resource-editor" data-resource-id={resource.id}><button type="button" onClick={onClose}>Fechar cadastro</button></div>,
}));

const tool = { id: 'tool-1', name: 'Bomba de vácuo', category: 'tool', is_active: true, hourly_rate: 20, monthly_hours: 176, total_monthly_cost: 3520 } as CostResource;
const gift = { ...tool, id: 'gift-1', name: 'Kit de orientação', category: 'gift' } as CostResource;

describe('LinkedResourcesSection — edição contextual do cadastro', () => {
  it('abre ferramenta e brinde corretos sem vincular ou alterar o serviço', () => {
    const link = vi.fn(); const addGift = vi.fn();
    const state = {
      linkedResources: [], allResources: [tool, gift], gifts: [],
      totals: { vehicle: 0, tool: 0, gift: 0, epi: 0, other: 0, total: 0 }, isLoading: false,
      linkResource: { mutate: link }, unlinkResource: { mutate: vi.fn() }, updateOverride: { mutate: vi.fn() },
      addGift: { mutate: addGift }, removeGift: { mutate: vi.fn() }, isResourceLinked: () => false,
    } as unknown as ReturnType<typeof useServiceCostResources>;
    render(<LinkedResourcesSection serviceId="service-1" serviceHours={3} resourcesState={state} />);
    const toolAction = screen.getByRole('button', { name: 'Editar cadastro do recurso Bomba de vácuo' });
    expect(toolAction.closest('label')).toBeNull();
    fireEvent.click(toolAction);
    expect(screen.getByTestId('context-resource-editor')).toHaveAttribute('data-resource-id', tool.id);
    expect(link).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Fechar cadastro' }));
    fireEvent.click(screen.getByRole('button', { name: /Brindes/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Editar cadastro do recurso Kit de orientação' }));
    expect(screen.getByTestId('context-resource-editor')).toHaveAttribute('data-resource-id', gift.id);
    expect(addGift).not.toHaveBeenCalled();
  });
});
