import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DomiLinkSettingsCard } from './DomiLinkSettingsCard';

const mocks = vi.hoisted(() => ({ state: {} as Record<string, unknown>, toast: vi.fn() }));

vi.mock('@/hooks/useDomiLink', () => ({ useDomiLink: () => mocks.state }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: mocks.toast }) }));

const base = {
  setEnabled: vi.fn(), retry: vi.fn(), pair: vi.fn(), disconnect: vi.fn(), testPrint: vi.fn(), readScale: vi.fn(), readBarcode: vi.fn(),
  profile: null, devices: { printers: [], scales: [], barcodes: [] }, error: null, busyAction: null, lastScaleReading: null, lastBarcode: null,
};

describe('DomiLinkSettingsCard', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('fica simples e não inicia fluxo quando o recurso está desligado', () => {
    mocks.state = { ...base, enabled: false, status: 'disabled' };
    render(<DomiLinkSettingsCard />);
    expect(screen.getByRole('heading', { name: 'Equipamentos do caixa' })).toBeInTheDocument();
    expect(screen.getByText(/continua funcionando normalmente pelo navegador/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/código do DomiLink/i)).not.toBeInTheDocument();
  });

  it('só habilita pareamento com seis números', () => {
    mocks.state = { ...base, enabled: true, status: 'pairing' };
    render(<DomiLinkSettingsCard />);
    const button = screen.getByRole('button', { name: 'Parear' });
    expect(button).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/código do DomiLink/i), { target: { value: '12ab3456' } });
    expect(button).toBeEnabled();
  });

  it('mostra contagem curta e mantém equipamentos recolhidos quando conectado', () => {
    mocks.state = {
      ...base, enabled: true, status: 'connected',
      profile: { health: { version: '0.1.0' }, devices: [{ id: 'printer-1', kind: 'printer', label: 'Impressora virtual', online: true, capabilities: { print_formats: ['pdf'] } }] },
      devices: { printers: [{ id: 'printer-1', kind: 'printer', label: 'Impressora virtual', online: true, capabilities: { print_formats: ['pdf'] } }], scales: [], barcodes: [] },
    };
    render(<DomiLinkSettingsCard />);
    expect(screen.getByText('Pronto')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.queryByText('Impressora virtual')).not.toBeInTheDocument();
    expect(screen.queryByText('printer-1')).not.toBeInTheDocument();
  });

  it('usa fundo neutro no estado desconectado, sem badge dessaturado', () => {
    const printer = { id: 'printer-1', kind: 'printer', label: 'Impressora virtual', online: false, capabilities: { print_formats: ['pdf'] } };
    mocks.state = {
      ...base, enabled: true, status: 'connected',
      profile: { health: { version: '0.1.0' }, devices: [printer] },
      devices: { printers: [printer], scales: [], barcodes: [] },
    };
    render(<DomiLinkSettingsCard />);
    fireEvent.click(screen.getByRole('button', { name: /equipamentos e testes/i }));
    expect(screen.getByText('Desconectado')).toHaveClass('text-foreground');
    expect(screen.getByText('Desconectado')).not.toHaveClass('bg-muted-foreground');
  });

  it('mostra falha de impressão em PT-BR somente depois do job terminal', async () => {
    const printer = { id: 'printer-1', kind: 'printer', label: 'Impressora virtual', online: true, capabilities: { print_formats: ['pdf'] } };
    const testPrint = vi.fn().mockRejectedValue(new Error('O equipamento está offline. Confira a conexão e tente novamente.'));
    mocks.state = {
      ...base, testPrint, enabled: true, status: 'connected',
      profile: { health: { version: '0.1.0' }, devices: [printer] },
      devices: { printers: [printer], scales: [], barcodes: [] },
    };
    render(<DomiLinkSettingsCard />);
    fireEvent.click(screen.getByRole('button', { name: /equipamentos e testes/i }));
    fireEvent.click(screen.getByRole('button', { name: /imprimir teste/i }));
    await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Não foi possível concluir o teste',
      description: 'O equipamento está offline. Confira a conexão e tente novamente.',
      variant: 'destructive',
    })));
  });
});
