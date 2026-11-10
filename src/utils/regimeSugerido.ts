/**
 * Tradução dos sinais tributários da consulta de CNPJ para os literais que o
 * select de "Regime tributário" de Configurações Fiscais aceita.
 *
 * ⚠️ Os literais aqui são os MESMOS de `ImpostosSection.tsx` (`simples_nacional`,
 * `lucro_presumido`, `lucro_real`, `mei`) e vão parar no provedor de emissão
 * (`nfse-register-company`). Literal inventado = empresa registrada com regime
 * errado. Se o select mudar, muda aqui também.
 *
 * O que a consulta de CNPJ devolve e como interpretamos:
 *
 * • `opcao_pelo_simples` e `opcao_pelo_mei` são TRI-STATE: `true`, `false` ou
 *   `null`. `null` significa "a Receita não informa" — NUNCA "não é". Por isso
 *   só agimos em `=== true`.
 * • `regime_tributario` é um ARRAY por ano de escrituração (ECF), com
 *   `forma_de_tributacao` em texto livre ("LUCRO REAL", "LUCRO PRESUMIDO",
 *   "ISENTO DO IRPJ", "IMUNE DE IRPJ"). Pegamos o item de MAIOR `ano` — a
 *   ordem do array não é garantida, então `array[length - 1]` está errado.
 * • "ISENTO DO IRPJ" e "IMUNE DE IRPJ" não têm equivalente no select: não
 *   sugerimos nada nesses casos (melhor campo vazio que regime errado).
 *
 * A escrituração mais recente disponível hoje é de 2024, ou seja, a sugestão
 * pode estar desatualizada. Daí `ano` fazer parte do resultado: toda sugestão
 * mostrada na tela precisa citar a procedência.
 */

/** Literais aceitos pelo select de regime em Configurações Fiscais. */
export type RegimeLiteral = 'simples_nacional' | 'lucro_presumido' | 'lucro_real' | 'mei';

export interface RegimeSugestao {
  regime: RegimeLiteral;
  /** De onde veio: enquadramento MEI, opção pelo Simples ou escrituração (ECF). */
  fonte: 'mei' | 'simples' | 'ecf';
  /** Ano da procedência (opção/escrituração). `null` quando a base não informa. */
  ano: number | null;
}

export interface SinaisTributarios {
  /** `opcao_pelo_simples` — tri-state. */
  optanteSimples?: boolean | null;
  /** `opcao_pelo_mei` — tri-state. */
  optanteMei?: boolean | null;
  /** Ano da opção pelo Simples, quando informado. */
  anoOpcaoSimples?: number | null;
  /** Ano da opção pelo MEI, quando informado. */
  anoOpcaoMei?: number | null;
  /** Item de MAIOR ano do array `regime_tributario` (ECF). */
  regimeEcf?: { ano: number | null; formaDeTributacao: string } | null;
}

/** `forma_de_tributacao` (ECF) → literal do select. `null` = sem equivalente. */
function regimeDaEcf(forma: string): RegimeLiteral | null {
  const texto = forma
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toUpperCase();
  if (!texto) return null;
  if (texto.includes('LUCRO REAL')) return 'lucro_real';
  if (texto.includes('LUCRO PRESUMIDO')) return 'lucro_presumido';
  if (texto.includes('LUCRO ARBITRADO')) return null; // sem equivalente no select
  // ISENTO / IMUNE DE IRPJ e qualquer texto novo: não sugerimos.
  return null;
}

/**
 * Item de MAIOR `ano` do array `regime_tributario`. A ordem do array não é
 * garantida, então nunca usamos o último elemento.
 */
export function regimeEcfMaisRecente(
  lista: unknown,
): { ano: number | null; formaDeTributacao: string } | null {
  if (!Array.isArray(lista)) return null;
  let melhor: { ano: number | null; formaDeTributacao: string } | null = null;
  for (const item of lista as Array<Record<string, unknown>>) {
    if (!item || typeof item !== 'object') continue;
    const forma = typeof item.forma_de_tributacao === 'string' ? item.forma_de_tributacao : '';
    if (!forma.trim()) continue;
    const anoNum = Number(item.ano);
    const ano = Number.isFinite(anoNum) ? anoNum : null;
    if (!melhor) {
      melhor = { ano, formaDeTributacao: forma };
      continue;
    }
    if (ano != null && (melhor.ano == null || ano > melhor.ano)) {
      melhor = { ano, formaDeTributacao: forma };
    }
  }
  return melhor;
}

/**
 * Regime sugerido para a PRÓPRIA empresa, ou `null` quando os sinais não
 * permitem afirmar nada. Precedência: MEI → Simples Nacional → escrituração.
 * MEI vem antes porque todo MEI também é optante do Simples, e o select tem a
 * opção específica.
 */
export function sugerirRegime(sinais: SinaisTributarios): RegimeSugestao | null {
  if (sinais.optanteMei === true) {
    return { regime: 'mei', fonte: 'mei', ano: sinais.anoOpcaoMei ?? null };
  }
  if (sinais.optanteSimples === true) {
    return { regime: 'simples_nacional', fonte: 'simples', ano: sinais.anoOpcaoSimples ?? null };
  }
  const ecf = sinais.regimeEcf;
  if (ecf) {
    const regime = regimeDaEcf(ecf.formaDeTributacao);
    if (regime) return { regime, fonte: 'ecf', ano: ecf.ano };
  }
  return null;
}
