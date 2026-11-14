import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
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
  confirming: 'Duplicando...',
  nameRequired: 'Informe um nome. Com a numeração, o nome final deve respeitar o limite.',
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
    expect(screen.getByText('Crie uma cópia para editar.')).toBeInTheDocument();
    expect(screen.getByText('De 1 a 20.')).toHaveAttribute(
      'id',
      screen.getByLabelText('Quantidade de cópias').getAttribute('aria-describedby'),
    );
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
    expect(screen.getByText(labels.nameRequired)).toBeInTheDocument();
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

  it.each(['', '0', '21', '1.5', 'texto'])(
    'recusa a quantidade inválida %j',
    (quantity) => {
      const onConfirm = renderDialog();
      fireEvent.change(screen.getByLabelText('Quantidade de cópias'), { target: { value: quantity } });
      fireEvent.click(screen.getByRole('button', { name: 'Duplicar' }));

      expect(onConfirm).not.toHaveBeenCalled();
      expect(screen.getByRole('alert')).toHaveTextContent('Informe uma quantidade entre 1 e 20.');
      expect(screen.getByLabelText('Quantidade de cópias')).toHaveAttribute('aria-invalid', 'true');
    },
  );

  it.each([1, 20])('aceita a quantidade no limite %i', (quantity) => {
    const onConfirm = renderDialog();
    fireEvent.change(screen.getByLabelText('Quantidade de cópias'), { target: { value: String(quantity) } });
    fireEvent.click(screen.getByRole('button', { name: 'Duplicar' }));

    expect(onConfirm).toHaveBeenCalledWith('Pesquisa - cópia', quantity);
  });

  it('recusa nome que excede o limite configurado e limpa o erro ao editar', () => {
    const onConfirm = vi.fn();
    render(
      <DuplicateEntityDialog
        open
        onOpenChange={vi.fn()}
        initialName="Nome acima"
        labels={labels}
        maxNameLength={5}
        onConfirm={onConfirm}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Duplicar' }));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.getByText(labels.nameRequired)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Nome da nova cópia'), { target: { value: 'Novo' } });
    expect(screen.queryByText(labels.nameRequired)).not.toBeInTheDocument();
    expect(screen.getByLabelText('Nome da nova cópia')).toHaveAttribute('aria-invalid', 'false');
  });

  it('submete com Enter a partir do nome e da quantidade', async () => {
    const onConfirm = vi.fn();
    renderDialog(onConfirm);

    fireEvent.keyDown(screen.getByLabelText('Nome da nova cópia'), { key: 'Enter' });
    await act(async () => Promise.resolve());
    fireEvent.keyDown(screen.getByLabelText('Quantidade de cópias'), { key: 'Enter' });

    expect(onConfirm).toHaveBeenCalledTimes(2);
    expect(onConfirm).toHaveBeenNthCalledWith(1, 'Pesquisa - cópia', 1);
    expect(onConfirm).toHaveBeenNthCalledWith(2, 'Pesquisa - cópia', 1);
  });

  it('mantém o diálogo utilizável para tentar novamente após rejeição', async () => {
    const onConfirm = vi.fn()
      .mockRejectedValueOnce(new Error('falha de rede'))
      .mockResolvedValueOnce(undefined);
    renderDialog(onConfirm);

    fireEvent.click(screen.getByRole('button', { name: 'Duplicar' }));
    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
    await act(async () => Promise.resolve());
    fireEvent.click(screen.getByRole('button', { name: 'Duplicar' }));

    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(2));
  });

  it('consome exceção síncrona e libera uma nova tentativa', async () => {
    const onConfirm = vi.fn()
      .mockImplementationOnce(() => { throw new Error('falha síncrona'); })
      .mockResolvedValueOnce(undefined);
    renderDialog(onConfirm);

    fireEvent.click(screen.getByRole('button', { name: 'Duplicar' }));
    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: 'Duplicar' }));

    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(2));
  });

  it('não fecha no intervalo entre o envio e a atualização visual de pending', async () => {
    let resolveRequest!: () => void;
    const onConfirm = vi.fn(() => new Promise<void>((resolve) => { resolveRequest = resolve; }));
    const onOpenChange = vi.fn();
    render(
      <DuplicateEntityDialog
        open
        onOpenChange={onOpenChange}
        initialName="Pesquisa - cópia"
        labels={labels}
        onConfirm={onConfirm}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Duplicar' }));
    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(onOpenChange).not.toHaveBeenCalled();

    resolveRequest();
    await act(async () => Promise.resolve());
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('bloqueia edição e fechamento pelos botões durante uma operação pendente', () => {
    const onOpenChange = vi.fn();
    const onConfirm = vi.fn();
    render(
      <DuplicateEntityDialog
        open
        onOpenChange={onOpenChange}
        initialName="Pesquisa - cópia"
        labels={labels}
        isPending
        onConfirm={onConfirm}
      />,
    );

    expect(screen.getByLabelText('Nome da nova cópia')).toBeDisabled();
    expect(screen.getByLabelText('Quantidade de cópias')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Duplicando...' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Duplicando...' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('fecha pelo cancelamento e restaura valores e erros ao reabrir', async () => {
    const onOpenChange = vi.fn();
    const onConfirm = vi.fn();
    const view = render(
      <DuplicateEntityDialog
        open
        onOpenChange={onOpenChange}
        initialName="Primeira cópia"
        labels={labels}
        onConfirm={onConfirm}
      />,
    );

    fireEvent.change(screen.getByLabelText('Nome da nova cópia'), { target: { value: ' ' } });
    fireEvent.change(screen.getByLabelText('Quantidade de cópias'), { target: { value: '0' } });
    fireEvent.click(screen.getByRole('button', { name: 'Duplicar' }));
    expect(screen.getAllByRole('alert')).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);

    view.rerender(
      <DuplicateEntityDialog
        open={false}
        onOpenChange={onOpenChange}
        initialName="Segunda cópia"
        labels={labels}
        onConfirm={onConfirm}
      />,
    );
    view.rerender(
      <DuplicateEntityDialog
        open
        onOpenChange={onOpenChange}
        initialName="Segunda cópia"
        labels={labels}
        onConfirm={onConfirm}
      />,
    );

    await waitFor(() => expect(screen.getByLabelText('Nome da nova cópia')).toHaveValue('Segunda cópia'));
    expect(screen.getByLabelText('Quantidade de cópias')).toHaveValue(1);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('considera o maior sufixo do lote no limite do nome final', () => {
    const onConfirm = vi.fn();
    render(
      <DuplicateEntityDialog
        open
        onOpenChange={vi.fn()}
        initialName=""
        labels={labels}
        maxNameLength={100}
        onConfirm={onConfirm}
      />,
    );
    const nameInput = screen.getByLabelText('Nome da nova cópia');
    const quantityInput = screen.getByLabelText('Quantidade de cópias');

    fireEvent.change(nameInput, { target: { value: 'a'.repeat(95) } });
    fireEvent.change(quantityInput, { target: { value: '20' } });
    fireEvent.click(screen.getByRole('button', { name: 'Duplicar' }));
    expect(onConfirm).toHaveBeenCalledWith('a'.repeat(95), 20);

    fireEvent.change(nameInput, { target: { value: 'a'.repeat(96) } });
    fireEvent.click(screen.getByRole('button', { name: 'Duplicar' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('alert')).toHaveTextContent(labels.nameRequired);
  });

  it('aceita 100 code points em lote unitário e recusa 101, inclusive com emojis', async () => {
    const onConfirm = vi.fn();
    render(
      <DuplicateEntityDialog
        open
        onOpenChange={vi.fn()}
        initialName=""
        labels={labels}
        maxNameLength={100}
        onConfirm={onConfirm}
      />,
    );
    const nameInput = screen.getByLabelText('Nome da nova cópia');

    const oneHundredEmojis = '😀'.repeat(100);
    fireEvent.change(nameInput, { target: { value: oneHundredEmojis } });
    fireEvent.click(screen.getByRole('button', { name: 'Duplicar' }));
    expect(onConfirm).toHaveBeenCalledWith(oneHundredEmojis, 1);
    await act(async () => Promise.resolve());

    fireEvent.change(nameInput, { target: { value: `${oneHundredEmojis}a` } });
    fireEvent.click(screen.getByRole('button', { name: 'Duplicar' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('alert')).toHaveTextContent(labels.nameRequired);
  });
});
