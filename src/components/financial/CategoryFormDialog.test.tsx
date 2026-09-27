import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

vi.mock('@/contexts/AppLocaleContext', () => ({
  useAppLocaleContext: () => ({ locale: 'pt-br' }),
}));

vi.mock('@/components/ui/ResponsiveModal', () => ({
  ResponsiveModal: ({ title, children, footer }: any) => (
    <div><h1>{title}</h1>{children}{footer}</div>
  ),
}));

vi.mock('@/components/ui/SearchableSelect', () => ({
  SearchableSelect: ({ options, value, onValueChange }: any) => (
    <select
      data-testid="parent-select"
      value={value}
      onChange={(event) => onValueChange(event.target.value)}
    >
      {options.map((option: any) => (
        <option key={option.value} value={option.value}>{option.label}</option>
      ))}
    </select>
  ),
}));

vi.mock('@/components/ui/ColorPicker', () => ({
  ColorPicker: ({ value, onChange }: any) => (
    <input data-testid="color-picker" value={value} onChange={(event) => onChange(event.target.value)} />
  ),
}));

import { CategoryFormDialog } from './CategoryFormDialog';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

const parent = {
  id: 'parent-1',
  company_id: 'company-1',
  name: 'Combustível Operacional',
  type: 'saida',
  color: '#c50000',
  icon: 'Fuel',
  dre_group: 'opex',
  dfc_group: 'investimento',
  parent_id: null,
  is_active: true,
  is_system: false,
  display_order: 1,
  created_at: '2026-09-27T00:00:00Z',
  updated_at: '2026-09-27T00:00:00Z',
};

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('CategoryFormDialog — criação de subcategoria', () => {
  it('herda cor, ícone, tipo e grupos DRE/DFC da categoria mãe como padrão editável', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    await act(async () => {
      root.render(
        <CategoryFormDialog
          open
          onOpenChange={() => {}}
          initialName="Palio Prata"
          initialParentId={parent.id}
          categories={[parent] as any}
          onSubmit={onSubmit}
        />,
      );
    });

    expect(document.body.textContent).toContain('Categoria mãe/principal');
    expect((document.querySelector('[data-testid="color-picker"]') as HTMLInputElement).value).toBe('#c50000');

    const create = Array.from(document.querySelectorAll('button')).find(
      (button) => button.textContent?.trim() === 'Criar',
    );
    await act(async () => {
      create!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Palio Prata',
      parent_id: parent.id,
      color: '#c50000',
      icon: 'Fuel',
      type: 'saida',
      dre_group: 'opex',
      dfc_group: 'investimento',
    }));
  });
});
