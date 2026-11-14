import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/components/BrandedQRCode', () => ({
  BrandedQRCode: ({ value }: { value: string }) => <div data-testid="qr">QR {value}</div>,
}));

import { InventoryIdentifierLabelPreview } from '@/components/inventory/identifiers/InventoryIdentifierLabelPreview';

describe('InventoryIdentifierLabelPreview', () => {
  it('mostra material, embalagem, Code 128 e QR com o mesmo identificador', () => {
    render(<InventoryIdentifierLabelPreview label={{
      materialName: 'Cimento CP II 50 kg', code: 'DX-ABC123', unitLabel: 'fardo', unitFactor: 4, sku: 'CIM-50',
    }} />);
    expect(screen.getByText('Cimento CP II 50 kg')).toBeInTheDocument();
    expect(screen.getByText('fardo = 4 un.')).toBeInTheDocument();
    expect(screen.getByText('SKU CIM-50')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Código de barras DX-ABC123' })).toBeInTheDocument();
    expect(screen.getByTestId('qr')).toHaveTextContent('DX-ABC123');
  });
});
