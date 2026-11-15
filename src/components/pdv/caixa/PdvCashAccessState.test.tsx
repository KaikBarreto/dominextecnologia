import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PdvCashAccessState } from './PdvCashAccessState';

describe('PdvCashAccessState', () => {
  it('explica a indisponibilidade sem expor termos internos do caixa', async () => {
    let finishRetry: (() => void) | undefined;
    const onRetry = vi.fn(() => new Promise<void>((resolve) => { finishRetry = resolve; }));

    render(
      <PdvCashAccessState
        kind="unavailable"
        description="Os dados do caixa não carregaram. Tente novamente em alguns instantes."
        onRetry={onRetry}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Não conseguimos abrir o caixa agora' })).toBeInTheDocument();
    expect(screen.getByText('Suas vendas e movimentações não foram alteradas.')).toBeInTheDocument();
    expect(screen.queryByText(/contrato de caixa/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Atualizando…' })).toBeDisabled();

    finishRetry?.();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Tentar novamente' })).toBeEnabled());
  });

  it('destaca a configuração como próxima ação do responsável', async () => {
    const onAction = vi.fn(async () => undefined);

    render(
      <PdvCashAccessState
        kind="setup"
        description="Escolha a conta que representa o dinheiro em espécie da loja."
        actionLabel="Escolher conta do caixa"
        onAction={onAction}
        onRetry={vi.fn()}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Prepare o caixa para começar' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Escolher conta do caixa' }));
    expect(onAction).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Escolher conta do caixa' })).toBeEnabled());
  });

  it('aguarda a preparação antes de liberar uma segunda tentativa', async () => {
    let finish: (() => void) | undefined;
    const onAction = vi.fn(() => new Promise<void>((resolve) => { finish = resolve; }));

    render(
      <PdvCashAccessState
        kind="setup"
        description="Prepare automaticamente o primeiro caixa."
        actionLabel="Preparar caixa"
        actionPendingLabel="Preparando caixa…"
        onAction={onAction}
        onRetry={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Preparar caixa' }));
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Preparando caixa…' })).toBeDisabled();

    finish?.();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Preparar caixa' })).toBeEnabled());
  });
});
