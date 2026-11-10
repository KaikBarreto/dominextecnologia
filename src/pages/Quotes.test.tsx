import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { QuotesHeaderActions } from './Quotes';

describe('QuotesHeaderActions', () => {
  it('expõe as ações de configuração e criação sem alterar seus fluxos', () => {
    const onConfigure = vi.fn();
    const onNewQuote = vi.fn();

    render(
      <QuotesHeaderActions
        configureLabel="Configurar Proposta"
        newQuoteLabel="Novo Orçamento"
        onConfigure={onConfigure}
        onNewQuote={onNewQuote}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Configurar Proposta' }));
    fireEvent.click(screen.getByRole('button', { name: 'Novo Orçamento' }));

    expect(onConfigure).toHaveBeenCalledOnce();
    expect(onNewQuote).toHaveBeenCalledOnce();
  });
});
