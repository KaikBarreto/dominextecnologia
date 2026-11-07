import { act, useState } from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CostResource, CostResourceItem } from '@/hooks/useCostResources';
import { OverlayCoordinatorProvider } from '@/contexts/OverlayCoordinatorContext';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { ContextualCostResourceEditor } from './ContextualCostResourceEditor';

const state = vi.hoisted(() => ({
  mutate: vi.fn(), allowed: true, companyId: 'company-1',
  items: [] as CostResourceItem[] | undefined,
}));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ profile: { company_id: state.companyId }, permissions: [], isAdminOrGestor: () => state.allowed, hasRole: () => false }) }));
vi.mock('@/contexts/AppLocaleContext', () => ({ useAppLocaleContext: () => ({ locale: 'pt-br', currency: 'BRL' }) }));
vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => false, useIsCompact: () => false }));
vi.mock('@/hooks/useCostResources', () => ({ useCostResources: () => ({ updateResource: { mutate: state.mutate, isPending: false } }), useCostResourceItems: () => ({ data: state.items }) }));

const resource = {
  id: 'tool-1', company_id: 'company-1', category: 'tool', name: 'Bomba de vácuo',
  monthly_hours: 176, is_active: true, notes: 'Cadastro original', photo_url: null,
} as CostResource;

beforeEach(() => { state.mutate.mockReset(); state.allowed = true; state.companyId = 'company-1'; state.items = []; });

describe('ContextualCostResourceEditor', () => {
  it('mantém o orçamento visível atrás do editor e só salva após confirmação humana', async () => {
    const close = vi.fn();
    function Harness() {
      const [editing, setEditing] = useState(false);
      return <OverlayCoordinatorProvider><ResponsiveModal open onOpenChange={() => undefined} title="Novo orçamento"><button type="button" onClick={() => setEditing(true)}>Abrir recurso</button>{editing && <ContextualCostResourceEditor resource={resource} onClose={() => { close(); setEditing(false); }} />}</ResponsiveModal></OverlayCoordinatorProvider>;
    }
    render(<Harness />);
    const parent = screen.getByRole('dialog', { name: 'Novo orçamento' });
    fireEvent.click(screen.getByRole('button', { name: 'Abrir recurso' }));
    const form = screen.getByRole('dialog', { name: 'Editar Ferramenta' });
    expect(parent).toBeVisible();
    expect(within(form).getByRole('note', { name: 'Cadastro compartilhado' })).toBeTruthy();
    expect(state.mutate).not.toHaveBeenCalled();
    fireEvent.change(within(form).getByPlaceholderText('Ex: Manômetro Testo'), { target: { value: 'Bomba revisada' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(state.mutate).toHaveBeenCalledWith(expect.objectContaining({ id: resource.id, name: 'Bomba revisada', monthly_hours: 176, items: [] }), expect.objectContaining({ onSuccess: expect.any(Function) })));
    expect(close).not.toHaveBeenCalled();
    act(() => state.mutate.mock.calls[0][1].onSuccess());
    await waitFor(() => expect(close).toHaveBeenCalledOnce());
  });

  it('bloqueia salvar antes de carregar os custos para não apagar uma composição ainda desconhecida', () => {
    state.items = undefined;
    render(<ContextualCostResourceEditor resource={resource} onClose={() => undefined} />);
    expect(screen.getByRole('button', { name: 'Salvar' })).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent('Carregando os custos cadastrados');
  });

  it.each(['permission', 'tenant'])('falha fechado quando a edição não é autorizada: %s', reason => {
    if (reason === 'permission') state.allowed = false;
    else state.companyId = 'another-company';
    render(<ContextualCostResourceEditor resource={resource} onClose={() => undefined} />);
    expect(screen.getByText(/Você precisa de permissão/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Salvar' })).toBeNull();
    expect(state.mutate).not.toHaveBeenCalled();
  });

  it('reutiliza os campos por lote do brinde sem mostrar jornada mensal', () => {
    state.items = [{ id: 'gift-item', resource_id: 'gift-1', name: 'Cartão de orientação', value: 5, is_monthly: false, annual_value: null, sort_order: 0, total_cost: 50, total_units: 10, qty_per_gift: 1 } as CostResourceItem];
    render(<ContextualCostResourceEditor resource={{ ...resource, id: 'gift-1', category: 'gift', name: 'Kit de orientação' }} onClose={() => undefined} />);
    expect(screen.getByRole('dialog', { name: 'Editar Brinde' })).toBeTruthy();
    expect(screen.getByPlaceholderText('500,00')).toHaveValue(50);
    expect(screen.getByPlaceholderText('500')).toHaveValue('10');
    expect(screen.queryByText('Horas mensais de uso')).toBeNull();
  });
});
