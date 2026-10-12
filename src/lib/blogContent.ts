const HTML_ENTITIES: Record<string, string> = {
  amp: '&',
  apos: "'",
  gt: '>',
  lt: '<',
  nbsp: ' ',
  quot: '"',
};

function decodeHtmlEntities(value: string): string {
  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (entity, code: string) => {
    if (code[0] === '#') {
      const hex = code[1]?.toLowerCase() === 'x';
      const parsed = Number.parseInt(code.slice(hex ? 2 : 1), hex ? 16 : 10);
      return Number.isFinite(parsed) ? String.fromCodePoint(parsed) : entity;
    }
    return HTML_ENTITIES[code.toLowerCase()] ?? entity;
  });
}

function normalizeHeading(value: string): string {
  return decodeHtmlEntities(value.replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim()
    .normalize('NFKC')
    .toLocaleLowerCase();
}

/**
 * O layout do post já renderiza o título como H1. Alguns conteúdos antigos
 * também começam com o mesmo H1; remove somente essa repetição inicial.
 */
export function stripDuplicateLeadingTitle(content: string, title: string): string {
  const leadingH1 = content.match(/^(\s*(?:<!--[\s\S]*?-->\s*)*)<h1\b[^>]*>([\s\S]*?)<\/h1>\s*/i);
  if (!leadingH1 || normalizeHeading(leadingH1[2]) !== normalizeHeading(title)) {
    return content;
  }
  return `${leadingH1[1]}${content.slice(leadingH1[0].length)}`;
}
