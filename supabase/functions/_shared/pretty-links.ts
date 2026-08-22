// Versão edge-side (Deno) do miolo de src/utils/prettyLinks.ts.
// O front usa alias `@/` (não importável do runtime das edges), então replicamos
// só `buildSlugSegment` aqui. Mantém o MESMO formato: `slug-do-nome-<shortCode>`,
// com o código curto sempre como último segmento (nunca contém '-').

/** Espera nomes já "slugados" (ou null); junta com '-' e anexa o código curto. */
export function buildSlugSegment(
  names: Array<string | null | undefined>,
  shortCode: string,
  fallback = "item",
): string {
  const slug =
    names
      .filter(Boolean)
      .map((n) => String(n))
      .filter(Boolean)
      .join("-") || fallback;
  return `${slug}-${shortCode}`;
}
