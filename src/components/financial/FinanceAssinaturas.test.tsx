// Testes de COMPORTAMENTO da tela "Assinaturas" (aba do Financeiro).
//
// Contexto do bug relatado pelo CEO ("não tem CRUD nem checkboxes"): as
// ÚNICAS empresas com a aba visível em produção (módulo `cobrancas` + conta
// Asaas ativa) tinham, em 19/09/2026, 100% das assinaturas com
// status='cancelled'. Uma assinatura cancelada nunca teve checkbox nem botão
// de ação (`isManageable` já filtrava isso) — então a tela parecia sem CRUD
// nenhum, mesmo com editar/cancelar/seleção em massa todos implementados.
//
// Fix: canceladas ficam ocultas por padrão (toggle "Mostrar canceladas"
// revela o histórico). Isso NÃO adiciona um "excluir": ver a decisão no
// briefing do Tech Lead — excluir de verdade exige grant de DELETE em
// `tenant_subscriptions` (hoje revogado de `authenticated` por design, pra
// não deixar a assinatura viva na Asaas com o registro local sumido) ou uma
// ação nova na edge `tenant-asaas-manage-subscription`, ambos fora do escopo
// deste arquivo.
//
// Driver mínimo com createRoot + act, mesmo padrão de ChargeDialog.test.tsx.
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

const { toastSpy, cancelMutateAsync, bulkCancelMutateAsync } = vi.hoisted(() => ({
  toastSpy: vi.fn(),
  cancelMutateAsync: vi.fn().mockResolvedValue(undefined),
  bulkCancelMutateAsync: vi.fn().mockResolvedValue({ ok: 1, fail: 0 }),
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

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: toastSpy }),
}));

// SubscriptionDialog é o MODAL de criação, dono de outro Dev em paralelo —
// não é tocado nem exercitado aqui. Stub leve só pra não puxar as
// dependências pesadas dele (useCustomers, useTenantPaymentAccount, etc).
vi.mock('@/components/financial/SubscriptionDialog', () => ({
  SubscriptionDialog: () => null,
}));

type Sub = {
  id: string;
  status: string;
  value: number;
  cycle: string;
  billing_type: string;
  next_due_date: string | null;
  description: string | null;
  customers: { id: string; name: string } | null;
};

const subsState = vi.hoisted(() => ({ list: [] as Sub[] }));

vi.mock('@/hooks/useTenantSubscriptions', () => ({
  useTenantSubscriptions: () => ({
    subscriptions: subsState.list,
    isLoading: false,
    manageSubscription: { mutateAsync: cancelMutateAsync, isPending: false },
    bulkCancel: { mutateAsync: bulkCancelMutateAsync, isPending: false },
  }),
}));

import { FinanceAssinaturas } from './FinanceAssinaturas';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

function mount() {
  act(() => {
    root.render(<FinanceAssinaturas />);
  });
}

const text = () => document.body.textContent || '';
const q = (sel: string) => document.querySelector(sel) as HTMLElement | null;
const qa = (sel: string) => Array.from(document.querySelectorAll(sel)) as HTMLElement[];
const click = (el: Element | null | undefined) => {
  act(() => {
    el!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
};
function buttonByText(label: string) {
  return Array.from(document.querySelectorAll('button')).find((b) => b.textContent?.trim() === label);
}
function buttonContaining(label: string) {
  return Array.from(document.querySelectorAll('button')).find((b) => b.textContent?.includes(label));
}
// Desktop (table) e mobile (lista) renderizam os DOIS no jsdom ao mesmo tempo
// (só um "hidden"/"sm:hidden" via classe CSS, sem layout real) — contagens
// de checkbox usam sempre a árvore da tabela pra não duplicar.
function tableCheckboxes() {
  return Array.from(q('table')?.querySelectorAll('[role="checkbox"]') ?? []) as HTMLElement[];
}

function activeSub(id: string): Sub {
  return {
    id,
    status: 'active',
    value: 100,
    cycle: 'MONTHLY',
    billing_type: 'PIX',
    next_due_date: '2030-01-01',
    description: null,
    customers: { id: `cust-${id}`, name: `Cliente ${id}` },
  };
}
function cancelledSub(id: string): Sub {
  return { ...activeSub(id), status: 'cancelled' };
}

beforeEach(() => {
  vi.clearAllMocks();
  cancelMutateAsync.mockResolvedValue(undefined);
  bulkCancelMutateAsync.mockResolvedValue({ ok: 1, fail: 0 });
  subsState.list = [];
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  document.body.innerHTML = '';
});

describe('FinanceAssinaturas — canceladas ficam ocultas por padrão (raiz do bug relatado)', () => {
  it('com TODAS as assinaturas canceladas, mostra o vazio "sem ativas" (não o vazio genérico) e nenhum checkbox/ação', () => {
    subsState.list = [cancelledSub('a'), cancelledSub('b')];
    mount();

    // Vazio específico de "tudo cancelado", não o genérico de conta nova.
    expect(text()).toContain('Nenhuma assinatura ativa');
    expect(text()).not.toContain('Crie a primeira assinatura recorrente');

    // Zero elementos interativos de gestão na tela (o que o CEO via).
    expect(qa('[role="checkbox"]').length).toBe(0);
    expect(buttonByText('Editar')).toBeFalsy();
    expect(buttonByText('Cancelar')).toBeFalsy();

    // Mas o caminho pro histórico existe e é claro.
    const revealBtn = buttonContaining('Mostrar cancelada');
    expect(revealBtn).toBeTruthy();
    expect(revealBtn!.textContent).toContain('2');
  });

  it('revelar canceladas mostra as linhas, mas SEM nenhuma ação (não fazem sentido em algo já terminal)', () => {
    subsState.list = [cancelledSub('a')];
    mount();

    click(buttonContaining('Mostrar cancelada'));

    expect(text()).toContain('Cliente a');
    expect(buttonByText('Editar')).toBeFalsy();
    expect(buttonByText('Cancelar')).toBeFalsy();
    expect(qa('[role="checkbox"]').length).toBe(0);

    // E o toggle vira "ocultar".
    expect(buttonContaining('Ocultar canceladas')).toBeTruthy();
  });

  it('lista vazia de verdade (conta nova, zero assinaturas) usa o vazio genérico de sempre', () => {
    subsState.list = [];
    mount();
    expect(text()).toContain('Nenhuma assinatura');
    expect(text()).toContain('Crie a primeira assinatura recorrente');
    expect(buttonContaining('Mostrar cancelada')).toBeFalsy();
  });

  it('mix de ativa + cancelada: só a ativa aparece e tem ações por padrão', () => {
    subsState.list = [activeSub('live'), cancelledSub('dead')];
    mount();

    expect(text()).toContain('Cliente live');
    expect(text()).not.toContain('Cliente dead');
    expect(buttonByText('Editar')).toBeTruthy();
    expect(buttonByText('Cancelar')).toBeTruthy();
  });
});

describe('FinanceAssinaturas — seleção em lote não pega o que não é elegível', () => {
  it('o checkbox "selecionar todas" só existe e só marca a assinatura ativa, nunca a cancelada', () => {
    subsState.list = [activeSub('live'), cancelledSub('dead')];
    mount();

    // Só 1 checkbox de linha (a ativa) + 1 de cabeçalho = 2 no total.
    const boxes = tableCheckboxes();
    expect(boxes.length).toBe(2);

    const headerBox = boxes[0];
    click(headerBox);

    // A barra de ação em massa aparece contando 1 (só a elegível).
    expect(text()).toContain('Cancelar selecionadas (1)');
  });
});

describe('FinanceAssinaturas — cancelar individual exige confirmação', () => {
  it('clicar em Cancelar abre o alerta e NÃO chama a mutação antes de confirmar', () => {
    subsState.list = [activeSub('live')];
    mount();

    click(buttonByText('Cancelar'));
    expect(cancelMutateAsync).not.toHaveBeenCalled();
    expect(text()).toContain('Cancelar assinatura');

    const confirmBtn = buttonByText('Cancelar assinatura');
    click(confirmBtn);

    expect(cancelMutateAsync).toHaveBeenCalledWith({
      subscription_id: 'live',
      action: 'cancel',
    });
  });
});

describe('FinanceAssinaturas — cancelamento em massa exige confirmação', () => {
  it('selecionar e clicar em "Cancelar selecionadas" abre o alerta antes de disparar o bulk', () => {
    subsState.list = [activeSub('a'), activeSub('b')];
    mount();

    const boxes = tableCheckboxes();
    click(boxes[0]); // header: seleciona todas

    click(buttonContaining('Cancelar selecionadas'));
    expect(bulkCancelMutateAsync).not.toHaveBeenCalled();
    expect(text()).toContain('Cancelar 2 assinaturas?');

    click(buttonContaining('Cancelar 2'));
    expect(bulkCancelMutateAsync).toHaveBeenCalledWith(['a', 'b']);
  });
});
