import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PdvWorkspaceViewToggle } from './PdvWorkspaceViewToggle';

describe('visualização compartilhada do balcão', () => {
  it('ordena Lista, Kanban e Fluxo e expõe a escolha atual', () => {
    const onChange = vi.fn();
    render(<PdvWorkspaceViewToggle value="board" showBoard showFlow onChange={onChange} />);
    expect(screen.getAllByRole('button').map(button => button.textContent)).toEqual(['Lista', 'Kanban', 'Fluxo do balcão']);
    expect(screen.getByRole('button', { name: 'Kanban' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Fluxo do balcão' }));
    expect(onChange).toHaveBeenCalledExactlyOnceWith('flow');
  });

  it('Pedidos e Orçamentos não oferecem um Kanban local inexistente', () => {
    render(<PdvWorkspaceViewToggle value="list" showFlow onChange={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Kanban' })).not.toBeInTheDocument();
    expect(screen.getAllByRole('button')).toHaveLength(2);
  });

  it('esconde fluxo quando modo/permissão ainda não o permitem', () => {
    render(<PdvWorkspaceViewToggle value="list" onChange={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Fluxo do balcão' })).not.toBeInTheDocument();
  });
});
