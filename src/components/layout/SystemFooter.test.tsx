import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SystemFooter } from './SystemFooter';

const clearCachesAndReload = vi.fn();

vi.mock('@/lib/pwa', () => ({
  clearCachesAndReload: (...args: unknown[]) => clearCachesAndReload(...args),
}));

vi.mock('@/lib/i18n', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/i18n')>();
  return {
    ...actual,
    useLocale: () => ({ locale: 'pt-br' }),
  };
});

vi.mock('@/contexts/AppLocaleContext', () => ({
  useAppLocaleContext: () => ({ locale: 'pt-br' }),
}));

vi.mock('sonner', () => ({
  toast: { info: vi.fn() },
}));

describe('SystemFooter', () => {
  beforeEach(() => {
    clearCachesAndReload.mockReset();
  });

  it('executa atualização forte de cache e PWA no botão ao lado da versão', async () => {
    clearCachesAndReload.mockResolvedValue(undefined);
    render(
      <MemoryRouter>
        <SystemFooter />
      </MemoryRouter>,
    );

    const refreshButton = screen.getByRole('button', { name: /atualizar/i });
    fireEvent.click(refreshButton);

    expect(refreshButton).toBeDisabled();
    await waitFor(() => expect(clearCachesAndReload).toHaveBeenCalledOnce());
    await waitFor(() => expect(refreshButton).toBeEnabled());
  });
});
