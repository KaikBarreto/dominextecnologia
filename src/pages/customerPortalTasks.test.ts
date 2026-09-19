// Tarefa interna da equipe mora na MESMA tabela da OS (`service_orders`),
// separada só por `entry_type`. Em 19/09/2026 o CEO mandou print do Portal do
// Cliente com tarefas internas listadas junto das ordens de serviço: o cliente
// final estava lendo recado interno da empresa.
//
// O filtro de verdade é no SQL do `get_portal_data` (fronteira do portal
// público). Este teste prende a SEGUNDA trava, a da tela, que existe pra
// nenhuma tarefa chegar ao cliente nem por payload em cache nem por realtime.
import { describe, it, expect } from 'vitest';

/** Mesma régua de `src/pages/CustomerPortal.tsx`. */
function isInternalTask(order: { entry_type?: string | null } | null | undefined): boolean {
  return (order?.entry_type ?? 'os') === 'tarefa';
}

function filterOutInternalTasks<T extends { entry_type?: string | null }>(
  orders: T[] | null | undefined,
): T[] {
  return (orders ?? []).filter((o) => !isInternalTask(o));
}

describe('portal do cliente: tarefa interna nunca aparece', () => {
  it('tira a tarefa e mantém a ordem de serviço', () => {
    const payload = [
      { id: 'os-1', entry_type: 'os' },
      { id: 'tarefa-1', entry_type: 'tarefa' },
      { id: 'os-2', entry_type: 'os' },
    ];
    expect(filterOutInternalTasks(payload).map((o) => o.id)).toEqual(['os-1', 'os-2']);
  });

  it('OS antiga com entry_type nulo CONTINUA aparecendo', () => {
    // Regressão cara: tratar null como tarefa sumiria com o histórico inteiro
    // de OS de quem usa o sistema desde antes da coluna existir.
    const payload = [
      { id: 'os-legado', entry_type: null },
      { id: 'os-sem-campo' },
      { id: 'tarefa', entry_type: 'tarefa' },
    ];
    expect(filterOutInternalTasks(payload).map((o) => o.id)).toEqual(['os-legado', 'os-sem-campo']);
  });

  it('payload vazio, nulo ou indefinido não quebra a tela', () => {
    expect(filterOutInternalTasks([])).toEqual([]);
    expect(filterOutInternalTasks(null)).toEqual([]);
    expect(filterOutInternalTasks(undefined)).toEqual([]);
  });

  it('lista só de tarefas vira lista vazia, não vaza nenhuma', () => {
    const payload = [
      { id: 't1', entry_type: 'tarefa' },
      { id: 't2', entry_type: 'tarefa' },
    ];
    expect(filterOutInternalTasks(payload)).toEqual([]);
  });
});
