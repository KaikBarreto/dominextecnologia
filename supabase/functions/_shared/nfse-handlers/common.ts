// =============================================================================
// _shared/nfse-handlers/common.ts — utilidades comuns aos handlers de NFS-e.
// =============================================================================
// Os handlers vivem em `_shared` (e não dentro da pasta da edge) porque cada um
// é servido por DUAS rotas durante a janela de transição: o nome novo (`nfse-*`)
// e o nome antigo (`fisqal-*`, casca mantida por 1 release para o cliente com
// bundle em cache). Um handler único = zero risco de as duas rotas divergirem.
// =============================================================================

import { jsonResponse } from "../fiscal-auth.ts";
import { isValidDocument } from "../document-validation.ts";
import {
  friendlyFiscalMessage,
  NfseProviderError,
  NfseProviderUnconfiguredError,
  NfseProviderUnsupportedError,
} from "../nfse-provider.ts";

export function clean(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

export function onlyDigits(v: unknown): string {
  return clean(v).replace(/\D/g, "");
}

/** company_id encurtado para log (nunca logar o id inteiro). */
export function logId(companyId: string): string {
  return companyId.slice(0, 8) + "...";
}

/**
 * Traduz erro NEUTRO do provedor em Response JSON PT-BR.
 * Retorna `null` quando o erro não é de provedor (o chamador segue no catch).
 *
 * ⚠️ Os códigos de erro do CORPO (`fisqal_unconfigured`, `fisqal_error`) são
 * CONTRATO com o frontend atual (`src/utils/fisqalEdge.ts`, `useNfse`) e NÃO
 * podem mudar aqui — a troca é coordenada no passo B5. A mensagem que o usuário
 * lê já é neutra (não cita fornecedor).
 */
export function providerErrorResponse(
  err: unknown,
  opts: { friendly?: boolean } = {},
): Response | null {
  if (err instanceof NfseProviderUnconfiguredError) {
    return jsonResponse({ error: "fisqal_unconfigured", message: err.message }, 503);
  }
  if (err instanceof NfseProviderUnsupportedError) {
    return jsonResponse({ error: "provider_unsupported", message: err.message }, 501);
  }
  if (err instanceof NfseProviderError) {
    const message = opts.friendly
      ? friendlyFiscalMessage(err.codigo, err.message)
      : err.message;
    return jsonResponse(
      { error: "fisqal_error", message, code: err.codigo },
      err.status >= 400 && err.status < 600 ? err.status : 502,
    );
  }
  return null;
}

/**
 * cTribMun — código de tributação MUNICIPAL do layout nacional (3 dígitos).
 *
 * Complementa o cTribNac (`codigo_servico`, 6 dígitos): o município registra o
 * serviço como `14.01.01.001` = cTribNac(6) + cTribMun(3). Sem ele a prefeitura
 * rejeita com **E0312** ("código não administrado pelo município").
 *
 * Valor fora do formato é DESCARTADO (retorna ""). Omitir o campo é ruim; mandar
 * lixo para a prefeitura é pior — e o erro que volta seria indecifrável.
 *
 * Aceita number além de string (campo numérico no front manda `101`, não `"101"`)
 * — mas SEM completar com zero à esquerda: `1` continua inválido, porque supor
 * que o usuário quis dizer `001` é chutar código de serviço da prefeitura.
 */
export function cleanCTribMun(v: unknown): string {
  const s = typeof v === "number" && Number.isFinite(v) ? String(v) : clean(v);
  return /^\d{3}$/.test(s) ? s : "";
}

/** Resultado da validação do cTribMun informado explicitamente pelo usuário. */
export interface CTribMunDoBody {
  /** Valor válido (3 dígitos) ou "" quando não foi informado. */
  valor: string;
  /** Mensagem PT-BR de 422 quando o usuário informou algo fora do formato. */
  erro?: string;
}

/**
 * Valida o cTribMun que veio EXPLICITAMENTE no body da emissão.
 *
 * Assimetria proposital (decisão do Tech Lead):
 *   - body preenchido e fora de `/^\d{3}$/` → **422 com mensagem PT-BR**. Se o
 *     usuário digitou e o campo evapora, a nota sai sem cTribMun e volta E0312
 *     da prefeitura sem nenhuma pista — a armadilha que custou várias tentativas
 *     no spike. Falhar cedo e explicando é melhor que falhar tarde e mudo.
 *   - rascunho / herança do tipo de serviço inválidos → descarte SILENCIOSO
 *     (`cleanCTribMun`). É defesa contra dado velho; derrubar a emissão por causa
 *     de um valor que o usuário nem tocou nesta tela seria pior.
 *
 * Campo ausente, null ou string vazia = "não informado" (sem erro).
 */
export function validarCTribMunDoBody(v: unknown): CTribMunDoBody {
  const informado = v !== undefined && v !== null &&
    (typeof v === "number" ? Number.isFinite(v) : clean(v) !== "");
  if (!informado) return { valor: "" };
  const valor = cleanCTribMun(v);
  if (!valor) {
    return {
      valor: "",
      erro: "O código de tributação municipal deve ter exatamente 3 dígitos.",
    };
  }
  return { valor };
}

/**
 * `true` quando o erro do PostgREST é "esta coluna não existe" — seja no cache de
 * schema (`PGRST204`) ou no banco (`42703`).
 *
 * Serve para a gravação sobreviver a uma janela de deploy em que a edge já subiu
 * e a migration da coluna nova ainda não foi aplicada. Perder um campo OPCIONAL é
 * infinitamente melhor que perder o registro inteiro da nota (que já pode ter
 * sido enviada ao provedor).
 */
export function isUnknownColumnError(
  err: { code?: string; message?: string } | null | undefined,
  column: string,
): boolean {
  if (!err) return false;
  const code = clean((err as { code?: string }).code);
  if (code !== "PGRST204" && code !== "42703") return false;
  return clean(err.message).includes(column);
}

/** Cópia do objeto sem a coluna informada (não muta o original). */
export function withoutColumn<T extends Record<string, unknown>>(
  cols: T,
  column: string,
): Record<string, unknown> {
  const { [column]: _drop, ...rest } = cols;
  return rest;
}

/** Nome da coluna do cTribMun em `nfse_emissions` (migration 20260903170000). */
export const COL_CTRIBMUN = "codigo_tributacao_municipal";

/**
 * Nome da coluna do vínculo nota↔tipo de serviço em `nfse_emissions`
 * (migration 20260903190000). Guarda a ESCOLHA do seletor; os códigos fiscais
 * efetivamente usados continuam congelados nas colunas próprias da nota.
 */
export const COL_SERVICE_TYPE = "service_type_id";

/**
 * Nome da coluna de AUTORIA em `nfse_emissions` (migration 20260903210000).
 * Guarda o `auth.users.id` de quem criou o rascunho / emitiu a nota, para a
 * lista poder mostrar o avatar do responsável.
 *
 * A edge roda com service_role, então `auth.uid()` NÃO vem de graça: o valor
 * tem que ser carimbado explicitamente com o userId que o gate de auth já
 * resolveu (`authorizeFiscalManager` → `userId`).
 *
 * Só é carimbada no INSERT — um UPDATE nunca reescreve o autor original.
 */
export const COL_CREATED_BY = "created_by";

// =============================================================================
// TOMADOR / INTERMEDIÁRIO AVULSO (digitado na hora, sem cadastro em `customers`)
// =============================================================================
// Migration 20260906210000 criou `nfse_emissions.tomador_avulso` /
// `.intermediario_avulso` (jsonb). É SNAPSHOT da nota: vale só ali, não vira
// cliente, e fica congelado com o documento fiscal.
//
// Estas funções são a ÚNICA porta de entrada desse dado nas duas edges
// (nfse-save-draft e nfse-emit) — o rascunho e a emissão têm que enxergar
// exatamente o mesmo objeto, senão o que o usuário revisa no modal não é o que
// vai à prefeitura.

/** Nome das colunas jsonb (migration 20260906210000). */
export const COL_TOMADOR_AVULSO = "tomador_avulso";
export const COL_INTERMEDIARIO_AVULSO = "intermediario_avulso";

/** Endereço do avulso — mesmas chaves que o front coleta no `CepLookup`. */
export interface EnderecoAvulso {
  logradouro?: string;
  numero?: string;
  complemento?: string;
  bairro?: string;
  cidade?: string;
  uf?: string;
  /** Só dígitos (8). */
  cep?: string;
  /** IBGE do município (7 dígitos). */
  ibge?: string;
}

/** Tomador (ou intermediário) digitado na hora. */
export interface PessoaAvulsa {
  nome?: string;
  /** Só dígitos (11 = CPF · 14 = CNPJ). */
  documento?: string;
  email?: string;
  endereco?: EnderecoAvulso;
}

/** Remove chaves com valor vazio — jsonb da nota não guarda `""`. */
function semVazios(obj: Record<string, string>): Record<string, string> | undefined {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v) out[k] = v;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/**
 * Normaliza o objeto avulso vindo do body.
 *
 * - `undefined`/`null`/não-objeto → `null` ("não informado").
 * - Objeto sem NENHUM campo preenchido → `null` também: um `{}` gravado na
 *   coluna passaria no CHECK do banco e depois se comportaria como "tem tomador
 *   avulso" numa nota que não tem nada. Vazio é ausente.
 * - Documento, CEP e IBGE viram SÓ DÍGITOS aqui, uma vez. Assim a coluna nunca
 *   guarda "12.345.678/0001-90" numa nota e "12345678000190" na outra.
 * - UF em maiúsculas (2 letras) — o layout nacional não usa UF do tomador
 *   (o município sai do IBGE), mas a tela mostra.
 *
 * NÃO valida obrigatoriedade: rascunho é parcial por natureza. Quem cobra campo
 * é `validarPessoaAvulsaParaEmissao`, na hora de emitir.
 */
export function normalizarPessoaAvulsa(raw: unknown): PessoaAvulsa | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const src = raw as Record<string, unknown>;
  const endSrc = (src.endereco && typeof src.endereco === "object" &&
      !Array.isArray(src.endereco))
    ? src.endereco as Record<string, unknown>
    : {};

  const endereco = semVazios({
    logradouro: clean(endSrc.logradouro),
    numero: clean(endSrc.numero),
    complemento: clean(endSrc.complemento),
    bairro: clean(endSrc.bairro),
    cidade: clean(endSrc.cidade),
    uf: clean(endSrc.uf).toUpperCase().slice(0, 2),
    cep: onlyDigits(endSrc.cep),
    ibge: onlyDigits(endSrc.ibge),
  });

  const base = semVazios({
    nome: clean(src.nome),
    documento: onlyDigits(src.documento),
    email: clean(src.email),
  });

  if (!base && !endereco) return null;
  return { ...(base ?? {}), ...(endereco ? { endereco } : {}) } as PessoaAvulsa;
}

/** Campos do endereço que o layout nacional exige quando o bloco VAI no XML. */
const ENDERECO_OBRIGATORIO: Array<[keyof EnderecoAvulso, string]> = [
  ["logradouro", "logradouro"],
  ["numero", "número"],
  ["bairro", "bairro"],
  ["cep", "CEP"],
  ["ibge", "código IBGE do município (preenchido pela busca do CEP)"],
];

/**
 * Valida uma pessoa avulsa NA HORA DE EMITIR. Devolve mensagem PT-BR ou "".
 *
 * Regras (todas espelhando o que a prefeitura/o layout realmente cobram):
 *
 * 1. Nome e CPF/CNPJ são obrigatórios — o caminho do cliente cadastrado já
 *    barra nota sem documento do tomador ("CPF/CNPJ do cliente" em
 *    `missing_fields`), e aqui não existe cadastro pra consertar depois.
 *
 * 2. O documento passa pelo dígito verificador (`isValidDocument`). No caminho
 *    cadastrado só o tamanho é olhado, porque o cadastro já validou na tela do
 *    cliente; aqui o dado nasce agora e ninguém mais o confere.
 *
 * 3. ENDEREÇO É TUDO OU NADA (armadilha 7 do motor próprio):
 *    o XSD exige `endNac/cMun`, `endNac/CEP`, `xLgr`, `nro` e `xBairro` dentro
 *    do bloco. Meio bloco = rejeição **E1235** com mensagem enganosa ("esperado
 *    cMun"), que na real é o IBGE ausente. Por isso:
 *      - nenhum campo de endereço  → OK, o bloco é omitido (o layout aceita:
 *        o governo resolve o endereço pelo CNPJ);
 *      - endereço COMPLETO         → OK, vai no XML;
 *      - endereço PELA METADE      → 422 aqui, dizendo o que falta. Deixar
 *        passar significaria descartar em silêncio o endereço que a pessoa
 *        acabou de digitar — e a nota sairia diferente do formulário.
 *    `cidade`/`uf` NÃO entram na obrigatoriedade: não existem na DPS (o
 *    município vai pelo IBGE); ficam guardados só para a tela.
 */
export function validarPessoaAvulsaParaEmissao(
  pessoa: PessoaAvulsa | null,
  rotulo: "tomador" | "intermediário",
): string {
  if (!pessoa) return `Informe os dados do ${rotulo}.`;

  const nome = clean(pessoa.nome);
  if (!nome) return `Informe o nome do ${rotulo}.`;

  const documento = onlyDigits(pessoa.documento);
  if (!documento) return `Informe o CPF/CNPJ do ${rotulo}.`;
  if (!isValidDocument(documento)) {
    return `O CPF/CNPJ do ${rotulo} é inválido. Confira os números digitados.`;
  }

  const end = pessoa.endereco;
  if (end) {
    const preenchidos = ENDERECO_OBRIGATORIO.filter(([k]) => clean(end[k]));
    const faltando = ENDERECO_OBRIGATORIO.filter(([k]) => !clean(end[k]));
    // Só cobra quando a pessoa COMEÇOU a preencher o endereço.
    const comecouEndereco = preenchidos.length > 0 ||
      !!clean(end.cidade) || !!clean(end.uf) || !!clean(end.complemento);
    if (comecouEndereco && faltando.length > 0) {
      return `Complete o endereço do ${rotulo} (falta: ${
        faltando.map(([, r]) => r).join(", ")
      }) ou deixe o endereço todo em branco.`;
    }
  }

  return "";
}

/**
 * `true` quando o endereço do avulso está COMPLETO o bastante para virar bloco
 * `end` no XML. Incompleto → o bloco inteiro é omitido (nunca pela metade).
 */
export function enderecoAvulsoCompleto(end: EnderecoAvulso | undefined): boolean {
  if (!end) return false;
  return ENDERECO_OBRIGATORIO.every(([k]) => !!clean(end[k]));
}
