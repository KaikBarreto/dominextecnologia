import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => false }));

import { ServiceTypesMultiSelect } from './ServiceTypesMultiSelect';

const services = [
  { id: 'garantia', name: 'Garantia' },
  { id: 'higienizacao', name: 'Higienização' },
  { id: 'instalacao', name: 'Instalação Split' },
  { id: 'corretiva', name: 'Manutenção Corretiva' },
  { id: 'preventiva', name: 'Manutenção Preventiva' },
  { id: 'pmoc', name: 'PMOC' },
  { id: 'troca', name: 'Troca do motor ventilador' },
  { id: 'visita', name: 'Visita Técnica' },
];

describe('ServiceTypesMultiSelect', () => {
  it('mantém o último serviço acessível em uma lista longa e permite buscar sem acento', async () => {
    render(
      <ServiceTypesMultiSelect
        services={services}
        selectedIds={[]}
        onChange={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('combobox', { name: /adicionar serviços/i }));

    const list = await screen.findByRole('region', { name: 'Tipos de serviço disponíveis' });
    expect(list).toHaveClass('overflow-y-auto');
    expect(within(list).getByText('Visita Técnica')).toBeVisible();

    fireEvent.change(screen.getByPlaceholderText('Buscar tipo de serviço...'), {
      target: { value: 'visita tecnica' },
    });

    expect(within(list).getByText('Visita Técnica')).toBeVisible();
    expect(within(list).queryByText('Garantia')).not.toBeInTheDocument();
  });
});
