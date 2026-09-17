// Identidade de quem está batendo o ponto na tela pública de ponto.
//
// Hoje só existe o caminho "personal" (link individual /ponto/:slug). O caminho
// "kiosk" é preparação pro Ponto em Grupo (link de quiosque compartilhado
// /ponto/empresa/:kioskSlug + seleção de funcionário) — a edge `time-clock-portal`
// AINDA não entende `kiosk_slug`/`employee_id`, então esse caminho não funciona
// no servidor até a tarefa do quiosque chegar na edge. Isso é esperado.
//
// Este tipo espelha (mas NÃO importa) o shape que a edge
// `supabase/functions/time-clock-portal` vai aceitar no body — o front nunca
// importa de `supabase/functions/`, então mantemos a duplicação intencional aqui.
export type PontoIdentity =
  | { kind: "personal"; slug: string }
  | { kind: "kiosk"; kioskSlug: string; employeeId: string };

/** Monta o corpo (parcial) da requisição pra edge a partir da identidade. */
export function identityRequestBody(identity: PontoIdentity): Record<string, string> {
  return identity.kind === "personal"
    ? { slug: identity.slug }
    : { kiosk_slug: identity.kioskSlug, employee_id: identity.employeeId };
}
