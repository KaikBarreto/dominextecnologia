import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import type { Quote } from '@/hooks/useQuotes';
vi.mock('@/components/ui/ResponsiveModal', () => ({ ResponsiveModal: ({ children, footer }: { children: ReactNode; footer: ReactNode }) => <div>{children}{footer}</div> }));
vi.mock('@/hooks/useEquipment', () => ({ useEquipment: () => ({ equipment: [{ id: 'e', name: 'Equipamento fictício' }] }) }));
vi.mock('@/hooks/useOsCommercial', () => ({ useOsExecutionTemplates: () => ({ data: [{ id: 't', name: 'Checklist sem vínculo comercial' }], isPending: false }) }));
import { QuoteServiceDistributionDialog } from './QuoteServiceDistributionDialog';
const quote = { id: 'q', customer_id: 'c', quote_number: 1 } as Quote;
describe('gerar OS sem acoplar checklist ao preço', () => {
 it('gera com execução vazia por padrão', () => {
  const confirm = vi.fn(); render(<QuoteServiceDistributionDialog open quote={quote} onConfirm={confirm} onOpenChange={() => {}} />);
  fireEvent.click(screen.getByRole('button', { name: 'Gerar OS' }));
  expect(confirm).toHaveBeenCalledWith([], false);
 });
 it('permite equipamento sem checklist e checklist independente do serviço', () => {
  const confirm = vi.fn(); render(<QuoteServiceDistributionDialog open quote={quote} onConfirm={confirm} onOpenChange={() => {}} />);
  fireEvent.click(screen.getByRole('switch', { name: 'Definir equipamentos e checklists agora' }));
  fireEvent.click(screen.getByRole('checkbox', { name: /Equipamento fictício/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Gerar OS' }));
  expect(confirm).toHaveBeenLastCalledWith([{ equipment_id: 'e', form_template_ids: [] }], false);
  fireEvent.click(screen.getByRole('checkbox', { name: 'Checklist sem vínculo comercial' }));
  fireEvent.click(screen.getByRole('button', { name: 'Gerar OS' }));
  expect(confirm).toHaveBeenLastCalledWith([{ equipment_id: 'e', form_template_ids: ['t'] }], false);
 });
});
