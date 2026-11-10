import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DuplicateEntityDialog, type DuplicateEntityDialogLabels } from './DuplicateEntityDialog';

vi.mock('@/hooks/use-mobile', () => ({ useIsCompact: () => false }));

const labels: DuplicateEntityDialogLabels = {
  title: 'Duplicar formulário',
  description: 'Crie uma cópia para editar.',
  nameLabel: 'Nome da nova cópia',
  quantityLabel: 'Quantidade de cópias',
  quantityHint: 'De 1 a 20.',
  copyHint: 'As cópias ficam inativas.',
  cancel: 'Cancelar',
  confirm: 'Duplicar',
  nameRequired: 'Informe o nome.',
  quantityInvalid: 'Informe uma quantidade entre 1 e 20.',
};

function renderDialog(onConfirm = vi.fn()) {
  render(
    <DuplicateEntityDialog
      open
      onOpenChange={vi.fn()}
      initialName="Pesquisa - cópia"
      labels={labels}
      onConfirm={onConfirm}
    />,
  );
  return onConfirm;
}

describe('DuplicateEntityDialog', () => {
  it('abre com o nome sugerido e uma cópia', () => {
    renderDialog();

    expect(screen.getByLabelText('Nome da nova cópia')).toHaveValue('Pesquisa - cópia');
    expect(screen.getByLabelText('Quantidade de cópias')).toHaveValue(1);
    expect(screen.getByText('As cópias ficam inativas.')).toBeInTheDocument();
  });

  it('envia nome sem espaços nas pontas e quantidade inteira válida', () => {
    const onConfirm = renderDialog();
    fireEvent.change(screen.getByLabelText('Nome da nova cópia'), { target: { value: '  Pesquisa filial  ' } });
    fireEvent.change(screen.getByLabelText('Quantidade de cópias'), { target: { value: '3' } });
    fireEvent.click(screen.getByRole('button', { name: 'Duplicar' }));

    expect(onConfirm).toHaveBeenCalledWith('Pesquisa filial', 3);
  });

  it('bloqueia nome vazio e quantidade fora do limite sem fundo tingido', () => {
    const onConfirm = renderDialog();
    const nameInput = screen.getByLabelText('Nome da nova cópia');
    const quantityInput = screen.getByLabelText('Quantidade de cópias');

    fireEvent.change(nameInput, { target: { value: '   ' } });
    fireEvent.change(quantityInput, { target: { value: '21' } });
    fireEvent.click(screen.getByRole('button', { name: 'Duplicar' }));

    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.getByText('Informe o nome.')).toBeInTheDocument();
    expect(screen.getByText('Informe uma quantidade entre 1 e 20.')).toBeInTheDocument();
    expect(nameInput.className).toContain('border-destructive');
    expect(nameInput.className).not.toContain('bg-destructive');
  });

  it('ignora um segundo envio enquanto o primeiro ainda está em andamento', () => {
    let resolveRequest!: () => void;
    const onConfirm = vi.fn(() => new Promise<void>((resolve) => { resolveRequest = resolve; }));
    renderDialog(onConfirm);

    const confirm = screen.getByRole('button', { name: 'Duplicar' });
    fireEvent.click(confirm);
    fireEvent.click(confirm);

    expect(onConfirm).toHaveBeenCalledTimes(1);
    resolveRequest();
  });
});
