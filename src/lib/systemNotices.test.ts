import { describe, it, expect } from 'vitest';
import {
  filterVisibleNotices,
  isNoticeDismissed,
  isNoticeLive,
  isNoticeTargeted,
  type SystemNotice,
} from './systemNotices';

const VS = 'vs-project-company-id';
const OUTRA = 'outra-empresa-id';
const NOW = new Date('2026-10-18T12:00:00Z');

function notice(over: Partial<SystemNotice> = {}): SystemNotice {
  return {
    id: 'n1',
    title: 'Aviso',
    message: 'Corpo do aviso',
    variant: 'warning',
    scope: 'dashboard',
    is_dismissible: true,
    is_active: true,
    starts_at: null,
    ends_at: null,
    target_audience: 'all',
    target_ids: [],
    action_label: null,
    action_url: null,
    created_at: '2026-10-18T10:00:00Z',
    updated_at: '2026-10-18T10:00:00Z',
    ...over,
  };
}

const viewerVs = {
  userId: 'user-vs',
  companyId: VS,
  scope: 'dashboard' as const,
  dismissals: [],
  now: NOW,
};
const viewerOutra = { ...viewerVs, userId: 'user-outra', companyId: OUTRA };

// ───────────────────────────────────────────────────────────────────────────
// REGRA-LEI: aviso de uma empresa não vaza pra outra.
// ───────────────────────────────────────────────────────────────────────────
describe('direcionamento por empresa (não vaza entre tenants)', () => {
  const soVs = notice({
    id: 'so-vs',
    target_audience: 'specific_companies',
    target_ids: [VS],
  });

  it('a empresa alvo vê', () => {
    expect(filterVisibleNotices([soVs], viewerVs).map((n) => n.id)).toEqual(['so-vs']);
  });

  it('outra empresa NÃO vê', () => {
    expect(filterVisibleNotices([soVs], viewerOutra)).toEqual([]);
  });

  it('usuário sem empresa resolvida NÃO vê (fail closed)', () => {
    expect(filterVisibleNotices([soVs], { ...viewerVs, companyId: null })).toEqual([]);
  });

  it('alvo vazio não mostra pra ninguém', () => {
    const semAlvo = notice({ target_audience: 'specific_companies', target_ids: [] });
    expect(filterVisibleNotices([semAlvo], viewerVs)).toEqual([]);
    const alvoNulo = notice({ target_audience: 'specific_companies', target_ids: null });
    expect(filterVisibleNotices([alvoNulo], viewerVs)).toEqual([]);
  });

  it('público desconhecido (valor novo no banco) não mostra', () => {
    const futuro = notice({ target_audience: 'specific_segments' as never, target_ids: [VS] });
    expect(isNoticeTargeted(futuro, viewerVs)).toBe(false);
  });

  it('aviso para a base toda aparece pras duas empresas', () => {
    const todos = notice({ id: 'todos', target_audience: 'all' });
    expect(filterVisibleNotices([todos], viewerVs).map((n) => n.id)).toEqual(['todos']);
    expect(filterVisibleNotices([todos], viewerOutra).map((n) => n.id)).toEqual(['todos']);
  });

  it('direcionamento por usuário só pega o usuário listado', () => {
    const soUm = notice({ target_audience: 'specific_users', target_ids: ['user-vs'] });
    expect(isNoticeTargeted(soUm, viewerVs)).toBe(true);
    expect(isNoticeTargeted(soUm, viewerOutra)).toBe(false);
    expect(isNoticeTargeted(soUm, { userId: null, companyId: VS })).toBe(false);
  });

  it('com uma lista mista, a empresa alvo vê só o que é dela mais o global', () => {
    const lista = [
      notice({ id: 'so-vs', target_audience: 'specific_companies', target_ids: [VS] }),
      notice({ id: 'so-outra', target_audience: 'specific_companies', target_ids: [OUTRA] }),
      notice({ id: 'todos', target_audience: 'all' }),
    ];
    expect(filterVisibleNotices(lista, viewerVs).map((n) => n.id).sort()).toEqual(['so-vs', 'todos']);
    expect(filterVisibleNotices(lista, viewerOutra).map((n) => n.id).sort()).toEqual(['so-outra', 'todos']);
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('vigência', () => {
  it('inativo não aparece', () => {
    expect(isNoticeLive(notice({ is_active: false }), NOW)).toBe(false);
  });

  it('agendado pro futuro não aparece', () => {
    expect(isNoticeLive(notice({ starts_at: '2026-10-20T00:00:00Z' }), NOW)).toBe(false);
  });

  it('vencido não aparece', () => {
    expect(isNoticeLive(notice({ ends_at: '2026-10-17T00:00:00Z' }), NOW)).toBe(false);
  });

  it('dentro da janela aparece', () => {
    expect(
      isNoticeLive(notice({ starts_at: '2026-10-01T00:00:00Z', ends_at: '2026-10-31T00:00:00Z' }), NOW),
    ).toBe(true);
  });

  it('sem datas aparece (sem limite dos dois lados)', () => {
    expect(isNoticeLive(notice(), NOW)).toBe(true);
  });

  it('data inválida no banco não derruba a tela', () => {
    expect(isNoticeLive(notice({ starts_at: 'xx-xx' }), NOW)).toBe(true);
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('dispensa por usuário', () => {
  it('dispensado some', () => {
    const n = notice({ id: 'a' });
    expect(
      filterVisibleNotices([n], {
        ...viewerVs,
        dismissals: [{ notice_id: 'a', dismissed_at: '2026-10-18T11:00:00Z' }],
      }),
    ).toEqual([]);
  });

  it('dispensa de OUTRO aviso não esconde este', () => {
    const n = notice({ id: 'a' });
    expect(
      isNoticeDismissed(n, [{ notice_id: 'b', dismissed_at: '2026-10-18T11:00:00Z' }]),
    ).toBe(false);
  });

  it('aviso editado depois da dispensa volta a aparecer', () => {
    const n = notice({ id: 'a', updated_at: '2026-10-18T11:30:00Z' });
    expect(isNoticeDismissed(n, [{ notice_id: 'a', dismissed_at: '2026-10-18T11:00:00Z' }])).toBe(false);
  });

  it('aviso NÃO dispensável ignora a dispensa (nunca some)', () => {
    const n = notice({ id: 'a', is_dismissible: false });
    expect(isNoticeDismissed(n, [{ notice_id: 'a', dismissed_at: '2026-10-18T11:00:00Z' }])).toBe(false);
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('escopo de tela', () => {
  const soDashboard = notice({ id: 'dash', scope: 'dashboard' });
  const global = notice({ id: 'glob', scope: 'global' });

  // Escopo casa por IGUALDADE: o AppLayout já renderiza o `global` em todas as
  // telas, inclusive no painel inicial. Se o painel inicial aceitasse os dois,
  // o mesmo aviso apareceria duplicado ali.
  it('painel inicial mostra só o escopo dashboard', () => {
    expect(
      filterVisibleNotices([soDashboard, global], { ...viewerVs, scope: 'dashboard' }).map((n) => n.id),
    ).toEqual(['dash']);
  });

  it('demais telas mostram só o escopo global', () => {
    expect(
      filterVisibleNotices([soDashboard, global], { ...viewerVs, scope: 'global' }).map((n) => n.id),
    ).toEqual(['glob']);
  });
});

describe('ordenação', () => {
  it('mais recente primeiro', () => {
    const antigo = notice({ id: 'antigo', created_at: '2026-10-01T00:00:00Z' });
    const novo = notice({ id: 'novo', created_at: '2026-10-17T00:00:00Z' });
    expect(filterVisibleNotices([antigo, novo], viewerVs).map((n) => n.id)).toEqual(['novo', 'antigo']);
  });
});
