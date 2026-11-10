import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { EquipmentFormDialog } from './EquipmentFormDialog';

vi.mock('@/contexts/AppLocaleContext', () => ({
  useAppLocaleContext: () => ({
    locale: 'pt-br',
    currency: 'BRL',
    timezone: 'America/Sao_Paulo',
    isLoading: false,
    setUserLanguage: vi.fn(),
  }),
}));

vi.mock('@/hooks/useEquipmentFieldConfig', () => ({
  useEquipmentFieldConfig: () => ({ fields: [], isLoading: false }),
}));

vi.mock('@/hooks/usePartyLabels', () => ({
  usePartyLabels: () => ({
    activeLabels: [],
    labelIdsFor: () => [],
    setEntityLabels: { mutateAsync: vi.fn() },
  }),
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

vi.mock('@/components/customers/CustomerSelectField', () => ({
  CustomerSelectField: ({ placeholder }: { placeholder: string }) => (
    <button type="button">{placeholder}</button>
  ),
}));

vi.mock('@/components/ui/ResponsiveModal', () => ({
  ResponsiveModal: ({ open, title, children, footer }: {
    open: boolean;
    title: string;
    children: ReactNode;
    footer: ReactNode;
  }) => open ? (
    <div role="dialog" aria-label={title}>
      {children}
      {footer}
    </div>
  ) : null,
}));

describe('EquipmentFormDialog — validação renderizada', () => {
  it('mostra as duas mensagens PT-BR ao tentar criar sem cliente e nome', async () => {
    render(
      <EquipmentFormDialog
        open
        onOpenChange={vi.fn()}
        onSubmit={vi.fn()}
        customers={[]}
        categories={[]}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Criar' }));

    expect(await screen.findByText('Selecione o cliente')).toBeInTheDocument();
    expect(await screen.findByText('Informe o nome do equipamento')).toBeInTheDocument();
  });
});
