import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CompraListRow } from '@/hooks/useCompras';
import { MaterialPurchasesTab } from './MaterialPurchasesTab';

const compras: CompraListRow[] = [
  {
    id: 'direct', numero: 28, title: 'Cobre', status: 'concluida', flow_type: 'compra_direta',
    created_at: '2026-11-02T10:00:00Z', purchase_date: '2026-11-02', notes: null,
    material_count: 2, cotacao_count: 0, lowest_total: null, accepted_total: null,
    accepted_supplier_name: null, direct_supplier_name: 'Clima Rio', direct_total: 80,
    direct_financial_transaction_id: 'transaction',
  } as CompraListRow,
  {
    id: 'request', numero: 29, title: 'Reposição de filtros', status: 'aberta', flow_type: 'requisicao',
    created_at: '2026-11-01T10:00:00Z', purchase_date: null, notes: 'Urgente',
    material_count: 4, cotacao_count: 2, lowest_total: 239, accepted_total: null,
    accepted_supplier_name: 'Fornecedor Sul', direct_supplier_name: null, direct_total: null,
    direct_financial_transaction_id: null,
  } as CompraListRow,
];

vi.mock('@/contexts/AppLocaleContext', () => ({
  useAppLocaleContext: () => ({ locale: 'pt-br', currency: 'BRL', timezone: 'America/Sao_Paulo' }),
}));
vi.mock('@/hooks/useCompras', () => ({
  useCompras: () => ({ compras, isLoading: false, error: null }),
}));
vi.mock('@/hooks/useLowStock', () => ({ useLowStock: () => ({ lowStockRows: [] }) }));
vi.mock('@/hooks/useCanRegisterDirectMaterialPurchase', () => ({
  useCanRegisterDirectMaterialPurchase: () => true,
}));
vi.mock('./CompraDetailView', () => ({
  CompraDetailView: ({ compra, onBack }: { compra: CompraListRow; onBack: () => void }) => (
    <div>
      <button type="button" onClick={onBack}>Voltar às compras</button>
      Detalhe de {compra.title}
    </div>
  ),
}));
vi.mock('./SuppliersDialog', () => ({ SuppliersDialog: () => null }));
vi.mock('./CompraEditorDialog', () => ({ CompraEditorDialog: () => null }));
vi.mock('./DirectMaterialPurchaseDialog', () => ({ DirectMaterialPurchaseDialog: () => null }));

beforeEach(() => {
  window.sessionStorage.clear();
});

describe('MaterialPurchasesTab', () => {
  it('separa tipo e status, mostra fornecedor, materiais e valor numa lista compacta', () => {
    render(<MaterialPurchasesTab />);

    expect(screen.getByRole('button', { name: /Todos os tempos/ })).toBeInTheDocument();
    expect(screen.getByText('#28 · Cobre')).toBeInTheDocument();
    expect(screen.getByText(/Compra direta · Clima Rio · 2 materiais/)).toBeInTheDocument();
    expect(screen.getByText('Concluída')).toBeInTheDocument();
    expect(screen.getByText('R$ 80,00')).toBeInTheDocument();

    expect(screen.getByText('#29 · Reposição de filtros')).toBeInTheDocument();
    expect(screen.getByText(/Requisição · Fornecedor Sul · 4 materiais · 2 cotações/)).toBeInTheDocument();
    expect(screen.getByText('Aberta')).toBeInTheDocument();
  });

  it('busca pelo fornecedor e abre detalhe contextual sem retirar a lista no desktop', () => {
    render(<MaterialPurchasesTab />);

    fireEvent.change(screen.getByPlaceholderText('Buscar por código, título ou fornecedor...'), {
      target: { value: 'Clima Rio' },
    });
    expect(screen.getByText('#28 · Cobre')).toBeInTheDocument();
    expect(screen.queryByText('#29 · Reposição de filtros')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /#28 · Cobre/ }));
    expect(screen.getByText('Detalhe de Cobre')).toBeInTheDocument();
    expect(screen.getByText('#28 · Cobre')).toBeInTheDocument();
  });

  it('explica os dois fluxos dentro de uma única ação Nova compra', async () => {
    render(<MaterialPurchasesTab />);

    // O Radix abre o menu por teclado no jsdom, que não entrega pointerdown como o navegador.
    fireEvent.keyDown(screen.getByRole('button', { name: /Nova compra/ }), { key: 'Enter' });
    expect(await screen.findByText('Criar requisição')).toBeInTheDocument();
    expect(screen.getByText(/Planejar materiais, comparar fornecedores/)).toBeInTheDocument();
    expect(screen.getByText('Registrar compra direta')).toBeInTheDocument();
    expect(screen.getByText(/compra já realizada no estoque e no Financeiro/)).toBeInTheDocument();
  });
});
