import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CompanySegmentMultiSelect } from './CompanySegmentMultiSelect';

vi.mock('@/components/ui/popover', () => ({
  Popover: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  PopoverTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  PopoverContent: () => null,
}));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

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

describe('CompanySegmentMultiSelect', () => {
  it('renderiza cada seleção como badge saturado com ícone e texto branco', () => {
    act(() => {
      root.render(
        <CompanySegmentMultiSelect
          value={['refrigeracao', 'manutencao']}
          onChange={() => {}}
        />,
      );
    });

    const badges = Array.from(container.querySelectorAll('[aria-label="Segmentos selecionados"] > span'));
    expect(badges).toHaveLength(2);
    expect(badges.map((badge) => badge.textContent)).toEqual([
      'Refrigeração e Climatização',
      'Manutenção Predial',
    ]);
    expect(badges.every((badge) => badge.classList.contains('text-white'))).toBe(true);
    expect(badges.map((badge) => (badge as HTMLElement).style.backgroundColor)).toEqual([
      'rgb(6, 182, 212)',
      'rgb(236, 72, 153)',
    ]);
    expect(badges.every((badge) => badge.querySelector('svg'))).toBe(true);
  });
});
