import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ForgotPasswordFlow } from './ForgotPasswordFlow';

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    functions: { invoke: invokeMock },
    auth: { signInWithPassword: vi.fn() },
  },
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

describe('ForgotPasswordFlow', () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  it('mantém conteúdo, campos do código e CTA legíveis no tema claro', async () => {
    invokeMock.mockResolvedValue({ data: { ok: true }, error: null });

    render(
      <MemoryRouter initialEntries={['/login']}>
        <ForgotPasswordFlow initialEmail="pessoa@example.com" onBack={vi.fn()} />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: 'Recuperar senha' })).toHaveClass('text-[#151819]');

    fireEvent.click(screen.getByRole('button', { name: 'ENVIAR CÓDIGO' }));

    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith('request-password-reset', {
      body: { email: 'pessoa@example.com' },
    }));

    expect(await screen.findByRole('heading', { name: 'Digite o código' })).toHaveClass('text-[#151819]');
    expect(screen.getByText('pessoa@example.com')).toHaveClass('text-[#151819]');

    const codeInputs = screen.getAllByRole('textbox', { name: /Digite o código \d de 8/ });
    expect(codeInputs).toHaveLength(8);
    codeInputs.forEach((input) => {
      expect(input).toHaveClass('border-slate-200', 'bg-white', 'text-[#151819]');
    });

    expect(screen.getByRole('button', { name: 'CONTINUAR' })).toHaveClass(
      'bg-[#151819]',
      'text-white',
    );
  });
});
