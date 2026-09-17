// supabase/functions/_shared/ponto-kiosk.ts
// -----------------------------------------------------------------------------
// Decisões PURAS do ponto público (link pessoal e quiosque da empresa).
//
// Ficam aqui, fora do index.ts da edge, porque são o que dá pra ler e conferir
// sem rede nem banco: qual identidade veio na requisição, qual é a próxima
// batida do dia e que status mostrar no crachá do quiosque.
//
// Espelho no front: `src/lib/ponto/identity.ts` monta o body a partir do mesmo
// tipo `PontoIdentity`. O front NUNCA importa de `supabase/functions/` (e vice
// versa), então a duplicação é intencional: mexeu aqui, confere lá.
//
// Regra de exposição que manda neste arquivo:
// docs/planos/2026-09-16-regra-exposicao-quiosque-ponto.md
// -----------------------------------------------------------------------------

export const PUNCH_ORDER = [
  "clock_in",
  "break_start",
  "break_end",
  "clock_out",
] as const;

export type PunchType = (typeof PUNCH_ORDER)[number];

/**
 * Quem está batendo o ponto, e por onde:
 *  - `personal` — link pessoal /ponto/:slug (employees.ponto_slug)
 *  - `kiosk`    — tablet da empresa /ponto/empresa/:kioskSlug, que identifica a
 *                 pessoa pelo par (slug do quiosque + id do funcionário).
 *
 * O quiosque NUNCA usa nem devolve o slug pessoal (§2 da regra de exposição):
 * `ponto_slug` é credencial portátil e sem expiração, então a resposta pública
 * do link da empresa não pode entregar os links individuais do time inteiro.
 * `employee_id`, por contraste, não é credencial: só vale pareado com o slug do
 * quiosque e dentro da empresa dona daquele slug.
 */
export type PontoIdentity =
  | { kind: "personal"; slug: string }
  | { kind: "kiosk"; kioskSlug: string; employeeId: string };

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function trimmed(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Lê a identidade do corpo da requisição. Devolve null quando não dá pra
 * identificar ninguém — o chamador responde 400.
 *
 * O `employee_id` é validado como UUID AQUI, ANTES de chegar no Postgres: um
 * valor torto viraria erro de cast (22P02) em vez de um 400 limpo, e o 22P02
 * ainda confirmaria ao atacante que a query chegou no banco (§2.3).
 *
 * `slug` tem precedência: o link pessoal é o caminho legado e não pode mudar de
 * comportamento por causa de campo extra no body.
 */
export function parsePontoIdentity(
  body: Record<string, unknown>,
): PontoIdentity | null {
  const slug = trimmed(body?.slug);
  if (slug) return { kind: "personal", slug };

  const kioskSlug = trimmed(body?.kiosk_slug);
  const employeeId = trimmed(body?.employee_id);
  if (kioskSlug && employeeId && UUID_RE.test(employeeId)) {
    return { kind: "kiosk", kioskSlug, employeeId };
  }

  return null;
}

/**
 * O body VEIO do quiosque? Serve só pra escolher o FORMATO da resposta de erro
 * quando `parsePontoIdentity` devolve null (body do quiosque recebe
 * `{ error: <código>, message: <PT-BR> }`; o link pessoal mantém o
 * `{ error: <PT-BR> }` legado que a tela em produção já lê).
 * Não decide acesso a nada.
 */
export function looksLikeKioskBody(body: Record<string, unknown>): boolean {
  return !trimmed(body?.slug) && !!trimmed(body?.kiosk_slug);
}

/**
 * Próxima batida do dia: a primeira da ordem canônica que ainda não aconteceu.
 * Null = dia fechado. Tipos desconhecidos são ignorados.
 *
 * É o controle de integridade MAIS FORTE do ponto (§6): `register_punch` só
 * aceita `type === nextActionFrom(...)` recalculado no servidor, o que por
 * construção barra bater fora de ordem e repetir a mesma ação.
 */
export function nextActionFrom(typesToday: readonly string[]): PunchType | null {
  const seen = new Set(typesToday);
  for (const t of PUNCH_ORDER) {
    if (!seen.has(t)) return t;
  }
  return null;
}

// ── Gate de PIN ──────────────────────────────────────────────────────────────

/**
 * Retorno da RPC `public.verify_ponto_pin(p_employee_id, p_pin)`
 * (migration 20260917153000_ponto_kiosk_e_pin.sql). Campos todos opcionais
 * porque cada caso devolve um subconjunto:
 *   - sem PIN cadastrado ....... { ok: true, no_pin: true }
 *   - PIN correto .............. { ok: true }
 *   - PIN não digitado ......... { ok: false, pin_required: true, attempts_left }
 *   - PIN errado ............... { ok: false, attempts_left }
 *   - travado (5 erros/15 min) . { ok: false, locked_until, attempts_left: 0 }
 */
export type PinVerdict = {
  ok?: boolean;
  no_pin?: boolean;
  pin_required?: boolean;
  attempts_left?: number;
  locked_until?: string;
};

export type PinDecision = "pass" | "locked" | "invalid" | "required";

/**
 * Traduz o veredito da RPC na decisão do gate. Puro de propósito: é a única
 * regra do PIN que dá pra conferir lendo, sem banco.
 *
 * `pass` cobre TANTO quem acertou o PIN QUANTO quem não tem PIN (`no_pin`), e é
 * por isso que uma chamada só resolve os dois casos — quem não tem PIN segue
 * pelo caminho de sempre, sem perceber que o gate existe.
 *
 * FAIL-CLOSED: veredito nulo, sem `ok`, ou com formato inesperado NÃO passa.
 * A trava tem precedência sobre "não digitou": quem está travado precisa saber
 * disso ao tocar no próprio crachá, mesmo sem ter digitado nada.
 */
export function pinGateDecision(
  verdict: PinVerdict | null | undefined,
  typedPin: boolean,
): PinDecision {
  if (verdict?.ok === true) return "pass";
  if (verdict?.locked_until) return "locked";
  return typedPin ? "invalid" : "required";
}

export type DayStatus = "not_started" | "working" | "on_break" | "finished";

/**
 * Status exibido no crachá do quiosque (o "LED" que evita batida duplicada).
 * A saída manda em tudo (jornada concluída), depois o intervalo aberto, depois
 * a entrada. É derivado no servidor de propósito: o payload do quiosque NÃO
 * carrega os registros que geraram o status (§1.3).
 */
export function deriveDayStatus(typesToday: readonly string[]): DayStatus {
  const seen = new Set(typesToday);
  if (seen.has("clock_out")) return "finished";
  if (seen.has("break_start") && !seen.has("break_end")) return "on_break";
  if (seen.has("clock_in")) return "working";
  return "not_started";
}
