// Regressão da subcategoria na tela de Categorias (desktop).
//
// O que não pode voltar atrás:
// 1. categoria SEM filha continua sem nenhuma afordância de expandir (sem
//    seta, sem `aria-expanded`) — quem não usa subcategoria não vê diferença;
// 2. categoria COM filha expande e mostra as filhas, que NÃO aparecem soltas
//    na grade (senão a mesma categoria apareceria duas vezes);
// 3. a árvore pai → filhas sai da lista que o hook já trouxe: o componente só
//    consome `useFinancialCategories` (mockado aqui por inteiro, que é a única
//    fronteira do Supabase), sem nenhuma consulta por categoria.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as any).ResizeObserver = (globalThis as any).ResizeObserver || ResizeObserverStub;

vi.mock('@/contexts/AppLocaleContext', () => ({
  useAppLocaleContext: () => ({ locale: 'pt-br', currency: 'BRL', timezone: 'America/Sao_Paulo' }),
}));
// `useIsCompact` também mora aqui e é usado pelo AlertDialog: o mock precisa
// devolver os DOIS, senão a tela quebra no diálogo de exclusão.
vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => false, useIsCompact: () => false }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: () => {} }) }));
// Formulário de categoria é testado à parte; aqui ele só polui a árvore.
vi.mock('./CategoryFormDialog', () => ({ CategoryFormDialog: () => null }));

const noopMutation = { mutate: () => {}, mutateAsync: async () => ({}), isPending: false };

const cat = (over: Partial<any>) => ({
  id: over.id,
  name: over.name,
  type: over.type ?? 'saida',
  color: '#123456',
  icon: 'Tag',
  is_active: true,
  dre_group: over.dre_group ?? 'opex',
  is_system: false,
  company_id: 'c1',
  sort_order: 0,
  parent_id: over.parent_id ?? null,
  created_at: '',
  updated_at: '',
});

let categoriesMock: any[] = [];
vi.mock('@/hooks/useFinancialCategories', () => ({
  useFinancialCategories: () => ({
    categories: categoriesMock,
    isLoading: false,
    createCategory: noopMutation,
    updateCategory: noopMutation,
    deleteCategory: noopMutation,
    reorderCategories: noopMutation,
  }),
}));

import { FinanceCategorias } from './FinanceCategorias';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

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

function mount() {
  act(() => { root.render(<FinanceCategorias />); });
}

const textsOf = (sel: string) =>
  Array.from(document.querySelectorAll(sel)).map((n) => (n.textContent || '').trim());

describe('FinanceCategorias, subcategorias', () => {
  it('categoria sem filha não ganha seta nem aria-expanded', () => {
    categoriesMock = [
      cat({ id: '1', name: 'Aluguel' }),
      cat({ id: '2', name: 'Combustível' }),
      cat({ id: '3', name: 'Serviços', type: 'entrada' }),
    ];
    mount();
    // `div[aria-expanded]`: o trigger do menu de ações (Radix) também usa
    // aria-expanded, mas é um <button>. A afordância de expandir é a div.
    expect(document.querySelectorAll('div[aria-expanded]')).toHaveLength(0);
    expect(document.body.textContent).toContain('Aluguel');
  });

  it('categoria com filha expande, e a filha não aparece solta na grade', () => {
    categoriesMock = [
      cat({ id: 'p', name: 'Salários' }),
      cat({ id: 'a', name: 'Salários, Ajudantes', parent_id: 'p', dre_group: 'cmv' }),
      cat({ id: 'z', name: 'Aluguel' }),
    ];
    mount();

    // Só o PAI é expansível; "Aluguel" continua sem seta.
    const toggles = Array.from(document.querySelectorAll('div[aria-expanded]'));
    expect(toggles).toHaveLength(1);
    expect(toggles[0].getAttribute('aria-expanded')).toBe('false');

    // Recolhido: a filha não está na tela em lugar nenhum.
    expect(document.body.textContent).not.toContain('Salários, Ajudantes');
    // E o pai avisa que tem 1 subcategoria.
    expect(document.body.textContent).toContain('1 subcategoria');

    act(() => {
      (toggles[0] as HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(document.querySelector('div[aria-expanded]')?.getAttribute('aria-expanded')).toBe('true');
    expect(document.body.textContent).toContain('Salários, Ajudantes');
    // Filha de grupo DIFERENTE do pai mostra o grupo dela, e a tela explica.
    expect(document.body.textContent).toContain('CSP (Custo do Serviço Prestado)');
    expect(document.body.textContent).toContain('Cada subcategoria entra no DRE pelo grupo dela');
    // A filha aparece UMA vez só.
    expect(textsOf('span[title="Salários, Ajudantes"]')).toHaveLength(1);
  });
});
