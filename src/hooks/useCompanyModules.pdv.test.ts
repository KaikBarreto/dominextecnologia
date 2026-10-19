// ─────────────────────────────────────────────────────────────────────────────
// Guarda do GATE COMERCIAL do módulo PDV e Loja (add-on pago `pdv`).
//
// POR QUE ESTE TESTE EXISTE: em `useCompanyModules.hasScreen`, tela que NÃO está
// em `SCREEN_TO_MODULE_MAP` é LIBERADA por padrão (`if (!moduleCode) return true`).
// Então a falha silenciosa do PDV não é "esqueci de gatear" — é "criei a tela
// nova, registrei a permissão, e esqueci o mapa": a tela paga nasce aberta pra
// quem não contratou, sem erro nenhum em lugar nenhum.
//
// O teste trava os dois lados do contrato:
//   catálogo de permissões (screen:pdv*)  ⇄  SCREEN_TO_MODULE_MAP → 'pdv'
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest';
import { SCREEN_TO_MODULE_MAP } from '@/hooks/useCompanyModules';
import { SCREEN_PERMISSIONS } from '@/hooks/usePermissions';
import { localizedTemplatesFor } from '@/lib/i18n/appRouteSlugs';

const PDV_SCREEN_KEYS = [
  'screen:pdv',
  'screen:pdv_orders',
  'screen:pdv_dispatch',
  'screen:pdv_cash_history',
  'screen:pdv_reports',
  'screen:pdv_settings',
] as const;

describe('gate do módulo PDV e Loja', () => {
  it('toda tela screen:pdv* do catálogo está mapeada pro módulo pdv', () => {
    const doCatalogo = SCREEN_PERMISSIONS
      .map((s) => s.key as string)
      .filter((k) => k === 'screen:pdv' || k.startsWith('screen:pdv_'));

    // Nenhuma tela do PDV pode ficar fora do mapa (ficaria liberada por default).
    const semGate = doCatalogo.filter((k) => SCREEN_TO_MODULE_MAP[k] !== 'pdv');
    expect(semGate).toEqual([]);

    // E o catálogo tem que cobrir as 6 telas previstas (as 2 do modo balcão
    // ainda não têm rota — Onda 2 —, mas a permissão já existe).
    expect(doCatalogo.slice().sort()).toEqual([...PDV_SCREEN_KEYS].slice().sort());
  });

  it('nenhuma tela do PDV aponta pra outro módulo', () => {
    for (const key of PDV_SCREEN_KEYS) {
      expect(SCREEN_TO_MODULE_MAP[key]).toBe('pdv');
    }
  });

  it('as 4 telas da Onda 1 têm rota registrada, e as do modo balcão não', () => {
    expect(localizedTemplatesFor('pdv')).toContain('/pdv');
    expect(localizedTemplatesFor('pdvCashHistory')).toContain('/pdv/caixas');
    expect(localizedTemplatesFor('pdvReports')).toContain('/pdv/relatorios');
    expect(localizedTemplatesFor('pdvSettings')).toContain('/pdv/configuracoes');

    // Onda 2 (modo balcão): sem tela, sem rota. Se alguém registrar a rota sem
    // criar a tela, este teste cai e lembra de fazer os dois juntos.
    expect(localizedTemplatesFor('pdvOrders')).toEqual([]);
    expect(localizedTemplatesFor('pdvDispatch')).toEqual([]);
  });

  it('a rota do PDV responde também no slug traduzido', () => {
    expect(localizedTemplatesFor('pdv')).toContain('/pos');
  });
});
