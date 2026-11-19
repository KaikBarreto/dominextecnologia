import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  templates: [] as Array<{ id: string; name: string; items: Array<{ id: string; text: string }> }>,
  createTemplate: vi.fn(),
  updateTemplate: vi.fn(),
  deleteTemplate: vi.fn(),
}));

vi.mock('@/contexts/AppLocaleContext', () => ({ useAppLocaleContext: () => ({ locale: 'pt-br' }) }));
vi.mock('@/components/ui/DuplicateEntityDialog', () => ({ DuplicateEntityDialog: () => null }));
vi.mock('@/hooks/useCrmCardTools', () => ({
  createCrmCardItemId: () => 'novo-item',
  useCrmChecklistTemplates: () => ({
    templates: mocks.templates,
    isLoading: false,
    createTemplate: { mutate: mocks.createTemplate, isPending: false },
    updateTemplate: { mutate: mocks.updateTemplate, isPending: false },
    deleteTemplate: { mutate: mocks.deleteTemplate },
    duplicateTemplate: { mutateAsync: vi.fn(), isPending: false },
  }),
}));

import { CrmChecklistTemplatesManager } from './CrmChecklistTemplatesManager';

describe('CrmChecklistTemplatesManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.templates = [
      { id: 'template-1', name: 'Documentos', items: [{ id: 'a', text: 'Contrato social' }, { id: 'b', text: 'CNPJ' }] },
      { id: 'template-2', name: 'Vistoria', items: [{ id: 'c', text: 'Fotos do local' }] },
    ];
  });

  it('mostra a lista de modelos e o primeiro já aberto pra edição', () => {
    render(<CrmChecklistTemplatesManager />);

    const list = screen.getByRole('complementary', { name: 'Modelos' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(2);
    expect(within(list).getByText('2 itens')).toBeTruthy();
    expect(screen.getByLabelText('Nome do modelo *')).toHaveValue('Documentos');
    expect(screen.getByLabelText('Item 1')).toHaveValue('Contrato social');
    expect(screen.getByRole('button', { name: 'Salvar modelo' })).toBeDisabled();
  });

  it('permite corrigir o texto de um item sem remover e digitar de novo', () => {
    render(<CrmChecklistTemplatesManager />);

    fireEvent.change(screen.getByLabelText('Item 2'), { target: { value: 'Cartão CNPJ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar modelo' }));

    expect(mocks.updateTemplate.mock.calls[0][0]).toEqual({
      id: 'template-1',
      name: 'Documentos',
      items: [{ id: 'a', text: 'Contrato social' }, { id: 'b', text: 'Cartão CNPJ' }],
    });
  });

  it('salva junto o item que ficou digitado no campo de novo item', () => {
    render(<CrmChecklistTemplatesManager />);

    fireEvent.change(screen.getByPlaceholderText('Novo item do checklist'), { target: { value: 'Alvará' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar modelo' }));

    expect(mocks.updateTemplate.mock.calls[0][0].items).toEqual([
      { id: 'a', text: 'Contrato social' }, { id: 'b', text: 'CNPJ' }, { id: 'novo-item', text: 'Alvará' },
    ]);
  });

  it('confirma antes de trocar de modelo com alteração pendente', () => {
    render(<CrmChecklistTemplatesManager />);

    fireEvent.change(screen.getByLabelText('Nome do modelo *'), { target: { value: 'Documentos da proposta' } });
    fireEvent.click(screen.getByRole('button', { name: /Vistoria/ }));

    expect(screen.getByLabelText('Nome do modelo *')).toHaveValue('Documentos da proposta');
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Descartar' }));
    expect(screen.getByLabelText('Nome do modelo *')).toHaveValue('Vistoria');
  });

  it('só exclui o modelo depois da confirmação', () => {
    render(<CrmChecklistTemplatesManager />);

    fireEvent.click(screen.getByRole('button', { name: 'Excluir' }));
    expect(mocks.deleteTemplate).not.toHaveBeenCalled();
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Excluir' }));
    expect(mocks.deleteTemplate.mock.calls[0][0]).toBe('template-1');
  });

  it('cria um modelo novo pelo painel de detalhe', () => {
    render(<CrmChecklistTemplatesManager />);

    fireEvent.click(screen.getByRole('button', { name: 'Novo modelo' }));
    fireEvent.change(screen.getByLabelText('Nome do modelo *'), { target: { value: 'Pós-venda' } });
    fireEvent.change(screen.getByPlaceholderText('Novo item do checklist'), { target: { value: 'Ligar em 7 dias' } });
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Criar modelo' }));

    expect(mocks.createTemplate.mock.calls[0][0]).toEqual({
      name: 'Pós-venda',
      items: [{ id: 'novo-item', text: 'Ligar em 7 dias' }],
    });
  });
});
