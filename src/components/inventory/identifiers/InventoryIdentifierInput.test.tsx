import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mutateAsync, useBarcodeScanner } = vi.hoisted(() => ({
  mutateAsync: vi.fn(),
  useBarcodeScanner: vi.fn(),
}));
vi.mock('@/hooks/useBarcodeScanner', () => ({ useBarcodeScanner }));
vi.mock('@/hooks/useInventoryIdentifiers', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/hooks/useInventoryIdentifiers')>();
  return {
    ...original,
    useInventoryIdentifiers: () => ({ resolve: { mutateAsync, isPending: false } }),
  };
});

import { InventoryIdentifierInput } from '@/components/inventory/identifiers/InventoryIdentifierInput';

const resolved = {
  identifierId: 'ident-1', identifierType: 'barcode' as const, code: '7891234',
  unitLabel: 'un', unitFactor: 1, isPrimary: true,
  material: { id: 'mat-1', name: 'Material', sku: 'MAT-1', unit: 'un', salePrice: 10, archivedAt: null },
};

describe('InventoryIdentifierInput', () => {
  beforeEach(() => vi.clearAllMocks());

  it('permite digitar e resolve sem exigir recurso complexo', async () => {
    mutateAsync.mockResolvedValue(resolved);
    const onResolved = vi.fn();
    render(<InventoryIdentifierInput onResolved={onResolved} />);
    fireEvent.change(screen.getByLabelText('Código do material'), { target: { value: ' 7891234 ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Localizar material' }));
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith({ code: '7891234' }));
    expect(onResolved).toHaveBeenCalledWith(resolved);
    expect(screen.getByText(/Leitor USB funciona automaticamente/)).toBeInTheDocument();
  });

  it('explica quando o codigo nao existe', async () => {
    mutateAsync.mockResolvedValue(null);
    render(<InventoryIdentifierInput onResolved={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Código do material'), { target: { value: '4040' } });
    fireEvent.submit(screen.getByLabelText('Código do material').closest('form')!);
    expect(await screen.findByText('Nenhum material foi encontrado com esse código.')).toBeInTheDocument();
  });
});
