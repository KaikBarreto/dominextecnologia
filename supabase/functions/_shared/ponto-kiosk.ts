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
 * Ações permitidas AGORA, decididas pelo ÚLTIMO evento válido da sequência.
 *
 * ⚠️ A ORDEM DO ARGUMENTO É SIGNIFICATIVA. Até 1.28.x esta regra decidia pelo
 * CONJUNTO dos tipos do dia (`new Set(...)`), e era isso que tornava
 * impossíveis os dois cenários que a Imperium abriu chamado:
 *   • segunda jornada no mesmo dia (depois de um `clock_out` o conjunto estava
 *     "completo" e não sobrava ação nenhuma);
 *   • jornada SEM intervalo (o conjunto `{clock_in}` sempre apontava
 *     `break_start` como próximo, então a saída direta era recusada).
 * Passe a sequência ordenada por `recorded_at` ASC. Quem chama hoje já ordena
 * (`.order("recorded_at", { ascending: true })` na edge e `ORDER BY` na RPC).
 *
 *   (nenhum)     -> ["clock_in"]
 *   clock_in     -> ["break_start", "clock_out"]
 *   break_start  -> ["break_end"]
 *   break_end    -> ["break_start", "clock_out"]
 *   clock_out    -> ["clock_in"]            <- é isto que destrava a 2ª jornada
 *
 * O PRIMEIRO item é a ação SUGERIDA (botão primário do front e valor do campo
 * singular `next_action` no payload da edge). `break_start` vem antes de
 * `clock_out` de propósito: preserva o comportamento atual de quem tem
 * intervalo sem impedir a saída direta de quem não tem.
 *
 * Tipos desconhecidos são IGNORADOS — e, em especial, nunca viram "o último"
 * evento: um valor torto no meio da sequência não pode zerar a máquina de
 * estado e liberar uma entrada duplicada.
 *
 * ESPELHO OBRIGATÓRIO de `public.allowed_punch_actions(company, employee, date)`
 * (migration 20260930150000_ponto_multiplas_jornadas.sql). O banco é a fonte da
 * verdade contra corrida; esta cópia existe pra barrar a requisição ANTES do
 * upload da selfie. Mexeu numa, confere na outra.
 */
export function allowedActionsFrom(
  recordTypesInOrder: readonly string[],
): PunchType[] {
  let last: PunchType | null = null;
  for (const t of recordTypesInOrder) {
    if ((PUNCH_ORDER as readonly string[]).includes(t)) last = t as PunchType;
  }

  switch (last) {
    case "clock_in":
      return ["break_start", "clock_out"];
    case "break_start":
      return ["break_end"];
    case "break_end":
      return ["break_start", "clock_out"];
    case "clock_out":
      return ["clock_in"];
    default:
      return ["clock_in"];
  }
}

/**
 * Ação SUGERIDA — o primeiro item de `allowedActionsFrom`.
 *
 * Mantido com o mesmo nome e a mesma assinatura porque o campo `next_action`
 * do payload da edge não pode sumir: bundle velho em cache de PWA continua
 * lendo só ele. Nunca devolve null hoje (depois da saída volta a ser
 * `clock_in`, que é a jornada nova); o `| null` fica no tipo pra não quebrar
 * quem já trata o caso.
 *
 * ⚠️ Não é mais o controle de integridade sozinho: `register_punch` valida
 * contra a LISTA (`allowedActionsFrom`), senão a saída sem intervalo e a
 * segunda jornada continuariam barradas.
 */
export function nextActionFrom(typesToday: readonly string[]): PunchType | null {
  return allowedActionsFrom(typesToday)[0] ?? null;
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
 * É derivado no servidor de propósito: o payload do quiosque NÃO carrega os
 * registros que geraram o status (§1.3).
 *
 * ⚠️ A ORDEM DO ARGUMENTO É SIGNIFICATIVA, pelo mesmo motivo de
 * `allowedActionsFrom`: com o `Set` de antes, quem já tinha fechado a 1ª
 * jornada e voltou pra uma segunda aparecia como "Jornada concluída" no tablet
 * enquanto estava trabalhando, porque existia UM `clock_out` no dia. Agora quem
 * manda é o ÚLTIMO evento. Para um dia de jornada única o resultado é
 * idêntico ao de antes, evento a evento.
 *
 * Tipos desconhecidos são ignorados e nunca viram "o último".
 */
export function deriveDayStatus(typesToday: readonly string[]): DayStatus {
  let last: PunchType | null = null;
  for (const t of typesToday) {
    if ((PUNCH_ORDER as readonly string[]).includes(t)) last = t as PunchType;
  }

  switch (last) {
    case "clock_out":
      return "finished";
    case "break_start":
      return "on_break";
    case "clock_in":
    case "break_end":
      return "working";
    default:
      return "not_started";
  }
}

/**
 * Mesma decisão de `deriveDayStatus`, a partir do ÚLTIMO tipo já eleito pelo
 * banco (`kiosk_punch_states.last_type`, NULL = dia sem batida).
 *
 * Existe porque a lista do quiosque parou de ler `time_records` do "dia do
 * relógio" e passou a ler o estado por JORNADA numa RPC só: de lá volta um
 * único tipo por funcionário, não a sequência. Como `deriveDayStatus` só olha
 * o último evento válido, a lista de um elemento dá resultado IDÊNTICO ao da
 * sequência inteira — e é aqui, num lugar só, que essa equivalência fica
 * escrita e testada, em vez de espalhada como `x ? [x] : []` na edge.
 *
 * Tipo desconhecido vindo do banco cai em `not_started` pela mesma regra de
 * `deriveDayStatus` (nunca vira "o último").
 */
export function dayStatusFromLastType(
  lastType: string | null | undefined,
): DayStatus {
  return deriveDayStatus(lastType ? [lastType] : []);
}
