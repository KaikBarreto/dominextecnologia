import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { mapPdvOrdersWorkspaceError, pdvOrderStatusLabel, projectPdvOrdersList, projectPdvOrderWorkspaceDetail } from './usePdvOrdersList';
import { localizedTemplatesFor } from '@/lib/i18n/appRouteSlugs';

describe('tela geral de Pedidos do PDV', () => {
  it('projeta os três estados sem misturar seus significados', () => {
    const result = projectPdvOrdersList({ total: 1, page: 0, page_size: 25, can_filter_cash: true, cash_options: [{ id: 'c1', name: 'Caixa 01' }], operator_options: [{ id: 'u1', name: 'Maria' }], rows: [{ id: 'o1', number: 18, customer_name: 'Cliente', created_at: '2026-11-08T10:00:00Z', updated_at: '2026-11-08T10:10:00Z', commercial_status: 'criado', payment_status: 'reembolso_parcial', pickup_status: 'parcial', total: 450.25, item_count: 3, can_generate_receipt: true }] });
    expect(result.rows[0]).toMatchObject({ commercialStatus: 'criado', paymentStatus: 'reembolso_parcial', pickupStatus: 'parcial', total: 450.25, canGenerateReceipt: true });
    expect(result.cashOptions).toEqual([{ id: 'c1', name: 'Caixa 01' }]);
    expect(result.operatorOptions).toEqual([{ id: 'u1', name: 'Maria' }]);
    expect(result.canFilterCash).toBe(true);
  });

  it('rejeita linha incompleta e normaliza payload de detalhe', () => {
    expect(projectPdvOrdersList({ rows: [{ number: 1 }] }).rows).toEqual([]);
    expect(projectPdvOrderWorkspaceDetail({ order: { id: 'o1', number: 2, created_at: '2026-11-08T10:00:00Z', payment_status: 'reembolsado', pickup_status: 'entregue', total: 25, can_generate_receipt: false }, items: [{ id: 'i1', description: 'Cabo', quantity: 2, unit_price: 10, total: 20, delivered_quantity: 1 }], timeline: [{ kind: 'reembolso', label: 'Reembolso realizado', at: '2026-11-08T10:00:00Z' }] })).toMatchObject({ order: { id: 'o1', paymentStatus: 'reembolsado', pickupStatus: 'entregue', canGenerateReceipt: false }, items: [{ description: 'Cabo', deliveredQuantity: 1 }], timeline: [{ kind: 'reembolso' }] });
  });

  it('mantém a copy de cada eixo sem trocar pedido por pagamento ou retirada', () => {
    expect(pdvOrderStatusLabel('commercial', 'pago')).toBe('Pedido pago');
    expect(pdvOrderStatusLabel('payment', 'pago')).toBe('Pagamento concluído');
    expect(pdvOrderStatusLabel('pickup', 'entregue')).toBe('Retirada concluída');
    expect(pdvOrderStatusLabel('payment', 'reembolsado')).toBe('Reembolsado');
  });

  it('traduz a rota própria e não reutiliza a tela de orçamentos', () => {
    expect(localizedTemplatesFor('pdvOrders')).toEqual(['/pdv/pedidos', '/pos/orders', '/pos/pedidos', '/pos/commandes']);
    const app = readFileSync('src/App.tsx', 'utf8');
    expect(app).toContain("localizedAppRoutes('pdvOrders'");
    expect(app).toContain('screenKey="screen:pdv_orders"><PdvOrders />');
  });

  it('mantém cache autorizado e consulta somente RPCs v3', () => {
    const source = readFileSync('src/hooks/usePdvOrdersList.ts', 'utf8');
    expect(source).toContain('usePdvAuthorizedQueryScope');
    expect(source).toContain("gcTime: 0");
    expect(source).toContain("pdv_list_orders_workspace_v3");
    expect(source).toContain("pdv_get_order_workspace_v3");
    expect(source).not.toContain("supabase.from(");
    expect(source).not.toContain('keepPreviousData');
    expect(source).not.toContain('placeholderData');
  });

  it('concentra ações de cada pedido no menu de três pontos', () => {
    const page = readFileSync('src/pages/PdvOrders.tsx', 'utf8');
    expect(page).toContain('ariaLabel={`Ações do pedido ${row.number}`}');
    expect(page).toContain("label: 'Ver detalhes'");
    expect(page).toContain("label: 'Gerar comprovante'");
    expect(page).toContain('hidden: !row.canGenerateReceipt');
    expect(page).toContain('list.data?.canFilterCash');
    expect(page).not.toContain('<PdvOrderReceiptButton');
  });

  it('mapeia UUID fora da custódia sem revelar o pedido', () => {
    expect(mapPdvOrdersWorkspaceError({ code: '42501', details: 'code=pdv_orders_order_denied' }).message).toContain('não pertence');
    expect(mapPdvOrdersWorkspaceError({ code: '42501', details: 'code=pdv_orders_cash_filter_denied' }).message).toContain('outros caixas');
  });
});
