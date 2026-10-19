import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PdvOrderSwitcher } from '@/components/pdv/PdvOrderSwitcher';

const texts = {
  number: 'Número', value: 'Valor', customer: 'Cliente', newOrder: 'Novo pedido',
  unnamedCustomer: 'Sem cliente', editBadge: 'Edição', deleteLabel: 'Excluir pedido',
  deleteTitle: 'Excluir este pedido?',
  deleteDescription: 'Somente este rascunho será apagado.',
  keepOrder: 'Manter pedido', confirmDelete: 'Excluir pedido',
};

const orders = [
  { id: 'empty', code: '#1', customer: '', total: 0, itemCount: 0, hasContent: false },
  { id: 'filled', code: '#2', customer: 'Cliente Norte', total: 180, itemCount: 3, hasContent: true },
];

describe('PdvOrderSwitcher', () => {
  it('remove rascunho vazio diretamente e exige confirmação quando há conteúdo', () => {
    const onDelete = vi.fn();
    render(
      <PdvOrderSwitcher
        orders={orders}
        activeId="empty"
        formatCurrency={(value) => `R$ ${value.toFixed(2)}`}
        texts={texts}
        onSelect={() => {}}
        onCreate={() => {}}
        onDelete={onDelete}
      />,
    );

    fireEvent.click(screen.getByRole('button', { expanded: false }));
    fireEvent.click(screen.getByRole('button', { name: 'Excluir pedido: #1' }));
    expect(onDelete).toHaveBeenCalledWith('empty');
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { expanded: false }));
    fireEvent.click(screen.getByRole('button', { name: 'Excluir pedido: #2' }));
    expect(screen.getByRole('alertdialog')).toHaveTextContent('Somente este rascunho será apagado.');
    fireEvent.click(screen.getByRole('button', { name: 'Excluir pedido' }));
    expect(onDelete).toHaveBeenLastCalledWith('filled');
  });

  it('cria e seleciona pelo ID exato sem compartilhar callbacks implícitos', () => {
    const onCreate = vi.fn();
    const onSelect = vi.fn();
    render(
      <PdvOrderSwitcher
        orders={orders}
        activeId="empty"
        formatCurrency={(value) => `R$ ${value.toFixed(2)}`}
        texts={texts}
        onSelect={onSelect}
        onCreate={onCreate}
        onDelete={() => {}}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Novo pedido' }));
    expect(onCreate).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { expanded: false }));
    fireEvent.click(screen.getByRole('button', { name: /^#2 R\$/ }));
    expect(onSelect).toHaveBeenCalledWith('filled');
  });

  it('pode ficar integrado ao topo do painel sem espaçamento externo', () => {
    const { container } = render(
      <PdvOrderSwitcher
        embedded
        orders={orders}
        activeId="filled"
        formatCurrency={(value) => `R$ ${value.toFixed(2)}`}
        texts={texts}
        onSelect={() => {}}
        onCreate={() => {}}
        onDelete={() => {}}
      />,
    );

    expect(container.querySelector('[data-embedded="true"]')).toHaveClass('border-b');
    expect(screen.getByRole('button', { name: 'Novo pedido' })).toHaveClass('rounded-none');
  });

  it('tem versão compacta de uma linha para o cabeçalho da página', () => {
    const { container } = render(
      <PdvOrderSwitcher
        header
        orders={orders}
        activeId="filled"
        formatCurrency={(value) => `R$ ${value.toFixed(2)}`}
        texts={texts}
        onSelect={() => {}}
        onCreate={() => {}}
        onDelete={() => {}}
      />,
    );

    expect(container.querySelector('[data-header="true"]')).toBeInTheDocument();
    expect(screen.queryByText('Número')).not.toBeInTheDocument();
    expect(screen.getByText('Cliente Norte')).toBeVisible();
  });
});
