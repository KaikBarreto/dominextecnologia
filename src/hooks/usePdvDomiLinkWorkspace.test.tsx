import { useRef } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { usePdvDomiLinkWorkspace } from './usePdvDomiLinkWorkspace';

const mocks = vi.hoisted(() => ({ readScale: vi.fn(), readBarcode: vi.fn(), quantity: vi.fn(), search: vi.fn(), toast: vi.fn(), allowed: false }));
vi.mock('./useDomiLink', () => ({ useDomiLink: () => ({ status: 'connected', busyAction: null, devices: {
  scales: [{ id: 'scale', label: 'Balança', online: true }],
  barcodes: [{ id: 'barcode', label: 'Leitor', online: true }],
}, readScale: mocks.readScale, readBarcode: mocks.readBarcode }) }));
vi.mock('./use-toast', () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock('@/components/pdv/domilink/DomiLinkSettingsCard', () => ({ DomiLinkSettingsCard: () => <p>Conexão local de equipamentos</p> }));
vi.mock('@/components/settings/domilink/useDomiLinkAccess', () => ({ useDomiLinkAccess: () => ({ allowed: mocks.allowed }) }));

function Harness({ identity, contextKey = 'cash-A:order-A', blocked = false, unit = 'kg' }: { identity: object; contextKey?: string; blocked?: boolean; unit?: string }) {
  const searchInputRef = useRef<HTMLInputElement>(null);
  const hardware = usePdvDomiLinkWorkspace({ identity, contextKey, blocked,
    getLine: () => ({ inventoryId: 'line', name: 'Material', unit, availableQuantity: 10 }),
    onSetQuantity: mocks.quantity, onSearchChange: mocks.search, searchInputRef,
  });
  return <><input ref={searchInputRef} aria-label="Busca" />{hardware.scannerControl}{hardware.weighControl?.('line')}</>;
}

describe('equipamentos no atendimento', () => {
  beforeEach(() => {
    vi.clearAllMocks(); mocks.allowed = false;
    mocks.readScale.mockResolvedValue({ unit: 'kg', weight_kg: 1.25, stable: true });
    mocks.readBarcode.mockResolvedValue('7890000000011');
  });
  it('abre configuração local sobre o atendimento sem sair nem alterar o carrinho', async () => {
    mocks.allowed = true;
    render(<Harness identity={{}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Equipamentos deste computador' }));
    expect(await screen.findByText('Conexão local de equipamentos')).toBeVisible();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(mocks.quantity).not.toHaveBeenCalled(); expect(mocks.search).not.toHaveBeenCalled();
  });

  it('peso exige clique e preenche somente a quantidade do item escolhido', async () => {
    render(<Harness identity={{}} />);
    expect(mocks.quantity).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Usar peso em Material' }));
    await waitFor(() => expect(mocks.quantity).toHaveBeenCalledExactlyOnceWith('line', 1.25));
    expect(screen.getByLabelText('Busca')).toHaveFocus();
  });
  it('leitor preenche a busca e não adiciona nem finaliza material automaticamente', async () => {
    render(<Harness identity={{}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Ler código' }));
    await waitFor(() => expect(mocks.search).toHaveBeenCalledExactlyOnceWith('7890000000011'));
    expect(mocks.quantity).not.toHaveBeenCalled();
  });
  it('não substitui a busca que foi digitada enquanto aguardava o leitor', async () => {
    let resolve!: (value: string) => void;
    mocks.readBarcode.mockReturnValue(new Promise<string>(done => { resolve = done; }));
    render(<Harness identity={{}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Ler código' }));
    const input = screen.getByLabelText('Busca');
    input.focus();
    fireEvent.change(input, {target:{value:'Cabo de cobre'}});
    await act(async () => resolve('7890000000011'));
    expect(mocks.search).not.toHaveBeenCalled();
    expect(input).toHaveValue('Cabo de cobre');
    expect(input).toHaveFocus();
  });
  it('não oferece balança para unidade sem conversão de massa', () => {
    render(<Harness identity={{}} unit="m" />);
    expect(screen.queryByRole('button', { name: /Usar peso/ })).not.toBeInTheDocument();
  });
  it('recusa peso instável sem alterar carrinho', async () => {
    mocks.readScale.mockResolvedValue({ unit: 'kg', weight_kg: 1.25, stable: false });
    render(<Harness identity={{}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Usar peso em Material' }));
    await waitFor(() => expect(mocks.toast).toHaveBeenCalled());
    expect(mocks.quantity).not.toHaveBeenCalled();
  });
  it.each(['aba', 'caixa', 'pagamento'] as const)('descarta peso atrasado após mudar %s, inclusive ida e volta', async kind => {
    let resolve!: (value: unknown) => void;
    mocks.readScale.mockReturnValue(new Promise(done => { resolve = done; }));
    const identity = {};
    const { rerender } = render(<Harness identity={identity} />);
    fireEvent.click(screen.getByRole('button', { name: 'Usar peso em Material' }));
    rerender(<Harness identity={kind === 'aba' ? {} : identity} contextKey={kind === 'caixa' ? 'cash-B:order-B' : 'cash-A:order-A'} blocked={kind === 'pagamento'} />);
    rerender(<Harness identity={identity} />);
    await act(async () => resolve({ unit: 'kg', weight_kg: 1.25, stable: true }));
    expect(mocks.quantity).not.toHaveBeenCalled(); expect(mocks.toast).not.toHaveBeenCalled();
  });
  it('descarta código atrasado ao fechar o atendimento', async () => {
    let resolve!: (value: string) => void;
    mocks.readBarcode.mockReturnValue(new Promise<string>(done => { resolve = done; }));
    const { unmount } = render(<Harness identity={{}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Ler código' })); unmount();
    await act(async () => resolve('7890000000011'));
    expect(mocks.search).not.toHaveBeenCalled();
  });
});
