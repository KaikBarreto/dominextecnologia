import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CleanTemplate } from './CleanTemplate';
import type { Quote, QuoteItem } from '@/hooks/useQuotes';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const item: QuoteItem = {
  id: 'item-1',
  position: 0,
  item_type: 'servico',
  description: 'Manutenção corretiva',
  quantity: 1,
  unit_price: 395,
  total_price: 395,
};

const quote: Quote = {
  id: 'quote-142', quote_number: 142, customer_id: null,
  prospect_name: 'Anglo', prospect_phone: null, prospect_email: 'tania@ccrdo.com.br',
  status: 'enviado', valid_until: '2026-10-20', discount_type: null, discount_value: null,
  subtotal: 395, discount_amount: 0, total_value: 395, notes: null, terms: null,
  assigned_to: null, proposal_template_id: null, token: 'token', created_by: null,
  created_at: '2026-10-14T12:00:00-03:00', updated_at: '2026-10-14T12:00:00-03:00',
  converted_to_os_id: null, final_price: 395, quote_items: [item],
};

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('CleanTemplate', () => {
  it('reserva largura para a descrição e marca linhas como atômicas no PDF', () => {
    act(() => {
      root.render(<CleanTemplate quote={quote} company={null} items={[item]} />);
    });

    const table = container.querySelector('.clean-table') as HTMLTableElement;
    const columns = Array.from(table.querySelectorAll('col')) as HTMLTableColElement[];
    const rows = Array.from(table.querySelectorAll('tr'));
    const mobileCard = container.querySelector('.clean-item-card');

    expect(table.style.tableLayout).toBe('fixed');
    expect(columns.map((column) => column.style.width)).toEqual(['40%', '22%', '16%', '22%']);
    expect(rows.every((row) => row.hasAttribute('data-pdf-keep'))).toBe(true);
    expect(mobileCard?.textContent).toContain('Manutenção corretiva');
    expect(mobileCard?.textContent).toContain('Valor unitário');
    expect(mobileCard?.textContent).toContain('Subtotal');
    expect(table.textContent).toContain('Manutenção corretiva');
  });
});
