/**
 * Consulta de INSCRIÇÃO ESTADUAL por CNPJ (origem: Sintegra/SEFAZ, exposta pela
 * API pública `publica.cnpj.ws`).
 *
 * ⚠️ ESPELHO: a cópia vive em `EcoSistemaSaaS/src/utils/consultaIe.ts`. Dois
 * arquivos, UM critério — mudar um sem o outro é defeito, não divergência
 * aceitável. Mesma convenção do par `resolveIndicadorIeEfetivo` × a régua da
 * edge de emissão: duas implementações, um critério, documentado nos dois lados.
 *
 * ⚠️ ARQUIVO AUTOCONTIDO DE PROPÓSITO. Ele é espelhado em outro produto, então
 * não importa NADA do resto deste repositório — só `fetch`. Se você precisar de
 * um helper daqui, copie a função ou deixe a decisão no chamador.
 *
 * Validação de dígito verificador NÃO é feita aqui (este repo já tem
 * `src/utils/cnpjValidation.ts` → `isValidCnpj`, usado nos formulários). Aqui só
 * conferimos "tem 14 dígitos", porque o único objetivo é não gastar requisição
 * num CNPJ incompleto.
 *
 * ── INVARIANTES (regras fiscais, não detalhes de implementação) ──────────────
 *
 * 1. NUNCA LANÇA. Rede caída, timeout, JSON malformado, 404, 429, resposta em
 *    formato inesperado → tudo volta como `{ success: false }`. Nenhum chamador
 *    precisa de try/catch.
 *
 * 2. `429` volta com `success: false` E `rateLimited: true`. O limite da API é
 *    de 3 requisições por minuto por IP (medido: HTTP 429 com corpo
 *    `{"status":429,"titulo":"Muitas requisições"}`). A UI tem que dizer "tente
 *    em 1 minuto", nunca "CNPJ não encontrado".
 *
 * 3. `success: false` NÃO É "não tem inscrição estadual". Falha de consulta não
 *    pode virar fato fiscal. Quem consome precisa distinguir os dois.
 *
 * 4. `success: true` com `inscricoes: []` É a afirmação de ausência: a base
 *    respondeu e disse que este CNPJ não tem IE. Caso real medido:
 *    `19131243000197` (situação cadastral "Ativa", `inscricoes_estaduais: []`).
 *
 * 5. `ieDaUf` só devolve inscrição `ativo === true` E da UF pedida. Nunca
 *    devolve IE de outro estado: IE não vinculada ao CNPJ naquela UF é rejeição
 *    234 na SEFAZ. Casos reais medidos:
 *      • `17469701004911` tem 14 inscrições, uma por UF — `inscricoes[0]`
 *        entrega a IE do estado errado;
 *      • `47960950000121` tem 3 inscrições, uma delas com `ativo: false` (PE).
 *
 * 6. `mesmaIe` compara só dígitos e ignora zeros à esquerda. Caso real medido:
 *    `62991441000150` tem `141501855` digitado à mão e `00141501855` na API —
 *    é a MESMA inscrição, e acusar divergência aqui treina o usuário a ignorar
 *    o aviso. (Divergência real existe: `39505336000141`, base `24714360` vs.
 *    API `243714360`.)
 *
 * 7. `cnpjBaixado` só afirma algo quando a consulta deu certo e a situação
 *    cadastral é conhecida e diferente de "Ativa". Situação desconhecida não é
 *    sinal de problema.
 */

/** Inscrição estadual encontrada para o CNPJ, já normalizada. */
export interface IeEncontrada {
  /** Só dígitos — zeros à esquerda PRESERVADOS (fazem parte da IE em alguns estados). */
  inscricao_estadual: string;
  /** Sigla da UF em caixa alta (ex: "SP"). */
  uf: string;
  /** `true` apenas quando a base diz explicitamente que a inscrição está ativa. */
  ativo: boolean;
  atualizado_em: string | null;
}

export interface ConsultaIeResult {
  /** `true` só quando a base respondeu e foi possível interpretar a resposta. */
  success: boolean;
  /** `true` quando a recusa foi por limite de requisições (3/min por IP). */
  rateLimited?: boolean;
  /** "Ativa" | "Baixada" | "Suspensa" | "Inapta" | ... (texto cru da base). */
  situacaoCadastral?: string | null;
  /** Lista de inscrições. `[]` com `success: true` = afirmação de ausência. */
  inscricoes?: IeEncontrada[];
  /** Código curto do motivo da falha (para log/telemetria, não para a tela). */
  error?: string;
}

const ENDPOINT = 'https://publica.cnpj.ws/cnpj';

/** Teto de espera: a tela dispara essa consulta durante a digitação. */
const TIMEOUT_MS = 8000;

function digitos(v: string | null | undefined): string {
  return (v ?? '').replace(/\D/g, '');
}

/** Remove zeros à esquerda sem transformar "000" em "" por acidente de parse. */
function semZerosEsquerda(v: string): string {
  return v.replace(/^0+/, '');
}

/**
 * Consulta as inscrições estaduais de um CNPJ. Nunca lança (invariante 1).
 */
export const consultarIe = async (cnpj: string): Promise<ConsultaIeResult> => {
  const digits = digitos(cnpj);
  // Não gasta requisição (limite de 3/min) com CNPJ incompleto.
  if (digits.length !== 14) return { success: false, error: 'cnpj_invalido' };

  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = controller
    ? setTimeout(() => {
        try {
          controller.abort();
        } catch {
          /* abort não pode derrubar a consulta */
        }
      }, TIMEOUT_MS)
    : null;

  try {
    const res = await fetch(`${ENDPOINT}/${digits}`, {
      headers: { Accept: 'application/json' },
      signal: controller?.signal,
    });

    // Limite de requisições: é recusa TEMPORÁRIA, não "CNPJ sem IE".
    if (res.status === 429) return { success: false, rateLimited: true, error: 'rate_limited' };
    if (!res.ok) return { success: false, error: `http_${res.status}` };

    const body = (await res.json()) as unknown;
    const estabelecimento = (body as { estabelecimento?: unknown } | null)?.estabelecimento;
    if (!estabelecimento || typeof estabelecimento !== 'object') {
      return { success: false, error: 'resposta_inesperada' };
    }

    const est = estabelecimento as {
      situacao_cadastral?: unknown;
      inscricoes_estaduais?: unknown;
    };

    const situacaoCadastral =
      typeof est.situacao_cadastral === 'string' && est.situacao_cadastral.trim()
        ? est.situacao_cadastral.trim()
        : null;

    // Chave ausente NÃO é ausência de IE (invariante 3): sem o array, não
    // sabemos nada, e preferimos "indisponível" a afirmar um fato fiscal.
    if (!Array.isArray(est.inscricoes_estaduais)) {
      return { success: false, error: 'inscricoes_ausentes' };
    }

    const brutas = est.inscricoes_estaduais as Array<Record<string, unknown>>;
    const inscricoes: IeEncontrada[] = [];
    for (const item of brutas) {
      if (!item || typeof item !== 'object') continue;
      const ie = digitos(item.inscricao_estadual as string | null | undefined);
      if (!ie) continue;
      const estado = item.estado as { sigla?: unknown } | null | undefined;
      const uf = typeof estado?.sigla === 'string' ? estado.sigla.trim().toUpperCase() : '';
      inscricoes.push({
        inscricao_estadual: ie,
        uf,
        // Só `true` explícito conta como ativa (invariante 5).
        ativo: item.ativo === true,
        atualizado_em:
          typeof item.atualizado_em === 'string' && item.atualizado_em.trim()
            ? item.atualizado_em
            : null,
      });
    }

    // Tinha inscrição na resposta mas nenhuma legível: isso é falha de leitura,
    // e virar `[]` aqui afirmaria ausência que a base não afirmou.
    if (inscricoes.length === 0 && brutas.length > 0) {
      return { success: false, situacaoCadastral, error: 'inscricao_ilegivel' };
    }

    return { success: true, situacaoCadastral, inscricoes };
  } catch {
    // Rede, timeout/abort e JSON malformado caem todos aqui.
    return { success: false, error: 'falha_rede' };
  } finally {
    if (timer) clearTimeout(timer);
  }
};

/**
 * Inscrição ATIVA da UF pedida, ou `null`. Nunca devolve IE de outra UF
 * (invariante 5). Sem UF → `null`, porque não existe "IE padrão".
 */
export const ieDaUf = (r: ConsultaIeResult, uf: string): IeEncontrada | null => {
  if (!r?.success) return null;
  const alvo = (uf ?? '').trim().toUpperCase();
  if (!alvo) return null;
  const achada = (r.inscricoes ?? []).find((i) => i.ativo === true && i.uf === alvo);
  return achada ?? null;
};

/**
 * `true` quando as duas strings representam a MESMA inscrição estadual
 * (só dígitos, zeros à esquerda ignorados — invariante 6). Lado sem nenhum
 * dígito (vazio, "ISENTO", "-") → `false`: não afirma igualdade.
 */
export const mesmaIe = (a: string | null | undefined, b: string | null | undefined): boolean => {
  const x = semZerosEsquerda(digitos(a));
  const y = semZerosEsquerda(digitos(b));
  if (!x || !y) return false;
  return x === y;
};

/**
 * `true` quando a consulta deu certo E a Receita informa situação cadastral
 * diferente de "Ativa" (Baixada, Suspensa, Inapta, Nula...). Emitir nota contra
 * CNPJ nessa condição é recusa certa. Situação desconhecida → `false`
 * (invariante 7).
 */
export const cnpjBaixado = (r: ConsultaIeResult): boolean => {
  if (!r?.success) return false;
  const situacao = (r.situacaoCadastral ?? '').trim().toLowerCase();
  if (!situacao) return false;
  return situacao !== 'ativa' && situacao !== 'ativo';
};

/**
 * Adaptador: remonta um `ConsultaIeResult` a partir dos campos achatados que
 * trafegam no payload do componente de CNPJ (que carrega a lista, a situação
 * cadastral e o sinal de indisponibilidade em campos separados). Mantém as
 * invariantes: sem lista legível, o resultado é `success: false` — nunca `[]`.
 */
export const resultadoDeCampos = (campos: {
  inscricoes?: IeEncontrada[] | null;
  situacaoCadastral?: string | null;
  indisponivel?: boolean;
}): ConsultaIeResult => {
  if (campos.indisponivel || !Array.isArray(campos.inscricoes)) {
    return { success: false, situacaoCadastral: campos.situacaoCadastral ?? null, error: 'indisponivel' };
  }
  return {
    success: true,
    situacaoCadastral: campos.situacaoCadastral ?? null,
    inscricoes: campos.inscricoes,
  };
};
