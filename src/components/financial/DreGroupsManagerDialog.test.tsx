import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';

const reorderGroups = { mutate: vi.fn(), isPending: false };
const updateGroup = { mutate: vi.fn(), isPending: false };

let hookResult: Record<string, unknown>;

vi.mock('@/hooks/useDreGroups', () => ({
  useDreGroups: () => hookResult,
}));

vi.mock('@/components/ui/ResponsiveModal', () => ({
  ResponsiveModal: ({ title, description, children }: { title: string; description?: string; children: ReactNode }) => (
    <section>
      <h1>{title}</h1>
      <p>{description}</p>
      {children}
    </section>
  ),
}));

import { DreGroupsManagerDialog } from './DreGroupsManagerDialog';

const baseGroups = [
  {
    id: 'revenue',
    name: 'Receita operacional',
    nature: 'revenue',
    sort_order: 1,
    is_system: true,
    is_active: true,
  },
  {
    id: 'cost',
    name: 'Custos diretos',
    nature: 'cost',
    sort_order: 2,
    is_system: false,
    is_active: true,
  },
  {
    id: 'other',
    name: 'Outras despesas',
    nature: 'non_operating',
    sort_order: 3,
    is_system: false,
    is_active: false,
  },
];

describe('DreGroupsManagerDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hookResult = {
      dreGroups: baseGroups,
      isLoading: false,
      error: null,
      createGroup: { mutate: vi.fn(), isPending: false },
      updateGroup,
      deleteGroup: { mutate: vi.fn(), isPending: false },
      reorderGroups,
    };
  });

  it('ordena os grupos e envia todos os ids na nova ordem', () => {
    render(<DreGroupsManagerDialog open onOpenChange={() => {}} categories={[]} />);

    fireEvent.click(screen.getByRole('button', { name: 'Mover Custos diretos para cima' }));

    expect(reorderGroups.mutate).toHaveBeenCalledWith(
      ['cost', 'revenue', 'other'],
      expect.objectContaining({ onError: expect.any(Function) }),
    );
  });

  it('protege grupos essenciais e grupos com categorias vinculadas', () => {
    render(
      <DreGroupsManagerDialog
        open
        onOpenChange={() => {}}
        categories={[{ dre_group_id: 'cost' }]}
      />,
    );

    expect(screen.getByRole('button', { name: 'Desativar Receita operacional' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Desativar Custos diretos' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Excluir Outras despesas' })).not.toBeDisabled();
    expect(screen.getByText('Grupo essencial: não pode ser desativado nem excluído.')).toBeTruthy();
    expect(screen.getByText(/1 categoria vinculada: remova os vínculos/)).toBeTruthy();
  });

  it('permite renomear grupo essencial sem enviar alteração de natureza', () => {
    render(<DreGroupsManagerDialog open onOpenChange={() => {}} categories={[]} />);

    fireEvent.click(screen.getByRole('button', { name: 'Editar Receita operacional' }));
    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Receita principal' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(updateGroup.mutate).toHaveBeenCalledWith(
      { id: 'revenue', name: 'Receita principal' },
      expect.objectContaining({ onSuccess: expect.any(Function), onError: expect.any(Function) }),
    );
    expect(screen.getByText(/natureza de um grupo essencial é protegida/i)).toBeTruthy();
  });

  it('mostra estados de carregamento, erro e vazio', () => {
    hookResult = { ...hookResult, dreGroups: [], isLoading: true };
    const { rerender } = render(<DreGroupsManagerDialog open onOpenChange={() => {}} categories={[]} />);
    expect(screen.getByLabelText('Carregando grupos da DRE')).toBeTruthy();

    hookResult = { ...hookResult, isLoading: false, error: new Error('falha') };
    rerender(<DreGroupsManagerDialog open onOpenChange={() => {}} categories={[]} />);
    expect(screen.getByText('Não foi possível carregar os grupos')).toBeTruthy();

    hookResult = { ...hookResult, error: null };
    rerender(<DreGroupsManagerDialog open onOpenChange={() => {}} categories={[]} />);
    expect(screen.getByText('Nenhum grupo configurado')).toBeTruthy();
  });
});
