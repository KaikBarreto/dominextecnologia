import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ContactFormDialog } from './ContactFormDialog';

vi.mock('@/hooks/use-mobile', () => ({
  useIsMobile: () => false,
  useIsCompact: () => false,
}));

vi.mock('@/contexts/AppLocaleContext', () => ({
  useAppLocaleContext: () => ({ locale: 'pt-br' }),
}));

describe('ContactFormDialog', () => {
  it('envia a data de nascimento ao criar um contato', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);

    render(
      <ContactFormDialog
        open
        onOpenChange={() => {}}
        onSubmit={onSubmit}
        isLoading={false}
      />,
    );

    fireEvent.change(screen.getByLabelText('Nome *'), { target: { value: 'Ana Souza' } });
    fireEvent.change(screen.getByLabelText('Data de nascimento'), {
      target: { value: '1992-08-17' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledOnce());
    expect(onSubmit.mock.calls[0][0]).toEqual(expect.objectContaining({
      name: 'Ana Souza',
      birth_date: '1992-08-17',
    }));
  });

  it('envia null ao remover a data de nascimento de um contato existente', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);

    render(
      <ContactFormDialog
        open
        onOpenChange={() => {}}
        contact={{
          id: '4de8334b-6cc2-42ab-82d8-a0e8ef72e311',
          name: 'Ana Souza',
          phone: null,
          email: null,
          position: null,
          birth_date: '1992-08-17',
        }}
        onSubmit={onSubmit}
        isLoading={false}
      />,
    );

    fireEvent.change(screen.getByLabelText('Data de nascimento'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledOnce());
    expect(onSubmit.mock.calls[0][0]).toEqual(expect.objectContaining({
      id: '4de8334b-6cc2-42ab-82d8-a0e8ef72e311',
      birth_date: null,
    }));
  });

  it('mantém o preenchimento e reaproveita o identificador quando a gravação falha', async () => {
    const onOpenChange = vi.fn();
    const onSubmit = vi.fn()
      .mockRejectedValueOnce(new Error('PGRST000: detalhe interno'))
      .mockResolvedValueOnce(undefined);

    render(
      <ContactFormDialog
        open
        onOpenChange={onOpenChange}
        onSubmit={onSubmit}
        isLoading={false}
      />,
    );

    fireEvent.change(screen.getByLabelText('Nome *'), {
      target: { value: 'Luiz Heverton' },
    });
    fireEvent.change(screen.getByLabelText('Telefone'), {
      target: { value: '62982931021' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledOnce());
    expect(await screen.findByText('Seus dados continuam aqui')).toBeVisible();
    expect(screen.getByText('Não foi possível salvar agora. Confira sua conexão e tente novamente.')).toBeVisible();
    expect(screen.queryByText(/PGRST000/)).not.toBeInTheDocument();
    expect(screen.getByLabelText('Nome *')).toHaveValue('Luiz Heverton');
    expect(screen.getByLabelText('Telefone')).toHaveValue('(62) 98293-1021');
    expect(screen.getByRole('button', { name: 'Adicionar' })).toBeEnabled();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);

    fireEvent.click(screen.getByRole('button', { name: 'Adicionar' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(2));
    expect(onSubmit.mock.calls[1][0].id).toBe(onSubmit.mock.calls[0][0].id);
    expect(onSubmit.mock.calls[0][0].id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
