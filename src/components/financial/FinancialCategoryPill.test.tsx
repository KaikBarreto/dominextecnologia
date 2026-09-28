import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FinancialCategoryPill } from './FinancialCategoryPill';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('FinancialCategoryPill', () => {
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

  it('usa a cor e o ícone cadastrados com contraste branco', () => {
    act(() => root.render(
      <FinancialCategoryPill
        name="Energia"
        category={{ name: 'Energia', color: '#2563eb', icon: 'Zap' }}
      />,
    ));

    const pill = container.firstElementChild as HTMLElement;
    expect(pill.textContent).toContain('Energia');
    expect(pill.style.backgroundColor).toBe('rgb(37, 99, 235)');
    expect(pill.className).toContain('text-white');
    expect(pill.querySelector('svg')).toBeTruthy();
  });

  it('mantém categoria histórica legível quando o cadastro não existe mais', () => {
    act(() => root.render(<FinancialCategoryPill name="Categoria antiga" />));
    const pill = container.firstElementChild as HTMLElement;
    expect(pill.style.backgroundColor).toBe('rgb(100, 116, 139)');
    expect(pill.textContent).toContain('Categoria antiga');
  });
});
