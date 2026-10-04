import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// O Radix Select chama scrollIntoView ao abrir e o jsdom não implementa.
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}

// Guarda da exclusão de origem: a trigger do banco cobre RENOMEAR, não EXCLUIR.
// Apagar uma origem em uso deixa `companies.origin` / `admin_leads.source`
// apontando pra um nome inexistente — o bug do badge sem cor. Estes testes
// provam que a tela exige uma decisão antes de apagar.

const deleteOrigin = { mutate: vi.fn(), isPending: false };
const reassignAndDeleteOrigin = { mutate: vi.fn(), isPending: false };
const countOriginUsage = vi.fn();

const ORIGINS = [
  { id: 'o1', name: 'Outros', icon: 'Globe', color: '#6B7280', created_at: null, description: 'Outra forma', show_in_signup: true, sort_order: 99 },
  { id: 'o2', name: 'Indicação', icon: 'Users', color: '#10B981', created_at: null, description: 'Alguém recomendou', show_in_signup: true, sort_order: 6 },
];

vi.mock('@/hooks/useCompanyOrigins', () => ({
  useCompanyOrigins: () => ({
    origins: ORIGINS,
    isLoading: false,
    createOrigin: { mutate: vi.fn(), isPending: false },
    updateOrigin: { mutate: vi.fn(), isPending: false },
    deleteOrigin,
    reassignAndDeleteOrigin,
    countOriginUsage,
  }),
}));

import { AdminOriginsTab } from './AdminOriginsTab';

async function openDeleteFor(name: string) {
  render(<AdminOriginsTab />);
  const row = screen.getByText(name).closest('div.rounded-lg') as HTMLElement;
  const trigger = row.querySelector('button[aria-haspopup="menu"]') as HTMLElement;
  // Radix abre o dropdown em pointerdown (que o jsdom não entrega) ou em Enter.
  fireEvent.keyDown(trigger, { key: 'Enter' });
  fireEvent.click(await screen.findByText('Excluir'));
}

describe('AdminOriginsTab — exclusão não órfãoza o histórico', () => {
  beforeEach(() => vi.clearAllMocks());

  it('origem em uso: mostra a contagem e não exclui sem escolher o destino', async () => {
    countOriginUsage.mockResolvedValue({ companies: 9, leads: 0, total: 9 });
    await openDeleteFor('Outros');

    expect(await screen.findByText(/9 empresas/)).toBeTruthy();
    const confirm = screen.getByRole('button', { name: /Mover e excluir/ }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);

    fireEvent.click(confirm);
    expect(deleteOrigin.mutate).not.toHaveBeenCalled();
    expect(reassignAndDeleteOrigin.mutate).not.toHaveBeenCalled();
  });

  it('origem em uso: escolhido o destino, move o histórico e só então exclui', async () => {
    countOriginUsage.mockResolvedValue({ companies: 9, leads: 0, total: 9 });
    await openDeleteFor('Outros');
    await screen.findByText(/9 empresas/);

    // Radix Select: abre por teclado (jsdom não entrega pointerdown) e escolhe
    // o destino na lista.
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Enter' });
    fireEvent.click(await screen.findByRole('option', { name: /Indicação/ }));

    const confirm = screen.getByRole('button', { name: /Mover e excluir/ }) as HTMLButtonElement;
    await waitFor(() => expect(confirm.disabled).toBe(false));
    fireEvent.click(confirm);

    expect(deleteOrigin.mutate).not.toHaveBeenCalled();
    expect(reassignAndDeleteOrigin.mutate).toHaveBeenCalledTimes(1);
    expect(reassignAndDeleteOrigin.mutate.mock.calls[0][0]).toMatchObject({
      id: 'o1', fromName: 'Outros', toName: 'Indicação',
    });
  });

  it('origem sem uso: exclui direto, sem pedir destino', async () => {
    countOriginUsage.mockResolvedValue({ companies: 0, leads: 0, total: 0 });
    await openDeleteFor('Outros');

    const confirm = await screen.findByRole('button', { name: 'Excluir' });
    await waitFor(() => expect((confirm as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(confirm);

    expect(deleteOrigin.mutate).toHaveBeenCalledTimes(1);
    expect(deleteOrigin.mutate.mock.calls[0][0]).toBe('o1');
  });
});
