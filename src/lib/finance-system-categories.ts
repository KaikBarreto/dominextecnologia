/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Categorias de SISTEMA resolvidas por PAPEL, nunca por nome literal.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * PROBLEMA QUE ISTO RESOLVE
 * O lançamento automático escrevia a categoria pelo NOME LITERAL
 * (`category: 'Tarifas e Taxas'`). `financial_transactions.category` é `text`,
 * NÃO é chave estrangeira — a transação guarda uma CÓPIA do nome. Com o nome
 * chumbado no código, renomear a categoria na tela de Categorias fazia o
 * automático continuar escrevendo o nome antigo: lançamento órfão, sem cor,
 * sem ícone e fora do grupo do DRE, em silêncio.
 *
 * DESENHO
 * A amarração passa a ser o PAPEL da categoria, derivado de dados que já
 * existem na tabela e que a tela mantém TRAVADOS para categoria de sistema:
 * `is_system` + `type` + `dre_group`. O nome deixa de ser identidade e volta a
 * ser o que sempre deveria ter sido: rótulo editável.
 *
 * O código pergunta "qual é a categoria de tarifa desta empresa?" e usa o
 * `name` que estiver gravado nela NAQUELE momento.
 *
 * POR QUE `is_system` + `type` + `dre_group` é determinístico
 * A semente de empresa nova (`seed_system_financial_categories`) cria SEIS
 * categorias de sistema, e o par (type, dre_group) só repete no grupo `cmv`:
 *
 *   Tarifas e Taxas            saida    impostos   ← papel `receipt_fee`
 *   CSP - Materiais            saida    cmv
 *   CSP - Mão de Obra Avulsa   saida    cmv
 *   Vendas de Serviços         entrada  opex       ← papel `service_revenue`
 *   Pagamento de Fatura        saida    (null)
 *   Transferência entre contas saida    (null)
 *
 * Nenhum dos dois papéis mapeados aqui cai no par ambíguo. Categoria criada
 * pelo cliente nasce com `is_system = false` (o insert do hook nunca manda o
 * campo, o default do banco é false), então não entra na disputa.
 *
 * 🔴 A COLISÃO REAL QUE EXISTE EM PRODUÇÃO
 * As edges `create-company` e `self-register` semeiam, por cima do gatilho,
 * mais uma categoria com `is_system = true`:
 *
 *   Impostos e Taxas           saida    impostos   ← NÃO é papel nenhum
 *
 * Ou seja: (saida, impostos, is_system) tem DUAS linhas em praticamente toda
 * empresa. Por isso o papel `receipt_fee` não pode ser resolvido só pelo trio
 * — a lista de nomes de semente que NÃO exercem papel
 * (`FOREIGN_SYSTEM_SEED_NAMES`) é excluída antes do desempate, e a resolução
 * por papel só vale quando sobra EXATAMENTE UMA candidata.
 *
 * Essa lista se mantém estável porque `canRenameCategory` só libera o nome da
 * linha que é dona única de um papel: 'Impostos e Taxas' nunca fica editável,
 * logo o nome dela nunca deriva.
 *
 * SE FICAR AMBÍGUO (2+ candidatas) a busca cai pro nome de semente, que é
 * exatamente o que o código fazia antes — e a tela mantém o cadeado. Estado
 * desconhecido nunca vira escrita errada em silêncio.
 *
 * MESMO ASSIM a busca é em CAMADAS, e o desempate é determinístico: empresa
 * antiga pode ter estado torto (linha duplicada, `dre_group` que derivou antes
 * da trava). Empresa que nunca renomeou cai sempre na mesma linha de sempre e
 * não vê diferença nenhuma.
 */

export type SystemCategoryRole = 'receipt_fee' | 'service_revenue';

export interface SystemCategoryRoleSpec {
  role: SystemCategoryRole;
  /**
   * Nome com que a categoria NASCE na semente. Não é identidade: serve só como
   * desempate entre candidatas e como último recurso quando a empresa não tem
   * nenhuma categoria do papel.
   */
  seedName: string;
  type: 'entrada' | 'saida';
  dreGroup: string;
}

export const SYSTEM_CATEGORY_ROLES: Record<SystemCategoryRole, SystemCategoryRoleSpec> = {
  /** Despesa da tarifa de recebimento (maquininha, Asaas, boleto). */
  receipt_fee: {
    role: 'receipt_fee',
    seedName: 'Tarifas e Taxas',
    type: 'saida',
    dreGroup: 'impostos',
  },
  /** Receita gerada pela aprovação de orçamento. */
  service_revenue: {
    role: 'service_revenue',
    seedName: 'Vendas de Serviços',
    type: 'entrada',
    dreGroup: 'opex',
  },
};

/**
 * Nomes de categoria de SISTEMA que existem no cadastro e NÃO exercem papel
 * nenhum. Ficam de fora da resolução por papel pra não roubar a vaga da
 * categoria certa, e continuam travadas na tela (o nome delas nunca muda, é o
 * que mantém esta lista válida).
 *
 *  • 'Impostos e Taxas'          — semeada pelas edges create-company /
 *                                  self-register com is_system = true, mesmo
 *                                  (saida, impostos) da categoria de tarifa;
 *  • 'Pagamento de Fatura'       — o código ainda compara pelo literal
 *  • 'Transferência entre contas'  (FinanceDRE, useFinancialAccounts,
 *                                  useRelatedTransactions). Renomear quebraria.
 *  • 'CSP - ...' / 'CMV - ...'   — linhas de custo, sem papel mapeado.
 *  • 'Folha de Pagamento'        — criada e procurada POR NOME dentro do banco
 *                                  (generate_payroll_for_employee). Renomear
 *                                  faria o banco criar outra na próxima folha.
 */
export const FOREIGN_SYSTEM_SEED_NAMES: readonly string[] = [
  'Impostos e Taxas',
  'Folha de Pagamento',
  'Pagamento de Fatura',
  'Transferência entre contas',
  'CSP - Materiais',
  'CSP - Mão de Obra Avulsa',
  'CMV - Materiais',
  'CMV - Mão de Obra Avulsa',
];

/** Só o que a resolução precisa ler. Compatível com `FinancialCategory`. */
export interface SystemCategoryLike {
  id?: string;
  name: string;
  type: string;
  dre_group?: string | null;
  is_system?: boolean | null;
  is_active?: boolean | null;
  sort_order?: number | null;
}

const norm = (value: string | null | undefined): string =>
  (value ?? '').trim().toLocaleLowerCase('pt-BR');

/** `is_active` ausente conta como ativa (linha antiga, select parcial). */
const isActive = (cat: SystemCategoryLike): boolean => cat.is_active !== false;

/**
 * Desempate entre candidatas do mesmo papel, na ordem: ativa primeiro, nome de
 * semente primeiro, menor `sort_order`, nome em ordem alfabética. Totalmente
 * determinístico — nunca depende da ordem em que o banco devolveu as linhas.
 */
function compareCandidates(
  a: SystemCategoryLike,
  b: SystemCategoryLike,
  spec: SystemCategoryRoleSpec,
): number {
  const byActive = Number(isActive(b)) - Number(isActive(a));
  if (byActive !== 0) return byActive;

  const seed = norm(spec.seedName);
  const bySeedName = Number(norm(b.name) === seed) - Number(norm(a.name) === seed);
  if (bySeedName !== 0) return bySeedName;

  const bySortOrder =
    (a.sort_order ?? Number.MAX_SAFE_INTEGER) - (b.sort_order ?? Number.MAX_SAFE_INTEGER);
  if (bySortOrder !== 0) return bySortOrder;

  return (a.name ?? '').localeCompare(b.name ?? '', 'pt-BR');
}

/** Nome que pertence a outra categoria de sistema, e por isso nunca é o papel. */
function isForeignName(name: string, spec: SystemCategoryRoleSpec): boolean {
  const n = norm(name);
  if (FOREIGN_SYSTEM_SEED_NAMES.some((foreign) => norm(foreign) === n)) return true;
  return (Object.keys(SYSTEM_CATEGORY_ROLES) as SystemCategoryRole[]).some(
    (other) => other !== spec.role && norm(SYSTEM_CATEGORY_ROLES[other].seedName) === n,
  );
}

/**
 * Candidatas ao papel pelo TRIO (is_system + type + dre_group), já sem os
 * nomes que sabidamente pertencem a outra categoria de sistema. Exportado
 * porque a tela usa o mesmo cálculo pra decidir se libera o rename.
 *
 * Só linha ATIVA disputa: a gêmea desativada (o que a migration de dedup das
 * categorias CSP fez com as duplicatas) está fora de jogo e não pode tornar o
 * papel "ambíguo" — senão uma limpeza de dado teria travado a tela de novo.
 */
export function findRoleCandidates<T extends SystemCategoryLike>(
  categories: readonly T[] | null | undefined,
  role: SystemCategoryRole,
): T[] {
  const spec = SYSTEM_CATEGORY_ROLES[role];
  return (categories ?? [])
    .filter(
      (cat) =>
        cat.is_system === true &&
        isActive(cat) &&
        cat.type === spec.type &&
        norm(cat.dre_group) === norm(spec.dreGroup) &&
        !isForeignName(cat.name, spec),
    )
    .sort((a, b) => compareCandidates(a, b, spec));
}

/**
 * A categoria que exerce o papel nesta empresa, ou `null` se não existir.
 *
 * Camadas, da mais forte pra mais tolerante:
 *  1. dona ÚNICA do papel (trio, sem nome de outra categoria de sistema);
 *  2. linha de sistema cujo `dre_group` derivou, reconhecida pelo nome de semente;
 *  3. qualquer categoria com o nome de semente (empresa que perdeu `is_system`).
 *
 * Camada 1 exige unicidade de propósito: com 2+ candidatas o estado é
 * desconhecido, e adivinhar mandaria o lançamento pra categoria errada em
 * silêncio. Nesse caso cai no nome de semente, que é o comportamento de antes.
 */
export function findSystemCategory<T extends SystemCategoryLike>(
  categories: readonly T[] | null | undefined,
  role: SystemCategoryRole,
): T | null {
  const spec = SYSTEM_CATEGORY_ROLES[role];
  const list = categories ?? [];
  const seed = norm(spec.seedName);

  const byRole = findRoleCandidates(list, role);
  if (byRole.length === 1) return byRole[0];

  const fallbacks: Array<(cat: T) => boolean> = [
    (cat) => cat.is_system === true && cat.type === spec.type && norm(cat.name) === seed,
    (cat) => norm(cat.name) === seed,
  ];
  for (const matches of fallbacks) {
    const found = list.filter(matches).sort((a, b) => compareCandidates(a, b, spec));
    if (found.length > 0) return found[0];
  }
  return null;
}

/**
 * A categoria pode ter o NOME editado?
 *
 * Categoria do cliente: sempre. Categoria de sistema: só quando ela é a dona
 * ÚNICA de um papel mapeado — aí o lançamento automático a encontra pelo papel
 * e o nome virou só rótulo. Todas as outras de sistema seguem travadas, porque
 * o código (aqui ou no banco) ainda as procura pelo literal.
 */
export function canRenameCategory(
  categories: readonly SystemCategoryLike[] | null | undefined,
  cat: SystemCategoryLike | null | undefined,
): boolean {
  if (!cat) return false;
  if (cat.is_system !== true) return true;
  if (!cat.id) return false;
  return (Object.keys(SYSTEM_CATEGORY_ROLES) as SystemCategoryRole[]).some((role) => {
    const candidates = findRoleCandidates(categories, role);
    return candidates.length === 1 && candidates[0].id === cat.id;
  });
}

/**
 * O NOME que o lançamento automático deve gravar agora.
 *
 * Fallback quando a empresa não tem nenhuma categoria do papel (empresa muito
 * antiga, ou categoria apagada à mão antes da trava de sistema): devolve o nome
 * de semente, que é EXATAMENTE o que o código gravava antes desta mudança.
 * Escolha deliberada — o lançamento financeiro nunca falha nem fica sem
 * categoria por causa de cadastro faltando, e nada é criado em silêncio
 * (gravar este texto NÃO cria categoria: `financial_transactions.category` é
 * texto livre, não FK).
 */
export function resolveSystemCategoryName(
  categories: readonly SystemCategoryLike[] | null | undefined,
  role: SystemCategoryRole,
): string {
  const found = findSystemCategory(categories, role);
  const name = found?.name?.trim();
  return name && name.length > 0 ? name : SYSTEM_CATEGORY_ROLES[role].seedName;
}

/**
 * Papel exercido por uma categoria, ou `null` se ela não exerce nenhum.
 * Usa a MESMA régua da resolução (inclusive a exclusão de nome de outra
 * categoria de sistema), pra tela e lançamento nunca discordarem.
 */
export function getSystemCategoryRole(
  cat: SystemCategoryLike | null | undefined,
): SystemCategoryRole | null {
  if (!cat || cat.is_system !== true) return null;
  for (const role of Object.keys(SYSTEM_CATEGORY_ROLES) as SystemCategoryRole[]) {
    const spec = SYSTEM_CATEGORY_ROLES[role];
    if (
      cat.type === spec.type &&
      norm(cat.dre_group) === norm(spec.dreGroup) &&
      !isForeignName(cat.name, spec)
    ) {
      return role;
    }
  }
  return null;
}

/**
 * Campos que a categoria de SISTEMA nunca pode trocar pela tela.
 *
 * `type` e `dre_group` são a identidade do papel e a classificação no DRE:
 * mudar o lado (entrada/saída) ou o grupo arrancaria a categoria do papel E
 * moveria a linha inteira de lugar no resultado. Nome, cor e ícone são rótulo
 * e podem ser editados à vontade.
 */
export const SYSTEM_CATEGORY_LOCKED_FIELDS = ['type', 'dre_group'] as const;

/** Tira do patch os campos travados quando a categoria é de sistema. */
export function sanitizeCategoryUpdate<T extends Record<string, unknown>>(
  input: T,
  isSystem: boolean,
): Partial<T> {
  if (!isSystem) return { ...input };
  const out: Record<string, unknown> = { ...input };
  for (const field of SYSTEM_CATEGORY_LOCKED_FIELDS) delete out[field];
  return out as Partial<T>;
}

export interface CategoryRenamePlan {
  /** `true` quando o nome mudou de verdade e a cascata precisa rodar. */
  changed: boolean;
  from: string;
  to: string;
}

/**
 * Decide se um UPDATE de categoria é um RENAME que precisa de cascata.
 *
 * A cascata existe porque `financial_transactions.category` guarda o nome
 * COPIADO: renomear só a categoria orfanaria todo o histórico dela (perderia
 * grupo do DRE, cor e ícone, em silêncio). É a mesma régua da migration
 * `20260919150000_categorias_cmv_viram_csp.sql`, que renomeou as duas pontas
 * na mesma transação.
 */
export function planCategoryRename(
  oldName: string | null | undefined,
  newName: string | null | undefined,
): CategoryRenamePlan {
  const from = (oldName ?? '').trim();
  const to = (newName ?? '').trim();
  return { changed: from.length > 0 && to.length > 0 && from !== to, from, to };
}

/**
 * Outra categoria que já usa este nome do MESMO lado (entrada/saída/ambos).
 *
 * Não existe índice único em (company_id, name): sem esta trava, renomear
 * criaria duas categorias visualmente idênticas na lista e a cascata juntaria
 * histórico de duas origens diferentes num nome só, sem volta.
 */
export function findCategoryNameConflict<T extends SystemCategoryLike>(
  categories: readonly T[] | null | undefined,
  candidate: { id?: string; name: string; type: string },
): T | null {
  const name = norm(candidate.name);
  if (!name) return null;
  const overlaps = (other: string) =>
    other === candidate.type || other === 'ambos' || candidate.type === 'ambos';
  return (
    (categories ?? []).find(
      (cat) => cat.id !== candidate.id && norm(cat.name) === name && overlaps(cat.type),
    ) ?? null
  );
}
