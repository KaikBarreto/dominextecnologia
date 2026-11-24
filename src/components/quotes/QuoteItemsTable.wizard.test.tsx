import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ServiceOrderBudgetItem } from '@/lib/serviceOrderBudget';

const { fetchCosts } = vi.hoisted(() => ({ fetchCosts: vi.fn() }));
vi.mock('@/hooks/useServiceCostBreakdown', () => ({ fetchServiceCostBreakdown: fetchCosts }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ profile: { company_id: 'company-demo' } }) }));
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({}) }));
vi.mock('@/hooks/useServiceTypes', () => ({ useServiceTypes: () => ({ serviceTypes: [{ id: 'svc-1', name: 'Manutenção', color: '#00a878', is_active: true, default_price: 175.5 }] }) }));
vi.mock('@/hooks/useInventory', () => ({ useInventory: () => ({ items: [] }) }));
vi.mock('@/components/ui/ResponsiveModal', () => ({ ResponsiveModal: ({ open, children, footer }: { open: boolean; children: React.ReactNode; footer: React.ReactNode }) => open ? <div role="dialog">{children}{footer}</div> : null }));
vi.mock('@/components/quotes/QuoteServicePickerField', () => ({ QuoteServicePickerField: ({ onValueChange }: { onValueChange: (id: string) => void }) => <button onClick={() => onValueChange('svc-1')}>Escolher manutenção</button> }));
vi.mock('@/components/inventory/MaterialBatchPicker', () => ({ MaterialBatchPicker: () => null }));
vi.mock('@/components/service-orders/QuickServiceTypeDialog', () => ({ QuickServiceTypeDialog: () => null }));
import { QuoteItemsTable } from './QuoteItemsTable';
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let node: HTMLDivElement;
let root: Root;
const changed = vi.fn();
function Host({ bdi = false, initial = [], readOnly = false }: { bdi?: boolean; initial?: ServiceOrderBudgetItem[]; readOnly?: boolean }) {
  const [items, setItems] = useState(initial);
  return <QuoteItemsTable variant="wizard" items={items} readOnly={readOnly} pricingEnabled={bdi} bdiFactor={.5} onChange={next => { changed(next); setItems(next); }} />;
}
function button(text: string) { return Array.from(node.querySelectorAll('button')).find(b => b.textContent?.trim() === text)!; }
async function click(text: string) { await act(async () => button(text).click()); }
async function add() { await click('Adicionar serviço'); await click('Escolher manutenção'); await click('Adicionar'); }
beforeEach(() => { node = document.createElement('div'); document.body.append(node); root = createRoot(node); changed.mockReset(); fetchCosts.mockReset().mockResolvedValue({ totalCost: 100, laborCost: 80, materialsCost: 20, quoteExtrasCost: 0, hourlyRate: 40, hours: 2 }); });
afterEach(() => { act(() => root.unmount()); node.remove(); });
describe('orçamento rápido da OS', () => {
  it('inclui serviço diretamente com custo canônico e mantém o preço cadastrado no modo manual', async () => {
    act(() => root.render(<Host />)); await add();
    expect(fetchCosts).toHaveBeenCalledWith({}, 'company-demo', 'svc-1');
    expect(changed).toHaveBeenLastCalledWith([expect.objectContaining({ service_type_id: 'svc-1', quantity: 1, unit_price: 175.5, total_price: 175.5, unit_total_cost: 100, pricing_mode: 'registered' })]);
    const price = node.querySelector('input[aria-label="Valor unitário de Manutenção"]')!;
    act(() => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(price, '400'); price.dispatchEvent(new Event('input', { bubbles: true })); });
    act(() => price.dispatchEvent(new FocusEvent('focusout', { bubbles: true })));
    expect(changed).toHaveBeenLastCalledWith([expect.objectContaining({ unit_price: 400, total_price: 400, pricing_mode: 'manual', price_override: 400 })]);
  });
  it('aplica BDI no serviço adicionado sem alterar outros valores manuais', async () => {
    const initial: ServiceOrderBudgetItem[] = [{ position: 0, item_type: 'servico', description: 'Valor combinado', quantity: 1, unit_price: 350, total_price: 350, pricing_mode: 'manual', price_override: 350 }];
    act(() => root.render(<Host bdi initial={initial} />)); await add();
    expect(changed).toHaveBeenLastCalledWith([initial[0], expect.objectContaining({ unit_price: 200, total_price: 200, unit_total_cost: 100, pricing_mode: 'cost_bdi', price_override: null })]);
  });
  it('não adiciona uma resposta de custos atrasada depois de sair da etapa', async () => {
    let resolve!: (value: { totalCost: number }) => void;
    fetchCosts.mockReturnValue(new Promise(done => { resolve = done; }));
    act(() => root.render(<Host />)); await click('Adicionar serviço'); await click('Escolher manutenção'); await click('Adicionar');
    act(() => root.render(<p>Outra etapa</p>)); await act(async () => resolve({ totalCost: 100 }));
    expect(changed).not.toHaveBeenCalled();
  });
  it('preserva uma edição feita enquanto os custos do novo serviço carregam', async () => {
    let resolve!: (value: { totalCost: number }) => void;
    fetchCosts.mockReturnValue(new Promise(done => { resolve = done; }));
    act(() => root.render(<Host initial={[{ position: 0, item_type: 'servico', description: 'Valor combinado', quantity: 1, unit_price: 350, total_price: 350, pricing_mode: 'manual' }]} />));
    await click('Adicionar serviço'); await click('Escolher manutenção'); await click('Adicionar');
    const price = node.querySelector('input[aria-label="Valor unitário de Valor combinado"]')!;
    act(() => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(price, '500'); price.dispatchEvent(new Event('input', { bubbles: true })); });
    act(() => price.dispatchEvent(new FocusEvent('focusout', { bubbles: true })));
    await act(async () => resolve({ totalCost: 100 }));
    expect(changed).toHaveBeenLastCalledWith([expect.objectContaining({ unit_price: 500, total_price: 500, pricing_mode: 'manual' }), expect.objectContaining({ service_type_id: 'svc-1' })]);
  });
  it('não oferece inclusão nem edição em visualização somente leitura', () => {
    act(() => root.render(<Host readOnly initial={[{ position: 0, item_type: 'servico', description: 'Serviço salvo', quantity: 1, unit_price: 350, total_price: 350 }]} />));
    expect(node.querySelector('input')).toBeNull(); expect(button('Adicionar serviço')).toBeUndefined(); expect(node.textContent).toContain('Serviço salvo');
  });
});
