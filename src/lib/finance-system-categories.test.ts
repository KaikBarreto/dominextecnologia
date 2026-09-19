import { describe, it, expect } from 'vitest';
import {
  canRenameCategory,
  findCategoryNameConflict,
  findSystemCategory,
  getSystemCategoryRole,
  planCategoryRename,
  resolveSystemCategoryName,
  sanitizeCategoryUpdate,
  SYSTEM_CATEGORY_ROLES,
  type SystemCategoryLike,
} from './finance-system-categories';

/**
 * ESTE é o teste que impede o bug de voltar: a amarração do lançamento
 * automático deixou de ser o NOME LITERAL ('Tarifas e Taxas') e passou a ser o
 * PAPEL da categoria. Renomear na tela não pode fazer o automático escrever o
 * nome antigo — e sem teste isso passa no typecheck e quebra em produção meses
 * depois, em silêncio, porque `financial_transactions.category` é texto livre.
 */

/**
 * Semente de empresa nova COMO ELA É EM PRODUÇÃO: as 6 do gatilho
 * `seed_system_financial_categories` MAIS 'Impostos e Taxas', que as edges
 * `create-company` / `self-register` inserem por cima, também com
 * `is_system = true` e também (saida, impostos). É essa colisão que faz a
 * resolução por trio, sozinha, ser ambígua.
 */
const seeded = (): SystemCategoryLike[] => [
  { id: 'c1', name: 'Tarifas e Taxas', type: 'saida', dre_group: 'impostos', is_system: true, is_active: true, sort_order: 0 },
  { id: 'c2', name: 'CSP - Materiais', type: 'saida', dre_group: 'cmv', is_system: true, is_active: true, sort_order: 1 },
  { id: 'c3', name: 'CSP - Mão de Obra Avulsa', type: 'saida', dre_group: 'cmv', is_system: true, is_active: true, sort_order: 2 },
  { id: 'c4', name: 'Vendas de Serviços', type: 'entrada', dre_group: 'opex', is_system: true, is_active: true, sort_order: 3 },
  { id: 'c5', name: 'Pagamento de Fatura', type: 'saida', dre_group: null, is_system: true, is_active: true, sort_order: 4 },
  { id: 'c6', name: 'Transferência entre contas', type: 'saida', dre_group: null, is_system: true, is_active: true, sort_order: 5 },
  { id: 'e1', name: 'Impostos e Taxas', type: 'saida', dre_group: 'impostos', is_system: true, is_active: true, sort_order: 6 },
];

describe('resolveSystemCategoryName — empresa que NUNCA renomeou', () => {
  it('tarifa devolve exatamente o nome de sempre', () => {
    expect(resolveSystemCategoryName(seeded(), 'receipt_fee')).toBe('Tarifas e Taxas');
  });

  it('receita de serviço devolve exatamente o nome de sempre', () => {
    expect(resolveSystemCategoryName(seeded(), 'service_revenue')).toBe('Vendas de Serviços');
  });

  it('a ordem em que o banco devolveu as linhas não muda o resultado', () => {
    const embaralhado = seeded().reverse();
    expect(resolveSystemCategoryName(embaralhado, 'receipt_fee')).toBe('Tarifas e Taxas');
    expect(resolveSystemCategoryName(embaralhado, 'service_revenue')).toBe('Vendas de Serviços');
  });

  it('as duas categorias de CSP (mesmo dre_group) não confundem nenhum papel', () => {
    const fee = findSystemCategory(seeded(), 'receipt_fee');
    const revenue = findSystemCategory(seeded(), 'service_revenue');
    expect(fee?.id).toBe('c1');
    expect(revenue?.id).toBe('c4');
  });
});

describe('resolveSystemCategoryName — DEPOIS de renomeada', () => {
  const renomeadas = (): SystemCategoryLike[] =>
    seeded().map((c) =>
      c.id === 'c1' ? { ...c, name: 'Taxas bancárias' }
      : c.id === 'c4' ? { ...c, name: 'Receita de serviços prestados' }
      : c,
    );

  it('acha a categoria de tarifa pelo papel, com o nome NOVO', () => {
    expect(resolveSystemCategoryName(renomeadas(), 'receipt_fee')).toBe('Taxas bancárias');
  });

  it('acha a categoria de receita pelo papel, com o nome NOVO', () => {
    expect(resolveSystemCategoryName(renomeadas(), 'service_revenue')).toBe('Receita de serviços prestados');
  });

  it('categoria criada pelo cliente com o nome ANTIGO não rouba o papel', () => {
    // Pior cenário: o cliente renomeou a de sistema e criou uma dele com o
    // nome antigo. O papel continua sendo da de sistema.
    const lista: SystemCategoryLike[] = [
      ...renomeadas(),
      { id: 'u1', name: 'Tarifas e Taxas', type: 'saida', dre_group: 'opex', is_system: false, is_active: true, sort_order: 9 },
    ];
    expect(resolveSystemCategoryName(lista, 'receipt_fee')).toBe('Taxas bancárias');
  });

  it('renomear NÃO muda o outro papel', () => {
    const soTarifa = seeded().map((c) => (c.id === 'c1' ? { ...c, name: 'Taxas bancárias' } : c));
    expect(resolveSystemCategoryName(soTarifa, 'service_revenue')).toBe('Vendas de Serviços');
  });
});

describe('resolveSystemCategoryName — estado torto e ausência', () => {
  it('empresa sem nenhuma categoria do papel cai no nome de semente (comportamento de antes)', () => {
    expect(resolveSystemCategoryName([], 'receipt_fee')).toBe(SYSTEM_CATEGORY_ROLES.receipt_fee.seedName);
    expect(resolveSystemCategoryName(null, 'service_revenue')).toBe(SYSTEM_CATEGORY_ROLES.service_revenue.seedName);
  });

  it('linha de sistema com dre_group perdido ainda é achada pelo nome de semente', () => {
    const torto: SystemCategoryLike[] = [
      { id: 'c1', name: 'Tarifas e Taxas', type: 'saida', dre_group: null, is_system: true, is_active: true },
    ];
    expect(findSystemCategory(torto, 'receipt_fee')?.id).toBe('c1');
  });

  it('linha que perdeu is_system ainda é achada pelo nome de semente', () => {
    const torto: SystemCategoryLike[] = [
      { id: 'c1', name: 'Vendas de Serviços', type: 'entrada', dre_group: 'opex', is_system: false, is_active: true },
    ];
    expect(resolveSystemCategoryName(torto, 'service_revenue')).toBe('Vendas de Serviços');
  });

  it('gêmea DESATIVADA não disputa o papel (dedup de categoria não trava a tela)', () => {
    const dupe: SystemCategoryLike[] = [
      { id: 'velha', name: 'Tarifas antigas', type: 'saida', dre_group: 'impostos', is_system: true, is_active: false, sort_order: 0 },
      { id: 'nova', name: 'Taxas bancárias', type: 'saida', dre_group: 'impostos', is_system: true, is_active: true, sort_order: 7 },
    ];
    expect(resolveSystemCategoryName(dupe, 'receipt_fee')).toBe('Taxas bancárias');
    expect(canRenameCategory(dupe, dupe[1])).toBe(true);
  });

  it('duas ATIVAS disputando: não adivinha, cai no nome de semente', () => {
    // Adivinhar aqui mandaria a tarifa pra categoria errada em silêncio. O
    // certo é repetir o comportamento de antes e manter o cadeado na tela.
    const dupe: SystemCategoryLike[] = [
      { id: 'b', name: 'Taxas B', type: 'saida', dre_group: 'impostos', is_system: true, is_active: true, sort_order: 5 },
      { id: 'a', name: 'Taxas A', type: 'saida', dre_group: 'impostos', is_system: true, is_active: true, sort_order: 2 },
    ];
    expect(findSystemCategory(dupe, 'receipt_fee')).toBeNull();
    expect(resolveSystemCategoryName(dupe, 'receipt_fee')).toBe('Tarifas e Taxas');
  });

  it('categoria do papel com nome só de espaços não devolve string vazia', () => {
    const vazia: SystemCategoryLike[] = [
      { id: 'c1', name: '   ', type: 'saida', dre_group: 'impostos', is_system: true, is_active: true },
    ];
    expect(resolveSystemCategoryName(vazia, 'receipt_fee')).toBe('Tarifas e Taxas');
  });
});

describe('getSystemCategoryRole', () => {
  it('reconhece os dois papéis e ignora o resto', () => {
    const cats = seeded();
    expect(getSystemCategoryRole(cats[0])).toBe('receipt_fee');
    expect(getSystemCategoryRole(cats[3])).toBe('service_revenue');
    expect(getSystemCategoryRole(cats[1])).toBeNull();
    expect(getSystemCategoryRole(cats[4])).toBeNull();
  });

  it('categoria do cliente nunca exerce papel, nem com o mesmo tipo e grupo', () => {
    expect(getSystemCategoryRole({
      id: 'u1', name: 'Impostos meus', type: 'saida', dre_group: 'impostos', is_system: false,
    })).toBeNull();
  });
});

describe('sanitizeCategoryUpdate — is_system trava tipo e grupo do DRE', () => {
  const patch = { name: 'Taxas bancárias', type: 'entrada', color: '#fff', icon: 'Tag', dre_group: 'opex' };

  it('categoria de sistema: nome, cor e ícone passam; type e dre_group são removidos', () => {
    const out = sanitizeCategoryUpdate(patch, true);
    expect(out.name).toBe('Taxas bancárias');
    expect(out.color).toBe('#fff');
    expect(out.icon).toBe('Tag');
    expect('type' in out).toBe(false);
    expect('dre_group' in out).toBe(false);
  });

  it('categoria do cliente continua podendo trocar tudo', () => {
    const out = sanitizeCategoryUpdate(patch, false);
    expect(out.type).toBe('entrada');
    expect(out.dre_group).toBe('opex');
  });

  it('não muta o objeto de entrada', () => {
    sanitizeCategoryUpdate(patch, true);
    expect(patch.type).toBe('entrada');
  });
});

describe('planCategoryRename — quando a cascata roda', () => {
  it('nome igual não cascateia', () => {
    expect(planCategoryRename('Tarifas e Taxas', 'Tarifas e Taxas').changed).toBe(false);
  });

  it('só espaço em volta não cascateia', () => {
    expect(planCategoryRename('Tarifas e Taxas', '  Tarifas e Taxas  ').changed).toBe(false);
  });

  it('nome diferente cascateia do antigo pro novo', () => {
    const plan = planCategoryRename('Tarifas e Taxas', ' Taxas bancárias ');
    expect(plan).toEqual({ changed: true, from: 'Tarifas e Taxas', to: 'Taxas bancárias' });
  });

  it('nome novo vazio não cascateia (não apaga a categoria do histórico)', () => {
    expect(planCategoryRename('Tarifas e Taxas', '   ').changed).toBe(false);
  });

  it('criação (sem nome anterior) não cascateia', () => {
    expect(planCategoryRename(undefined, 'Nova').changed).toBe(false);
  });

  it('diferença só de caixa É rename (o banco guarda o texto exato)', () => {
    expect(planCategoryRename('Tarifas e Taxas', 'TARIFAS E TAXAS').changed).toBe(true);
  });
});

describe('findCategoryNameConflict', () => {
  it('renomear pra um nome que já existe do mesmo lado é conflito', () => {
    const lista = [...seeded(), { id: 'u1', name: 'Taxas bancárias', type: 'saida', is_system: false, is_active: true }];
    expect(findCategoryNameConflict(lista, { id: 'c1', name: 'Taxas bancárias', type: 'saida' })?.id).toBe('u1');
  });

  it('ignora acentuação de caixa e espaço nas pontas', () => {
    const lista = [...seeded(), { id: 'u1', name: 'Taxas Bancárias', type: 'saida', is_system: false, is_active: true }];
    expect(findCategoryNameConflict(lista, { id: 'c1', name: '  taxas bancárias ', type: 'saida' })?.id).toBe('u1');
  });

  it('a própria categoria não conflita consigo mesma', () => {
    expect(findCategoryNameConflict(seeded(), { id: 'c1', name: 'Tarifas e Taxas', type: 'saida' })).toBeNull();
  });

  it('mesmo nome em lados opostos não é conflito', () => {
    const lista = [...seeded(), { id: 'u1', name: 'Bonificação', type: 'entrada', is_system: false, is_active: true }];
    expect(findCategoryNameConflict(lista, { id: 'u2', name: 'Bonificação', type: 'saida' })).toBeNull();
  });

  it('"ambos" conflita com os dois lados', () => {
    const lista = [...seeded(), { id: 'u1', name: 'Bonificação', type: 'entrada', is_system: false, is_active: true }];
    expect(findCategoryNameConflict(lista, { id: 'u2', name: 'Bonificação', type: 'ambos' })?.id).toBe('u1');
  });
});


/**
 * 🔴 A COLISÃO DE PRODUÇÃO, em teste dedicado.
 *
 * 'Impostos e Taxas' é `is_system = true`, `saida`, `impostos` — o MESMO trio
 * da categoria de tarifa. Sem excluí-la, renomear 'Tarifas e Taxas' faria a
 * tarifa do recebimento passar a cair em 'Impostos e Taxas', sem erro nenhum:
 * a despesa muda de linha do DRE e ninguém percebe.
 */
describe('colisão com "Impostos e Taxas" (semeada pelas edges)', () => {
  it('nunca é escolhida como categoria de tarifa, mesmo vindo antes na lista', () => {
    const cats = seeded();
    const soIntrusa = [cats.find((c) => c.id === 'e1')!, cats.find((c) => c.id === 'c1')!];
    expect(findSystemCategory(soIntrusa, 'receipt_fee')?.id).toBe('c1');
  });

  it('depois de renomear a tarifa, ela CONTINUA sem roubar o papel', () => {
    const renomeada = seeded().map((c) => (c.id === 'c1' ? { ...c, name: 'Taxas da maquininha' } : c));
    expect(resolveSystemCategoryName(renomeada, 'receipt_fee')).toBe('Taxas da maquininha');
  });

  it('mesmo com sort_order menor que o da tarifa, não ganha o desempate', () => {
    const invertido = seeded().map((c) =>
      c.id === 'e1' ? { ...c, sort_order: -1 } : c.id === 'c1' ? { ...c, name: 'Taxas', sort_order: 99 } : c,
    );
    expect(resolveSystemCategoryName(invertido, 'receipt_fee')).toBe('Taxas');
  });

  it('ela própria nunca é renomeável (é o que mantém a exclusão válida)', () => {
    const cats = seeded();
    expect(canRenameCategory(cats, cats.find((c) => c.id === 'e1'))).toBe(false);
  });
});

describe('canRenameCategory — quem a tela libera', () => {
  const cats = seeded();
  const byId = (id: string) => cats.find((c) => c.id === id);

  it('libera a categoria de tarifa e a de venda de serviço', () => {
    expect(canRenameCategory(cats, byId('c1'))).toBe(true);
    expect(canRenameCategory(cats, byId('c4'))).toBe(true);
  });

  it('mantém travadas as de sistema sem papel mapeado', () => {
    // Ainda são procuradas pelo literal, aqui ou dentro do banco.
    expect(canRenameCategory(cats, byId('c5'))).toBe(false); // Pagamento de Fatura
    expect(canRenameCategory(cats, byId('c6'))).toBe(false); // Transferência entre contas
    expect(canRenameCategory(cats, byId('c2'))).toBe(false); // CSP - Materiais
    expect(canRenameCategory(cats, byId('e1'))).toBe(false); // Impostos e Taxas
  });

  it('categoria criada pelo cliente é sempre renomeável', () => {
    const minha: SystemCategoryLike = {
      id: 'u1', name: 'Aluguel', type: 'saida', dre_group: 'opex', is_system: false, is_active: true,
    };
    expect(canRenameCategory([...cats, minha], minha)).toBe(true);
  });

  it('continua liberada DEPOIS de renomeada (o papel não se perde)', () => {
    const renomeada = cats.map((c) => (c.id === 'c1' ? { ...c, name: 'Taxas da maquininha' } : c));
    expect(canRenameCategory(renomeada, renomeada.find((c) => c.id === 'c1'))).toBe(true);
  });

  it('estado ambíguo (duas donas possíveis do papel) volta a travar a tela', () => {
    const ambiguo: SystemCategoryLike[] = [
      { id: 'a', name: 'Taxas A', type: 'saida', dre_group: 'impostos', is_system: true, is_active: true },
      { id: 'b', name: 'Taxas B', type: 'saida', dre_group: 'impostos', is_system: true, is_active: true },
    ];
    expect(canRenameCategory(ambiguo, ambiguo[0])).toBe(false);
    expect(canRenameCategory(ambiguo, ambiguo[1])).toBe(false);
    // E o lançamento cai no nome de semente, como antes — nunca adivinha.
    expect(resolveSystemCategoryName(ambiguo, 'receipt_fee')).toBe('Tarifas e Taxas');
  });
});
