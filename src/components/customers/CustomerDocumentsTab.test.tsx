import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { state, download, navigateSpy } = vi.hoisted(() => ({
  state: { docs: [] as unknown[], failedSources: [] as string[] },
  download: vi.fn(),
  navigateSpy: vi.fn(),
}));

vi.mock('@/hooks/useCustomerDocuments', () => ({
  useCustomerDocuments: () => ({
    list: { data: state.docs, isLoading: false, isError: false, refetch: vi.fn(), failedSources: state.failedSources },
    upload: { mutateAsync: vi.fn(), isPending: false },
    setVisibility: { mutateAsync: vi.fn() },
    remove: { mutateAsync: vi.fn() },
    getSignedUrl: vi.fn(),
  }),
}));
vi.mock('@/hooks/useCustomerFiscalNotes', async () => {
  const actual = await vi.importActual<typeof import('@/hooks/useCustomerFiscalNotes')>('@/hooks/useCustomerFiscalNotes');
  return { ...actual, useFiscalNoteDownloads: () => ({ download, busyKey: null }) };
});
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigateSpy };
});

import { CustomerDocumentsTab } from '@/components/customers/CustomerDocumentsTab';

const base = {
  company_id: 'co', customer_id: 'cust', description: null, document_number: null, issue_date: '2026-11-01', amount: null,
  storage_path: '', file_name: 'x', mime_type: null, size_bytes: null, is_visible_in_portal: false, uploaded_by: null,
  updated_at: '2026-11-01T00:00:00Z',
};
const fiscalDoc = (id: string, model: 'nfe' | 'nfse', number: string, createdAt: string, cancelled = false) => ({
  ...base, id: `${model}:${id}`, document_kind: 'invoice', document_type: model === 'nfse' ? 'nfse' : 'nfe_product',
  title: `${model === 'nfse' ? 'NFS-e' : 'NF-e'} nº ${number}`, document_number: number, created_at: createdAt, amount: 100,
  source: 'fiscal',
  fiscal: { key: `${model}:${id}`, model, documentId: id, number, series: 1, date: createdAt, total: 100, cancelled, hasPdf: true, hasXml: true, xmlUrl: null, description: null },
});
const manualInvoice = { ...base, id: 'manual-1', document_kind: 'invoice', document_type: 'nfe_product', title: 'Nota de outro sistema', created_at: '2026-10-01T00:00:00Z', source: 'manual', is_visible_in_portal: true };
const manualDoc = { ...base, id: 'manual-2', document_kind: 'document', document_type: 'contract', title: 'Contrato assinado', created_at: '2026-10-02T00:00:00Z', source: 'manual' };
const attachment = { ...base, id: 'att-1', document_kind: 'document', document_type: 'other', title: 'Laudo do chiller', created_at: '2026-10-05T00:00:00Z', source: 'contract_attachment', contract_id: 'k1' };
const quoteShortcut = { ...base, id: 'shortcut:quote:q1', document_kind: 'document', document_type: 'other', title: 'Orçamento nº 9', created_at: '2026-10-06T00:00:00Z', source: 'shortcut', shortcut: { kind: 'quote', path: '/proposta/tok?preview=1', newTab: true } };
const osShortcut = { ...base, id: 'shortcut:service_order:os1', document_kind: 'document', document_type: 'other', title: 'Ordem de serviço 000004', created_at: '2026-10-07T00:00:00Z', source: 'shortcut', shortcut: { kind: 'service_order', path: '/ordens-servico?os=os1', newTab: false } };

/** O Radix abre o menu pelo teclado; o ponteiro não é simulado de forma confiável no jsdom. */
const openMenu = (name: RegExp) => {
  const trigger = screen.getByRole('button', { name });
  trigger.focus();
  fireEvent.keyDown(trigger, { key: 'Enter' });
};

const closeMenu = () => fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });

const renderTab = (canManage = true) =>
  render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><CustomerDocumentsTab customerId="cust" canManage={canManage} /></MemoryRouter>);

beforeEach(() => {
  vi.clearAllMocks();
  state.failedSources = [];
  state.docs = [
    fiscalDoc('1', 'nfe', '101', '2026-11-05T10:00:00Z'),
    fiscalDoc('2', 'nfse', '55', '2026-11-03T10:00:00Z', true),
    manualInvoice, manualDoc, attachment, quoteShortcut, osShortcut,
  ];
});

describe('CustomerDocumentsTab: notas fiscais', () => {
  it('lista as notas em tabela, com selo de origem e situação, e o menu de cada linha só oferece o que cabe', () => {
    renderTab();
    const nfeRow = screen.getByText('NF-e nº 101').closest('tr') as HTMLElement;
    expect(within(nfeRow).getByText(/Emitida pelo Dominex/)).toBeInTheDocument();
    expect(within(nfeRow).getByText('NF-e')).toBeInTheDocument();
    openMenu(/Ações de NF-e nº 101/);
    expect(screen.getByRole('menuitem', { name: /Baixar DANFE/ })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /Baixar XML/ })).toBeInTheDocument();
    // Nota automática não pode ser excluída nem ter a publicação alterada por aqui.
    expect(screen.queryByRole('menuitem', { name: /Excluir/ })).toBeNull();
    expect(screen.queryByRole('menuitem', { name: /portal/ })).toBeNull();
    closeMenu();

    const nfseRow = screen.getByText('NFS-e nº 55').closest('tr') as HTMLElement;
    expect(within(nfseRow).getByText('Cancelada')).toBeInTheDocument();
    openMenu(/Ações de NFS-e nº 55/);
    expect(screen.getByRole('menuitem', { name: /Baixar PDF/ })).toBeInTheDocument();
    closeMenu();

    // O upload manual mostra a situação no portal e mantém excluir e publicar no menu.
    const manualRow = screen.getByText('Nota de outro sistema').closest('tr') as HTMLElement;
    expect(within(manualRow).getByText('No portal')).toBeInTheDocument();
    openMenu(/Ações de Nota de outro sistema/);
    expect(screen.getByRole('menuitem', { name: /Excluir/ })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /Ocultar do portal/ })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /Abrir arquivo/ })).toBeInTheDocument();
  });

  it('baixa o DANFE e o XML pela ação fiscal', () => {
    renderTab();
    openMenu(/Ações de NF-e nº 101/);
    fireEvent.click(screen.getByRole('menuitem', { name: /Baixar DANFE/ }));
    openMenu(/Ações de NF-e nº 101/);
    fireEvent.click(screen.getByRole('menuitem', { name: /Baixar XML/ }));
    expect(download).toHaveBeenNthCalledWith(1, expect.objectContaining({ documentId: '1', model: 'nfe' }), 'pdf');
    expect(download).toHaveBeenNthCalledWith(2, expect.objectContaining({ documentId: '1', model: 'nfe' }), 'xml');
  });

  it('sem permissão de gestão o upload manual só pode ser aberto', () => {
    renderTab(false);
    openMenu(/Ações de Nota de outro sistema/);
    expect(screen.getByRole('menuitem', { name: /Abrir arquivo/ })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /Excluir/ })).toBeNull();
    expect(screen.queryByRole('menuitem', { name: /portal/ })).toBeNull();
  });

  it('a busca reduz a lista', () => {
    renderTab();
    fireEvent.change(screen.getByLabelText('Buscar arquivos'), { target: { value: '55' } });
    expect(screen.getByText('NFS-e nº 55')).toBeInTheDocument();
    expect(screen.queryByText('NF-e nº 101')).toBeNull();
    expect(screen.queryByText('Nota de outro sistema')).toBeNull();
  });

  it('o filtro por tipo reduz a lista e a busca sem resultado oferece limpar', () => {
    renderTab();
    openMenu(/Tipo/);
    fireEvent.click(screen.getByRole('menuitemcheckbox', { name: /NFS-e/ }));
    expect(screen.getByText('NFS-e nº 55')).toBeInTheDocument();
    expect(screen.queryByText('NF-e nº 101')).toBeNull();
    // O menu fica aberto após marcar a opção; fecha para o resto da tela voltar a ser acessível.
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });

    fireEvent.change(screen.getByLabelText('Buscar arquivos'), { target: { value: 'zzzz' } });
    expect(screen.getByText('Nada encontrado')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Limpar filtros' }));
    expect(screen.getByText('NF-e nº 101')).toBeInTheDocument();
  });

  it('ordena do mais recente para o mais antigo', () => {
    renderTab();
    const titles = screen.getAllByText(/nº|outro sistema/).map((node) => node.textContent);
    expect(titles.indexOf('NF-e nº 101')).toBeLessThan(titles.indexOf('NFS-e nº 55'));
    expect(titles.indexOf('NFS-e nº 55')).toBeLessThan(titles.indexOf('Nota de outro sistema'));
  });
});

describe('CustomerDocumentsTab: documentos', () => {
  beforeEach(() => {
    renderTab();
    fireEvent.click(screen.getByRole('tab', { name: /Documentos/ }));
  });

  it('lista anexos de contrato e atalhos sem excluir nem baixar', () => {
    const attachmentRow = screen.getByText('Laudo do chiller').closest('tr') as HTMLElement;
    expect(within(attachmentRow).getByText('Anexo de contrato')).toBeInTheDocument();
    openMenu(/Ações de Laudo do chiller/);
    expect(screen.getByRole('menuitem', { name: /Abrir arquivo/ })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /Excluir/ })).toBeNull();
    closeMenu();

    const quoteRow = screen.getByText('Orçamento nº 9').closest('tr') as HTMLElement;
    expect(within(quoteRow).getByText('Atalho')).toBeInTheDocument();
    openMenu(/Ações de Orçamento nº 9/);
    expect(screen.getByRole('menuitem', { name: 'Abrir' })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /Excluir/ })).toBeNull();
    expect(screen.queryByRole('menuitem', { name: /Baixar/ })).toBeNull();
    closeMenu();
    // Notas fiscais não aparecem nesta sub-aba.
    expect(screen.queryByText('NF-e nº 101')).toBeNull();
  });

  it('o atalho de OS navega para a rota existente', () => {
    openMenu(/Ações de Ordem de serviço 000004/);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Abrir' }));
    expect(navigateSpy).toHaveBeenCalledWith('/ordens-servico?os=os1');
  });

  it('o filtro por origem mostra só os atalhos', () => {
    openMenu(/Origem/);
    fireEvent.click(screen.getByRole('menuitemcheckbox', { name: /Atalhos/ }));
    expect(screen.getByText('Orçamento nº 9')).toBeInTheDocument();
    expect(screen.queryByText('Laudo do chiller')).toBeNull();
    expect(screen.queryByText('Contrato assinado')).toBeNull();
  });
});

describe('CustomerDocumentsTab: falha parcial', () => {
  it('avisa quando alguma fonte não carregou', () => {
    state.failedSources = ['orçamentos'];
    renderTab();
    expect(screen.getByRole('alert')).toHaveTextContent('orçamentos');
  });
});
