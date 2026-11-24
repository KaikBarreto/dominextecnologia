import { createRef } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { PdvPartySelect } from './PdvPartySelect';

const options = [
  { value: '_none', label: 'Não informado' },
  { value: 'pessoa-1', label: 'Refrigeração Central', sublabel: '11.222.333/0001-44', keywords: ['Rua das Flores', 'contato@loja.teste', '11987654321'] },
  { value: 'pessoa-2', label: 'Peças do Sul', keywords: ['5599'] },
];

beforeAll(() => { vi.stubGlobal('scrollTo', vi.fn()); });
afterAll(() => { vi.unstubAllGlobals(); });

describe('Seletor compartilhado de pessoas do balcão', () => {
  it.each(['Cliente', 'Fornecedor'])('usa a mesma estrutura visual para %s, sem combobox aninhado nem botão de cadastro no campo', label => {
    render(<PdvPartySelect value="pessoa-1" options={options} label={label} placeholder="Selecionar" searchLabel={'Buscar ' + label.toLowerCase()} searchPlaceholder="Buscar nome ou documento" listLabel="Pessoas" emptyMessage="Nenhum resultado" createLabel={'Criar ' + label.toLowerCase()} onValueChange={vi.fn()} onCreate={vi.fn()} />);
    const trigger = screen.getByRole('combobox');
    expect(trigger).toHaveClass('clientselect', 'clienttrigger');
    expect(trigger.querySelector('small')).toHaveTextContent(label);
    expect(trigger.querySelector('strong')).toHaveTextContent('Refrigeração Central');
    expect(trigger.querySelectorAll('svg')).toHaveLength(2);
    expect(screen.getAllByRole('combobox')).toHaveLength(1);
    expect(screen.queryByRole('button', { name: 'Criar ' + label.toLowerCase() })).not.toBeInTheDocument();
  });
  it('foca a busca, navega as opções em ciclo e retorna ao campo ao selecionar', async () => {
    const change = vi.fn();
    const triggerRef = createRef<HTMLButtonElement>();
    render(<PdvPartySelect triggerRef={triggerRef} options={options} label="Fornecedor" placeholder="Selecionar" searchLabel="Buscar fornecedor" searchPlaceholder="Buscar" listLabel="Fornecedores" emptyMessage="Nenhum resultado" createLabel="Criar fornecedor" onValueChange={change} onCreate={vi.fn()} />);
    const trigger = screen.getByRole('combobox');
    expect(triggerRef.current).toBe(trigger);
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    const search = screen.getByRole('searchbox');
    await waitFor(() => expect(search).toHaveFocus());
    fireEvent.keyDown(search, { key: 'ArrowUp' });
    expect(screen.getByRole('option', { name: 'Peças do Sul' })).toHaveFocus();
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' });
    expect(screen.getByRole('option', { name: 'Não informado' })).toHaveFocus();
    fireEvent.change(search, { target: { value: 'Rua das Flores' } });
    fireEvent.keyDown(search, { key: 'Enter' });
    expect(change).toHaveBeenCalledWith('pessoa-1');
    expect(trigger).toHaveFocus();
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });
  it.each(['cliente', 'fornecedor'])('chama somente o cadastro de %s, preservando o texto buscado', kind => {
    const create = vi.fn(), change = vi.fn();
    render(<PdvPartySelect options={options} label={kind} placeholder="Selecionar" searchLabel="Buscar" searchPlaceholder="Buscar" listLabel="Pessoas" emptyMessage="Nenhum resultado" createLabel={'Criar ' + kind} onValueChange={change} onCreate={create} />);
    fireEvent.click(screen.getByRole('combobox'));
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'Novo cadastro' } });
    fireEvent.click(screen.getByRole('button', { name: 'Criar ' + kind }));
    expect(create).toHaveBeenCalledWith('Novo cadastro');
    expect(change).not.toHaveBeenCalled();
    expect(screen.getByRole('combobox')).toHaveAttribute('aria-expanded', 'false');
  });
  it('mantém opção selecionada identificada e fecha sem alterar ao pressionar Escape', () => {
    const change = vi.fn();
    render(<PdvPartySelect value="pessoa-1" options={options} label="Cliente" placeholder="Selecionar" searchLabel="Buscar" searchPlaceholder="Buscar" listLabel="Pessoas" emptyMessage="Nenhum resultado" createLabel="Criar cliente" onValueChange={change} onCreate={vi.fn()} />);
    const trigger = screen.getByRole('combobox');
    fireEvent.click(trigger);
    const option = screen.getByRole('option', { name: /Refrigeração Central/ });
    expect(option).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(option, { key: 'Escape' });
    expect(trigger).toHaveFocus();
    expect(change).not.toHaveBeenCalled();
  });
});
