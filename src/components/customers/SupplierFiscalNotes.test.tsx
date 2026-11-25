import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { state, download, navigateSpy } = vi.hoisted(() => ({
  state: { issued: [] as unknown[], received: [] as unknown[] },
  download: vi.fn(),
  navigateSpy: vi.fn(),
}));

vi.mock('@/hooks/useCustomerFiscalNotes', () => ({
  useSupplierFiscalNotes: () => ({ issued: state.issued, received: state.received, isLoading: false, isError: false }),
  useFiscalNoteDownloads: () => ({ download, busyKey: null }),
}));
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigateSpy };
});

import { SupplierFiscalNotes } from '@/components/customers/SupplierFiscalNotes';

const renderSection = () =>
  render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><SupplierFiscalNotes supplierId="sup-1" /></MemoryRouter>);

beforeEach(() => {
  vi.clearAllMocks();
  state.issued = [];
  state.received = [];
});

describe('SupplierFiscalNotes', () => {
  it('mostra estado vazio claro sem notas', () => {
    renderSection();
    expect(screen.getByText('Nenhuma nota fiscal deste fornecedor')).toBeInTheDocument();
  });

  it('lista NF-e de entrada emitida (com download) e nota recebida', () => {
    const issued = { key: 'nfe:1', model: 'nfe', documentId: '1', number: '12', series: 1, date: '2026-11-05T10:00:00Z', total: 500, cancelled: false, hasPdf: true, hasXml: true, xmlUrl: null, description: null };
    state.issued = [issued];
    state.received = [{ id: 'r1', number: '90', series: '1', issuer: 'Fornecedor LTDA', total: 80, date: '2026-11-01T10:00:00Z', cancelled: false, summaryOnly: false }];
    renderSection();
    expect(screen.getByText('Emitida pelo Dominex')).toBeInTheDocument();
    expect(screen.getByText('Recebida')).toBeInTheDocument();
    // As ações ficam no menu da linha; o Radix abre pelo teclado no jsdom.
    const trigger = screen.getAllByRole('button', { name: /^Ações de NF-e/ })[0];
    trigger.focus();
    fireEvent.keyDown(trigger, { key: 'Enter' });
    fireEvent.click(screen.getByRole('menuitem', { name: /Baixar DANFE/ }));
    expect(download).toHaveBeenCalledWith(issued, 'pdf');
    fireEvent.click(screen.getByRole('button', { name: /Abrir Notas fiscais/ }));
    expect(navigateSpy).toHaveBeenCalledWith('/notas-fiscais/nfe');
  });
});
