import { changelog, type ChangeCategory } from "@/pages/Changelog";

/**
 * Extrai "tópicos" curtos das notas de uma versão para o modal/drawer de
 * "Sistema atualizado" — assim o cliente sabe do que se trata a atualização
 * sem precisar abrir a página de novidades.
 *
 * No Dominex o changelog é estruturado (`ChangelogEntry[]` com `changes[]`),
 * então cada tópico é o `title` de cada mudança da versão, prefixado por um
 * emoji da categoria (recurso/melhoria/correção/segurança). Ex.:
 *   "✨ Novo visual: menu escuro por padrão"
 *
 * Como deriva do próprio changelog, funciona retroativamente para todas as
 * versões e não exige nenhuma autoria extra por release.
 */
const CATEGORY_EMOJI: Record<ChangeCategory, string> = {
  recurso: "✨",
  melhoria: "🔧",
  correcao: "🐛",
  seguranca: "🛡️",
};

export function getVersionTopics(version?: string | null): string[] {
  if (!version) return [];
  const entry = changelog.find((e) => e.version === version);
  if (!entry?.changes?.length) return [];

  return entry.changes.map((change) => {
    const emoji = CATEGORY_EMOJI[change.category];
    const title = change.title.replace(/[.:\s]+$/, "").trim();
    return emoji ? `${emoji} ${title}` : title;
  });
}
