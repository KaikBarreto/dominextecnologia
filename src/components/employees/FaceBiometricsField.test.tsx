import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FaceBiometricsField } from './FaceBiometricsField';

const toast = vi.fn();
const createMutate = vi.fn();
const deleteMutate = vi.fn();
let enrolled = false;

vi.mock('@/contexts/AppLocaleContext', () => ({
  useAppLocaleContext: () => ({ locale: 'pt-br' }),
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast }),
}));

vi.mock('@/hooks/useFaceBiometrics', () => ({
  useFaceTemplateStatus: () => ({
    data: enrolled
      ? { enrolled: true, template_count: 3, model_version: 'modelo', created_at: '2026-09-20' }
      : { enrolled: false, template_count: 0, model_version: null, created_at: null },
    isLoading: false,
  }),
  useCreateFaceEnrollmentLink: () => ({
    mutateAsync: createMutate,
    isPending: false,
  }),
  useDeleteFaceBiometrics: () => ({
    mutateAsync: deleteMutate,
    isPending: false,
  }),
}));

beforeEach(() => {
  enrolled = false;
  toast.mockReset();
  createMutate.mockReset();
  deleteMutate.mockReset();
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
  });
});

describe('FaceBiometricsField', () => {
  it('avisa que o funcionario precisa ser salvo antes de gerar link', () => {
    render(<FaceBiometricsField employeeId={null} />);
    expect(screen.getByText(/salve o funcionário/i)).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('gera capability uma unica vez, monta a URL local e copia para o gestor', async () => {
    createMutate.mockResolvedValue({
      token: 'a'.repeat(64),
      expires_at: '2026-09-21T12:00:00.000Z',
    });
    render(<FaceBiometricsField employeeId="0d182f55-e29b-4d23-a641-e178004bfef3" />);

    fireEvent.click(screen.getByRole('button', { name: /gerar link/i }));
    const input = await screen.findByRole('textbox');
    expect(input).toHaveValue(`${window.location.origin}/cadastro-facial/${'a'.repeat(64)}`);
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      `${window.location.origin}/cadastro-facial/${'a'.repeat(64)}`,
    );
    expect(createMutate).toHaveBeenCalledWith('0d182f55-e29b-4d23-a641-e178004bfef3');
  });

  it('token malformado nunca vira link compartilhavel', async () => {
    createMutate.mockResolvedValue({ token: 'curto', expires_at: '2026-09-21' });
    render(<FaceBiometricsField employeeId="0d182f55-e29b-4d23-a641-e178004bfef3" />);

    fireEvent.click(screen.getByRole('button', { name: /gerar link/i }));
    await waitFor(() => expect(toast).toHaveBeenCalled());
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(navigator.clipboard.writeText).not.toHaveBeenCalled();
  });

  it('exclusao exige confirmacao antes de apagar os templates', async () => {
    enrolled = true;
    deleteMutate.mockResolvedValue(undefined);
    render(<FaceBiometricsField employeeId="0d182f55-e29b-4d23-a641-e178004bfef3" />);

    fireEvent.click(screen.getByRole('button', { name: /excluir biometria/i }));
    expect(await screen.findByText(/excluir cadastro facial/i)).toBeInTheDocument();
    expect(deleteMutate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /^excluir biometria$/i }));
    await waitFor(() => expect(deleteMutate).toHaveBeenCalledTimes(1));
  });
});
