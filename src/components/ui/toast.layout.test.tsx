import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { SONNER_TOAST_CLASS_NAMES } from './toast-layout';
import {
  Toast,
  ToastAction,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from './toast';

describe('layout global dos avisos', () => {
  it('mantem titulo e descricao na largura do conteudo e a acao abaixo no Sonner', () => {
    expect(SONNER_TOAST_CLASS_NAMES.toast).toContain('!grid-cols-[4.5rem_minmax(0,1fr)]');
    expect(SONNER_TOAST_CLASS_NAMES.content).toContain('!w-full');
    expect(SONNER_TOAST_CLASS_NAMES.content).toContain('!row-start-1');
    expect(SONNER_TOAST_CLASS_NAMES.title).toContain('!block');
    expect(SONNER_TOAST_CLASS_NAMES.description).toContain('!block');
    expect(SONNER_TOAST_CLASS_NAMES.actionButton).toContain('!row-start-2');
  });

  it('aplica a mesma hierarquia no toast Radix usado pelo EcoSistema e pelo Dominex', () => {
    render(
      <ToastProvider>
        <Toast open>
          <div className="col-start-2 row-start-1 w-full">
            <ToastTitle>Não foi possível carregar</ToastTitle>
            <ToastDescription>Tente novamente em instantes.</ToastDescription>
          </div>
          <ToastAction altText="Tentar novamente">Tentar novamente</ToastAction>
        </Toast>
        <ToastViewport />
      </ToastProvider>,
    );

    expect(document.querySelector('[data-state="open"]')).toHaveClass(
      'grid',
      'grid-cols-[4.5rem_minmax(0,1fr)]',
    );
    expect(screen.getByText('Não foi possível carregar')).toHaveClass('block', 'w-full');
    expect(screen.getByText('Tente novamente em instantes.')).toHaveClass('block', 'w-full');
    expect(screen.getByRole('button', { name: 'Tentar novamente' })).toHaveClass(
      'col-start-2',
      'row-start-2',
    );
  });
});
