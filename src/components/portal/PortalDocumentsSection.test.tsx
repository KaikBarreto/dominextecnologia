import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PortalDocumentsSection, type PortalDocumentItem } from './PortalDocumentsSection';

const downloadMock = vi.fn();
vi.mock('./portalDocumentDownload', () => ({
  requestPortalDocumentDownload: (...args: unknown[]) => downloadMock(...args),
}));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));

function item(overrides: Partial<PortalDocumentItem>): PortalDocumentItem {
  return {
    id: crypto.randomUUID(),
    source: 'manual',
    title: 'Documento',
    description: null,
    document_type: 'other',
    document_number: null,
    issue_date: '2026-11-20',
    amount: 100,
    file_name: 'arquivo.pdf',
    mime_type: 'application/pdf',
    size_bytes: null,
    created_at: '2026-11-20T10:00:00Z',
    ...overrides,
  };
}

const nfe = item({
  id: 'e0000000-0000-4000-8000-000000000001',
  source: 'dominex_nfe',
  title: 'VENDA DE MERCADORIA',
  document_type: 'nfe',
  document_number: '123',
  has_xml: true,
});
const nfce = item({
  id: 'e0000000-0000-4000-8000-000000000002',
  source: 'dominex_nfce',
  title: 'VENDA BALCAO',
  document_type: 'nfce',
  document_number: '77',
  has_xml: false,
});
const nfse = item({
  id: 'e0000000-0000-4000-8000-000000000003',
  source: 'dominex_nfse',
  title: 'Manutenção preventiva',
  document_type: 'nfse',
  document_number: '9001',
});

function renderSection(items: PortalDocumentItem[]) {
  return render(
    <PortalDocumentsSection
      kind="invoice"
      items={items}
      portalToken={'a'.repeat(64)}
      sessionToken="sess"
      locale="pt-br"
      currency="BRL"
    />,
  );
}

const cards = () => screen.queryAllByTestId('portal-document-card');

describe('PortalDocumentsSection (notas)', () => {
  beforeEach(() => {
    downloadMock.mockReset();
    downloadMock.mockResolvedValue({ kind: 'url', url: 'https://signed.example.invalid/x' });
    vi.spyOn(window, 'open').mockImplementation(() => null);
  });

  it('filtro por tipo reduz a lista e só oferece tipos presentes', () => {
    renderSection([nfe, nfce, nfse]);
    expect(cards()).toHaveLength(3);
    expect(screen.queryByRole('button', { name: 'Outras' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'NFC-e' }));
    expect(cards()).toHaveLength(1);
    expect(screen.getByText('VENDA BALCAO')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Todas' }));
    expect(cards()).toHaveLength(3);
  });

  it('busca por número reduz a lista', () => {
    renderSection([nfe, nfce, nfse]);
    fireEvent.change(screen.getByLabelText('Buscar nota fiscal'), { target: { value: '9001' } });
    expect(cards()).toHaveLength(1);
    expect(screen.getByText('Manutenção preventiva')).toBeInTheDocument();
  });

  it('"Baixar XML" só aparece com has_xml', () => {
    renderSection([nfe, nfce, nfse]);
    expect(screen.getAllByRole('button', { name: /Baixar XML/ })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: /Baixar PDF/ })).toHaveLength(2);
  });

  it('download envia source e format certos', async () => {
    renderSection([nfe]);
    fireEvent.click(screen.getByRole('button', { name: /Baixar XML/ }));
    await waitFor(() => expect(downloadMock).toHaveBeenCalledTimes(1));
    expect(downloadMock).toHaveBeenLastCalledWith(expect.objectContaining({
      documentId: nfe.id,
      source: 'dominex_nfe',
      format: 'xml',
      sessionToken: 'sess',
    }));
    fireEvent.click(screen.getByRole('button', { name: /Baixar PDF/ }));
    await waitFor(() => expect(downloadMock).toHaveBeenCalledTimes(2));
    expect(downloadMock).toHaveBeenLastCalledWith(expect.objectContaining({ source: 'dominex_nfe', format: 'pdf' }));
    await waitFor(() => expect(window.open).toHaveBeenCalledWith('https://signed.example.invalid/x', '_blank', 'noopener,noreferrer'));
  });

  it('NFS-e continua sem format', async () => {
    renderSection([nfse]);
    fireEvent.click(screen.getByRole('button', { name: /Abrir arquivo/ }));
    await waitFor(() => expect(downloadMock).toHaveBeenCalledTimes(1));
    expect(downloadMock.mock.calls[0][0]).toMatchObject({ source: 'dominex_nfse', format: undefined });
  });

  it('pagina só quando passa de uma página', () => {
    const many = Array.from({ length: 12 }, (_, index) => item({ title: `Nota ${index + 1}`, document_type: 'nfe', source: 'dominex_nfe' }));
    const { unmount } = renderSection(many.slice(0, 10));
    expect(screen.queryByLabelText('Próxima página')).toBeNull();
    unmount();
    renderSection(many);
    expect(cards()).toHaveLength(10);
    fireEvent.click(screen.getByLabelText('Próxima página'));
    expect(cards()).toHaveLength(2);
  });

  it('textos novos não expõem marca da plataforma', () => {
    renderSection([nfe, nfce]);
    expect(screen.getAllByText('Emitida pela empresa')).toHaveLength(2);
    expect(document.body.textContent).not.toMatch(/Dominex|Auctus/);
  });
});
