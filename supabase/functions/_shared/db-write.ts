// db-write.ts — o portão das escritas de banco nas edge functions.
// ---------------------------------------------------------------
// ⚠️ REGRA-LEI (incidente Pix Automático 2026-09-19, lote de cobrança 2026-09-19):
// o `supabase-js` NÃO LANÇA quando o banco recusa a escrita. Ele devolve
// `{ data, error }`. Portanto:
//
//     await supabase.from("x").update({ ... }).eq("id", id);   // ❌ ENGOLE A FALHA
//
// O `try/catch` em volta NUNCA dispara, a função segue pelo caminho feliz e
// responde sucesso com o estado local mentindo. Quando a coluna escrita é
// estado de DINHEIRO (pago/não pago, valor agendado, receita lançada), a
// mentira vira prejuízo silencioso: cobrança confirmada que fica PENDING,
// receita que não entra no DRE, upgrade registrado no histórico que o webhook
// nunca aplica porque os campos `pending_*` não chegaram a ser gravados.
//
// Este módulo existe pra que a checagem NÃO dependa de alguém lembrar. São dois
// caminhos, e escolher entre eles é uma decisão de negócio que tem que estar
// escrita no ponto de uso:
//
//   applyWrite(label, query)  → LANÇA. Use quando responder sucesso sem essa
//                               escrita seria mentira, e quando ainda dá pra
//                               refazer (nada irreversível aconteceu antes:
//                               nenhum mutex consumido, nenhuma chamada ao
//                               gateway que cobraria de novo na retentativa).
//
//   tryWrite(label, query, …) → NÃO lança. Use quando o efeito principal já foi
//                               aplicado e falhar alto não repara nada (ou pior:
//                               faria o usuário repetir uma operação que já
//                               cobrou). Registra um aviso na resposta E loga a
//                               linha de recuperação com TODOS os dados pra
//                               refazer o lançamento à mão.
//
// `tryWrite` nunca é "engolir": ele exige `recovery` e empurra o aviso pra
// resposta. Sucesso com aviso é diferente de sucesso limpo.
//
// Módulo PURO de propósito (sem `Deno.*`, sem import remoto) pra ser importável
// pelo vitest a partir de `src/**` — é lá que ele é testado.

/** Formato do erro que o supabase-js devolve em `{ error }`. */
export interface DbWriteError {
  message: string;
  code?: string | null;
  details?: string | null;
  hint?: string | null;
}

/** Qualquer query do supabase-js: um thenable que resolve em `{ error }`. */
export type DbWriteQuery = PromiseLike<{ error: DbWriteError | null }>;

/**
 * Coletor de avisos de escrita não-fatal. O que entra aqui VAI pra resposta da
 * edge (`warnings: string[]`), pra que "deu certo com pendência" nunca se
 * confunda com "deu certo".
 */
export class WriteWarnings {
  private readonly items: string[] = [];

  add(message: string): void {
    this.items.push(message);
  }

  get list(): string[] {
    return [...this.items];
  }

  get hasAny(): boolean {
    return this.items.length > 0;
  }

  /** Espalha `warnings` no corpo da resposta só quando existe algum. */
  toBody(): { warnings?: string[] } {
    return this.hasAny ? { warnings: this.list } : {};
  }
}

/**
 * Serializa os dados de recuperação numa linha só, estável e grepável.
 * É o que permite refazer o lançamento à mão quando a escrita não-fatal falha.
 */
export function formatRecovery(recovery: Record<string, unknown>): string {
  return Object.entries(recovery)
    .map(([k, v]) => `${k}=${v === null || v === undefined ? "-" : String(v)}`)
    .join(" ");
}

export interface ApplyWriteOptions {
  /**
   * Converte o erro do banco no erro que o handler sabe traduzir em resposta
   * (ex.: ValidationError → 400 com copy PT-BR). A mensagem crua do Postgres
   * NÃO vai pro usuário: ela vai pro log, sempre.
   */
  rethrow?: (error: DbWriteError) => Error;
  /** Injetável pra teste. Default: console.error. */
  logger?: (message: string) => void;
}

/**
 * Executa a escrita e LANÇA se o banco recusar.
 * O `catch` do handler converte em resposta de erro — que é o que faz a falha
 * aparecer em vez de sumir.
 */
export async function applyWrite(
  label: string,
  query: DbWriteQuery,
  opts: ApplyWriteOptions = {},
): Promise<void> {
  const { error } = await query;
  if (!error) return;

  const log = opts.logger ?? ((m: string) => console.error(m));
  log(`[db-write] ${label} FALHOU (${error.code || "sem código"}): ${error.message}`);
  throw opts.rethrow ? opts.rethrow(error) : new Error(`${label} falhou: ${error.message}`);
}

export interface TryWriteOptions {
  /** Dados suficientes pra refazer o lançamento à mão. Obrigatório de propósito. */
  recovery: Record<string, unknown>;
  /** Coletor que leva o aviso pra resposta da edge. */
  warnings?: WriteWarnings;
  /** Códigos do Postgres tratados como sucesso (ex.: "23505" = já existe → idempotente). */
  ignoreCodes?: string[];
  /** Injetável pra teste. Default: console.error. */
  logger?: (message: string) => void;
}

/** Query de escrita que ainda devolve a linha (`.select().single()`). */
export type DbWriteReturningQuery<T> = PromiseLike<{
  data: T | null;
  error: DbWriteError | null;
}>;

/**
 * Executa a escrita, NÃO lança, e devolve `true` só quando gravou (ou quando o
 * erro estava na lista de códigos idempotentes). Em falha real: loga alto com a
 * linha de recuperação e registra o aviso.
 */
export async function tryWrite(
  label: string,
  query: DbWriteQuery,
  opts: TryWriteOptions,
): Promise<boolean> {
  const { error } = await query;
  if (!error) return true;

  const code = error.code ?? "";
  if (code && (opts.ignoreCodes ?? []).includes(code)) return true;

  const log = opts.logger ?? ((m: string) => console.error(m));
  log(
    `[db-write] ${label} FALHOU (${code || "sem código"}): ${error.message} | ` +
      `RECUPERAR À MÃO: ${formatRecovery(opts.recovery)}`,
  );
  opts.warnings?.add(`${label}: não foi gravado (${error.message}).`);
  return false;
}

/**
 * Igual ao `tryWrite`, mas para escritas que devolvem a linha
 * (`…insert(x).select().single()`). Devolve `null` quando o banco recusa — e o
 * chamador decide o que responder com essa ausência.
 *
 * Existe porque o padrão `const { data } = await supabase…insert(…).select()`
 * descarta o `error` por CONSTRUÇÃO: só de escrever a desestruturação com `data`
 * a falha já some. Aqui ela não some.
 */
export async function tryWriteReturning<T>(
  label: string,
  query: DbWriteReturningQuery<T>,
  opts: TryWriteOptions,
): Promise<T | null> {
  const { data, error } = await query;
  if (!error) return data ?? null;

  const code = error.code ?? "";
  if (code && (opts.ignoreCodes ?? []).includes(code)) return data ?? null;

  const log = opts.logger ?? ((m: string) => console.error(m));
  log(
    `[db-write] ${label} FALHOU (${code || "sem código"}): ${error.message} | ` +
      `RECUPERAR À MÃO: ${formatRecovery(opts.recovery)}`,
  );
  opts.warnings?.add(`${label}: não foi gravado (${error.message}).`);
  return null;
}
