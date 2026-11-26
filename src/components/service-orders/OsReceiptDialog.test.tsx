import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ fetch: vi.fn(), download: vi.fn(), toast: vi.fn() }));
vi.mock('@/hooks/useOsCommercial', () => ({ fetchOsCommercialDocument: mocks.fetch }));
vi.mock('@/utils/osReceiptPdf', () => ({ downloadOsReceipt: mocks.download, paymentMethodLabel: () => 'Pix' }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock('@/components/ui/ResponsiveModal', () => ({ ResponsiveModal: ({ open, children, footer }: { open: boolean; children: ReactNode; footer: ReactNode }) => open ? <div>{children}{footer}</div> : null }));
import { OsReceiptDialog } from './OsReceiptDialog';
const receipt = { order_number: 1, received: 100, company: { name: 'Empresa' }, customer: { name: 'Cliente' }, payments: [{ reference: 'one', amount: 100, paid_date: '2026-11-26' }] };
beforeEach(() => vi.clearAllMocks());
describe('geração de recibo no relatório', () => {
 it('refaz a leitura no clique, impedindo PDF de recebimento estornado depois de abrir', async () => {
  mocks.fetch.mockResolvedValueOnce({ receipt }).mockResolvedValueOnce({ receipt: null });
  render(<OsReceiptDialog osId="os" open publicMode onOpenChange={() => {}} />);
  await screen.findByLabelText('Pagamentos no recibo');
  fireEvent.click(screen.getByRole('button', { name: 'Baixar recibo' }));
  await waitFor(() => expect(mocks.toast).toHaveBeenCalled());
  expect(mocks.download).not.toHaveBeenCalled(); expect(mocks.fetch).toHaveBeenCalledTimes(2);
 });
 it('falha de rede não deixa gerar um recibo com cache antigo', async () => {
  mocks.fetch.mockRejectedValue(new Error('Failed to fetch'));
  render(<OsReceiptDialog osId="os" open publicMode onOpenChange={() => {}} />);
  await screen.findByRole('alert');
  expect(screen.getByRole('button', { name: 'Baixar recibo' })).toBeDisabled();
 });
});
