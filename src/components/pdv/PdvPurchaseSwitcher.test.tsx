import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PdvPurchaseSwitcher } from '@/components/pdv/PdvPurchaseSwitcher';

const texts = {
  code: 'Código', supplier: 'Fornecedor', value: 'Valor', newOrder: 'Novo pedido',
  unnamedSupplier: 'Fornecedor não informado', deleteLabel: 'Excluir pedido',
  deleteTitle: 'Excluir este pedido?',
  deleteDescription: '{code} de {supplier}, com {items} item(ns) e total {value}, será descartado.',
  keepOrder: 'Manter pedido', confirmDelete: 'Excluir pedido',
};

const orders = [
  { id: 'empty', code: 'PC-001', supplier: '', total: 0, itemCount: 0, hasContent: false },
  { id: 'filled', code: 'PC-002', supplier: 'Fornecedor Sul', total: 120, itemCount: 2, hasContent: true },
];

describe('PdvPurchaseSwitcher', () => {
  it('remove rascunho vazio diretamente e confirma rascunho com conteúdo', () => {
    const onDelete = vi.fn();
    render(
      <PdvPurchaseSwitcher
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
    fireEvent.click(screen.getByRole('button', { name: 'Excluir pedido: PC-001' }));
    expect(onDelete).toHaveBeenCalledWith('empty');
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { expanded: false }));
    fireEvent.click(screen.getByRole('button', { name: 'Excluir pedido: PC-002' }));
    expect(screen.getByRole('alertdialog')).toHaveTextContent('PC-002 de Fornecedor Sul, com 2 item(ns) e total R$ 120.00');
    fireEvent.click(screen.getByRole('button', { name: 'Excluir pedido' }));
    expect(onDelete).toHaveBeenLastCalledWith('filled');
  });

  it('cria e seleciona pedidos sem compartilhar callbacks implícitos', () => {
    const onCreate = vi.fn();
    const onSelect = vi.fn();
    render(
      <PdvPurchaseSwitcher
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
    fireEvent.click(screen.getByRole('button', { name: /^PC-002 R\$/ }));
    expect(onSelect).toHaveBeenCalledWith('filled');
  });

  it('pode ficar integrado ao painel atual sem margem ao redor', () => {
    const { container } = render(
      <PdvPurchaseSwitcher
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

  it('tem versão compacta de uma linha para o cabeçalho da compra', () => {
    const { container } = render(
      <PdvPurchaseSwitcher
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
    expect(screen.queryByText('Código')).not.toBeInTheDocument();
    expect(screen.getByText('Fornecedor Sul')).toBeVisible();
  });
});
