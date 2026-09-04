import { describe, it, expect } from 'vitest';

import {
  normalizePermissionText,
  permissionTextMatches,
  permissionItemMatches,
  filterPermissionTree,
  filterPermissionActions,
  type PermissionSearchGroup,
} from './permissionSearch';
import { SCREEN_PERMISSIONS, FUNCTION_PERMISSIONS, getFunctionsByScreen, getOrphanFunctions } from '@/hooks/usePermissions';

// Árvore de teste enxuta (2 telas), pra as regras ficarem legíveis.
const TREE: PermissionSearchGroup[] = [
  {
    screen: { key: 'screen:service_orders', label: 'Ordens de Serviço', description: 'Lista completa de OS.' },
    actions: [
      { key: 'fn:create_os', label: 'Criar OS', description: 'Criar novas ordens de serviço' },
      { key: 'fn:reopen_os', label: 'Reabrir OS', description: 'Reabrir ordens concluídas' },
    ],
  },
  {
    screen: { key: 'screen:finance', label: 'Financeiro', description: 'Contas a pagar e receber.' },
    actions: [
      { key: 'fn:delete_finance', label: 'Excluir Lançamento Financeiro', description: 'Excluir transações' },
    ],
  },
];

describe('normalizePermissionText', () => {
  it('tira acento, maiúscula e espaço sobrando', () => {
    expect(normalizePermissionText('  Ordens   de   SERVIÇO ')).toBe('ordens de servico');
    expect(normalizePermissionText('Área do Técnico™')).toBe('area do tecnico™');
  });

  it('devolve string vazia pra null/undefined', () => {
    expect(normalizePermissionText(null)).toBe('');
    expect(normalizePermissionText(undefined)).toBe('');
  });
});

describe('permissionTextMatches', () => {
  it('ignora acento e caixa', () => {
    expect(permissionTextMatches('Orçamentos', 'orcamento')).toBe(true);
    expect(permissionTextMatches('Orçamentos', 'ORÇA')).toBe(true);
  });

  it('ignora espaço', () => {
    expect(permissionTextMatches('Ordens de Serviço', 'ordensdeservico')).toBe(true);
  });

  it('busca vazia casa com tudo', () => {
    expect(permissionTextMatches('qualquer coisa', '')).toBe(true);
    expect(permissionTextMatches('qualquer coisa', '   ')).toBe(true);
  });

  it('texto vazio não casa com busca preenchida', () => {
    expect(permissionTextMatches('', 'os')).toBe(false);
    expect(permissionTextMatches(undefined, 'os')).toBe(false);
  });

  it('não casa quando o termo não existe', () => {
    expect(permissionTextMatches('Financeiro', 'estoque')).toBe(false);
  });
});

describe('permissionItemMatches', () => {
  it('casa pelo rótulo OU pela descrição', () => {
    const item = { key: 'screen:finance', label: 'Financeiro', description: 'Contas a pagar e receber.' };
    expect(permissionItemMatches(item, 'financ')).toBe(true);
    expect(permissionItemMatches(item, 'receber')).toBe(true);
    expect(permissionItemMatches(item, 'domiflix')).toBe(false);
  });
});

describe('filterPermissionTree', () => {
  it('busca vazia devolve a árvore inteira (mesma referência)', () => {
    expect(filterPermissionTree(TREE, '')).toBe(TREE);
    expect(filterPermissionTree(TREE, '   ')).toBe(TREE);
  });

  it('tela que casa mantém TODAS as ações dela', () => {
    const out = filterPermissionTree(TREE, 'ordens de servico');
    expect(out).toHaveLength(1);
    expect(out[0].screen.key).toBe('screen:service_orders');
    expect(out[0].actions.map(a => a.key)).toEqual(['fn:create_os', 'fn:reopen_os']);
    // não clona: a mesma referência de grupo volta
    expect(out[0]).toBe(TREE[0]);
  });

  it('tela casa pela DESCRIÇÃO e ainda leva todas as ações', () => {
    const out = filterPermissionTree(TREE, 'lista completa');
    expect(out).toHaveLength(1);
    expect(out[0].actions).toHaveLength(2);
  });

  it('só a ação-filha casando mantém a tela com SÓ aquela ação', () => {
    const out = filterPermissionTree(TREE, 'reabrir');
    expect(out).toHaveLength(1);
    expect(out[0].screen.key).toBe('screen:service_orders');
    expect(out[0].actions.map(a => a.key)).toEqual(['fn:reopen_os']);
  });

  it('nada casou devolve lista vazia', () => {
    expect(filterPermissionTree(TREE, 'domiflix')).toEqual([]);
  });

  it('pode devolver mais de uma tela', () => {
    // "os" aparece em "Ordens de Serviço" e em "transações" (transacOeS? não) —
    // usar um termo que casa nas duas telas de propósito.
    const out = filterPermissionTree(TREE, 'r');
    expect(out.length).toBe(2);
  });
});

describe('filterPermissionActions (bloco Geral)', () => {
  const orphans = [
    { key: 'fn:x', label: 'Ação Solta', description: 'sem tela pai' },
    { key: 'fn:y', label: 'Outra', description: 'nada a ver' },
  ];

  it('busca vazia devolve tudo', () => {
    expect(filterPermissionActions(orphans, '')).toBe(orphans);
  });

  it('filtra por rótulo ou descrição', () => {
    expect(filterPermissionActions(orphans, 'solta').map(a => a.key)).toEqual(['fn:x']);
    expect(filterPermissionActions(orphans, 'sem tela').map(a => a.key)).toEqual(['fn:x']);
  });
});

// ── Contrato do catálogo (o acordeão depende disso) ─────────────────────────
describe('catálogo de permissões', () => {
  it('toda tela tem descrição não vazia', () => {
    const semDescricao = SCREEN_PERMISSIONS.filter(s => !s.description?.trim());
    expect(semDescricao.map(s => s.key)).toEqual([]);
  });

  it('todo relatedScreen aponta pra uma tela existente', () => {
    const keys = new Set<string>(SCREEN_PERMISSIONS.map(s => s.key));
    const quebradas = FUNCTION_PERMISSIONS.filter(f => f.relatedScreen && !keys.has(f.relatedScreen));
    expect(quebradas.map(f => f.key)).toEqual([]);
  });

  it('nenhuma ação fica órfã hoje e toda ação aparece exatamente uma vez na árvore', () => {
    expect(getOrphanFunctions()).toEqual([]);
    const naArvore = SCREEN_PERMISSIONS.flatMap(s => getFunctionsByScreen(s.key)).map(f => f.key);
    expect(naArvore.slice().sort()).toEqual(FUNCTION_PERMISSIONS.map(f => f.key).slice().sort());
  });
});
