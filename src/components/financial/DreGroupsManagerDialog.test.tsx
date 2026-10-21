import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';

const reorderGroups = { mutate: vi.fn(), isPending: false };
const updateGroup = { mutate: vi.fn(), isPending: false };
const assignCategoriesToGroup = { mutate: vi.fn(), isPending: false };

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
import { canMoveCategoryToDreNature, categoryIdsForDreMove } from './dre-config-dnd';

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
    id: 'cost-secondary',
    name: 'Custos indiretos',
    nature: 'cost',
    sort_order: 3,
    is_system: false,
    is_active: true,
  },
  {
    id: 'other',
    name: 'Outras despesas',
    nature: 'non_operating',
    sort_order: 4,
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
      assignCategoriesToGroup,
    };
  });

  it('abre por padrão e permite recolher cada grupo pela seta à esquerda', () => {
    render(
      <DreGroupsManagerDialog
        open
        onOpenChange={() => {}}
        categories={[{
          id: 'category-1',
          name: 'Peças e materiais',
          dre_group_id: 'cost',
          color: '#0ea5e9',
          icon: 'Package',
          parent_id: null,
          type: 'saida',
        }]}
      />,
    );

    expect(screen.getByText('Peças e materiais')).toBeTruthy();
    const toggle = screen.getByRole('button', { name: 'Recolher Custos diretos' });
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(toggle);
    expect(screen.queryByText('Peças e materiais')).toBeNull();
    expect(screen.getByRole('button', { name: 'Expandir Custos diretos' })).toHaveAttribute('aria-expanded', 'false');
  });

  it('protege grupos essenciais e grupos com categorias vinculadas', () => {
    render(
      <DreGroupsManagerDialog
        open
        onOpenChange={() => {}}
        categories={[{ id: 'category-1', name: 'Materiais', dre_group_id: 'cost' }]}
      />,
    );

    expect(screen.getByRole('button', { name: 'Desativar Receita operacional' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Desativar Custos diretos' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Excluir Outras despesas' })).not.toBeDisabled();
    expect(screen.getByText('Grupo essencial: não pode ser desativado nem excluído.')).toBeTruthy();
    expect(screen.getByText(/1 categoria vinculada: remova os vínculos/)).toBeTruthy();
  });

  it('move categoria-pai junto com suas subcategorias e valida a natureza de destino', () => {
    const categories = [
      { id: 'parent', name: 'Pessoal', dre_group_id: 'cost', parent_id: null, type: 'saida' },
      { id: 'child', name: 'Salários', dre_group_id: 'cost', parent_id: 'parent', type: 'saida' },
      { id: 'income', name: 'Serviços', dre_group_id: 'revenue', parent_id: null, type: 'entrada' },
    ];

    expect(categoryIdsForDreMove('parent', categories)).toEqual(['parent', 'child']);
    expect(categoryIdsForDreMove('child', categories)).toEqual(['child']);
    expect(canMoveCategoryToDreNature(categories[2], 'revenue')).toBe(true);
    expect(canMoveCategoryToDreNature(categories[2], 'cost')).toBe(false);
    expect(canMoveCategoryToDreNature(categories[0], 'operating_expense')).toBe(true);
    expect(canMoveCategoryToDreNature(categories[0], 'revenue')).toBe(false);
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
