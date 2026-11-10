import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Quote } from '@/hooks/useQuotes';
import { QuoteTemplatePreviewDialog } from './QuoteTemplatePreviewDialog';

vi.mock('@/contexts/AppLocaleContext', () => ({ useAppLocaleContext: () => ({ locale: 'pt-br', currency: 'BRL' }) }));
vi.mock('@/hooks/use-mobile', () => ({ useIsCompact: () => false }));

globalThis.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;

const quote: Quote = {
  id: 'preview', quote_number: 0, customer_id: null, prospect_name: 'Cliente de demonstração',
  prospect_phone: null, prospect_email: null, status: 'rascunho', valid_until: null,
  discount_type: 'valor', discount_value: 25, subtotal: 200, discount_amount: 25, total_value: 175,
  notes: 'Atendimento agendado', terms: 'Pagamento na conclusão', assigned_to: null,
  proposal_template_id: null, token: 'preview', created_by: null, created_at: '2026-11-07T12:00:00Z',
  updated_at: '2026-11-07T12:00:00Z', converted_to_os_id: null, final_price: 175,
  show_labor_cost_in_proposal: false, show_inputs_cost_in_proposal: false,
  quote_items: [{ id: 'item', position: 0, item_type: 'servico', description: 'Higienização', quantity: 1, unit_price: 200, total_price: 200, unit_labor_cost: 81, unit_materials_cost: 19 }],
};

describe('QuoteTemplatePreviewDialog', () => {
  it('renderiza a proposta completa com total final e preserva a privacidade dos custos por padrão', () => {
    render(<QuoteTemplatePreviewDialog open onOpenChange={() => undefined} quote={quote} company={null} templateSlug="clean" />);
    const preview = screen.getByRole('dialog', { name: 'Como o cliente verá' });
    expect(within(preview).getByText('Custos de mão de obra e insumos ocultos.')).toBeInTheDocument();
    expect(within(preview).getAllByText('Higienização').length).toBeGreaterThan(0);
    expect(within(preview).getAllByText('Pagamento na conclusão').length).toBeGreaterThan(0);
    expect(within(preview).getAllByText(/175,00/).length).toBeGreaterThan(0);
    expect(within(preview).queryByText('#0')).not.toBeInTheDocument();
    expect(within(preview).queryByText(/Mão de obra \/ un\./)).not.toBeInTheDocument();
    expect(within(preview).queryByText(/Insumos \/ un\./)).not.toBeInTheDocument();
  });

  it('leva as permissões de custo para o mesmo renderer público e mantém leitura responsiva ao mudar o zoom', () => {
    render(<QuoteTemplatePreviewDialog open onOpenChange={() => undefined} quote={{ ...quote, show_labor_cost_in_proposal: true, show_inputs_cost_in_proposal: true }} company={null} templateSlug="clean" />);
    const preview = screen.getByRole('dialog', { name: 'Como o cliente verá' });
    expect(within(preview).getByText('Custos compartilhados: mão de obra e insumos.')).toBeInTheDocument();
    expect(within(preview).getAllByText(/Mão de obra \/ un\./).length).toBeGreaterThan(0);
    expect(within(preview).getAllByText(/Insumos \/ un\./).length).toBeGreaterThan(0);
    expect(within(preview).getByRole('button', { name: 'Leitura' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(within(preview).getByRole('button', { name: 'Documento' }));
    expect(within(preview).getByRole('button', { name: 'Documento' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(within(preview).getByRole('button', { name: 'Ampliar' }));
    expect(within(preview).getByRole('button', { name: 'Ajustar à tela' })).toBeInTheDocument();
    fireEvent.click(within(preview).getByRole('button', { name: 'Leitura' }));
    expect(within(preview).queryByRole('button', { name: 'Ajustar à tela' })).not.toBeInTheDocument();
  });
});
