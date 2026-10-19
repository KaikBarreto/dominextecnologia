// ─────────────────────────────────────────────────────────────────────────────
// Prova da DÍVIDA 5 da Onda 1 do PDV: excluir cliente que deve fiado não pode
// mais ser silencioso. O diálogo de exclusão passa a DIZER que existe dívida e
// QUANTO é, em PT-BR e com o valor formatado como dinheiro.
//
// As duas situações, lado a lado:
//   • SEM o add-on `pdv`: nenhuma menção a fiado no diálogo E nenhuma consulta
//     ao banco (nem `customers`, nem `customer_credit_ledger`). Diálogo
//     IDÊNTICO ao de hoje.
//   • COM o add-on: aviso saturado (NoticeBanner variant="warning", nunca tint
//     pastel montado à mão) com o valor em moeda, e nada quando o saldo é zero
//     ou é crédito a favor do cliente.
//
// O aviso NÃO bloqueia a exclusão de propósito: o direito do titular (LGPD)
// vence; o que faltava era o operador saber do que está abrindo mão.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const state = vi.hoisted(() => ({
  hasPdv: false,
  creditLimit: null as number | null,
  ledger: [] as { amount: number }[],
  reads: [] as string[],
}));

function thenable(value: unknown) {
  return {
    maybeSingle: () => Promise.resolve(value),
    then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(value).then(resolve, reject),
  };
}

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (table: string) => {
      state.reads.push(table);
      if (table === 'customers') {
        return {
          select: () => ({ eq: () => thenable({ data: { credit_limit: state.creditLimit }, error: null }) }),
        };
      }
      if (table === 'customer_credit_ledger') {
        return { select: () => ({ eq: () => thenable({ data: state.ledger, error: null }) }) };
      }
      throw new Error(`tabela inesperada no teste: ${table}`);
    },
  },
}));

vi.mock('@/contexts/AppLocaleContext', () => ({
  useAppLocaleContext: () => ({
    locale: 'pt-br',
    currency: 'BRL',
    timezone: 'America/Sao_Paulo',
    isLoading: false,
    setUserLanguage: async () => {},
  }),
}));

vi.mock('@/hooks/useCompanyModules', () => ({
  useCompanyModules: () => ({
    hasModule: (code: string) => (code === 'pdv' ? state.hasPdv : true),
  }),
}));

import { CustomerDeleteDebtNotice } from './CustomerDeleteDebtNotice';

let container: HTMLDivElement;
let root: Root;

async function mount(customerId: string | null) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await act(async () => {
    root.render(
      <QueryClientProvider client={client}>
        <CustomerDeleteDebtNotice customerId={customerId} />
      </QueryClientProvider>,
    );
  });
  // Flush da query do saldo (react-query resolve em alguns ticks).
  for (let i = 0; i < 5; i++) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

// Intl usa NBSP/narrow NBSP entre símbolo e número; normaliza pra espaço comum.
const texto = () => (container.textContent ?? '').replace(/[\u00A0\u202F]/g, ' ');

beforeEach(() => {
  state.hasPdv = false;
  state.creditLimit = null;
  state.ledger = [];
  state.reads = [];
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  document.body.innerHTML = '';
});

describe('CustomerDeleteDebtNotice — aviso de fiado na exclusão de cliente', () => {
  it('SEM o módulo PDV: não renderiza nada e NÃO consulta o banco', async () => {
    state.hasPdv = false;
    state.ledger = [{ amount: 800 }];

    await mount('cliente-1');

    expect(container.innerHTML).toBe('');
    expect(state.reads).toEqual([]);
  });

  it('COM o módulo e dívida em aberto: avisa quanto é, com o valor em dinheiro', async () => {
    state.hasPdv = true;
    state.ledger = [{ amount: 500 }, { amount: 300 }];

    await mount('cliente-1');

    expect(texto()).toContain('Fiado em aberto');
    expect(texto()).toContain('R$ 800,00');
    // Copy PT-BR, sem travessão, dizendo o que o operador está abrindo mão.
    expect(texto()).toContain('a cobrança fica sem registro');
    expect(texto()).not.toContain('—');
    // Régua da casa: aviso saturado, nunca `bg-destructive/10` montado à mão.
    const banner = container.querySelector('.bg-warning');
    expect(banner).not.toBeNull();
    expect(container.querySelector('[class*="/10"]')).toBeNull();
  });

  it('COM o módulo e saldo quitado: não avisa nada', async () => {
    state.hasPdv = true;
    state.ledger = [{ amount: 500 }, { amount: -500 }];

    await mount('cliente-1');

    expect(container.innerHTML).toBe('');
  });

  it('COM o módulo e crédito a favor do cliente: não avisa nada', async () => {
    state.hasPdv = true;
    state.ledger = [{ amount: -120 }];

    await mount('cliente-1');

    expect(container.innerHTML).toBe('');
  });

  it('diálogo fechado (customerId null): não consulta o banco nem com o módulo', async () => {
    state.hasPdv = true;
    state.ledger = [{ amount: 800 }];

    await mount(null);

    expect(container.innerHTML).toBe('');
    expect(state.reads).toEqual([]);
  });
});
