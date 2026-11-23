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
