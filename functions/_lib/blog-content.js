const HTML_ENTITIES = {
  amp: '&',
  apos: "'",
  gt: '>',
  lt: '<',
  nbsp: ' ',
  quot: '"',
};

function decodeHtmlEntities(value) {
  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (entity, code) => {
    if (code[0] === '#') {
      const hex = code[1]?.toLowerCase() === 'x';
      const parsed = Number.parseInt(code.slice(hex ? 2 : 1), hex ? 16 : 10);
      return Number.isFinite(parsed) ? String.fromCodePoint(parsed) : entity;
    }
    return HTML_ENTITIES[code.toLowerCase()] ?? entity;
  });
}

function normalizeHeading(value) {
  return decodeHtmlEntities(value.replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim()
    .normalize('NFKC')
    .toLocaleLowerCase();
}

/** Mantém somente o H1 do layout quando o HTML editorial repete o título. */
export function stripDuplicateLeadingTitle(content, title) {
  const leadingH1 = content.match(/^(\s*(?:<!--[\s\S]*?-->\s*)*)<h1\b[^>]*>([\s\S]*?)<\/h1>\s*/i);
  if (!leadingH1 || normalizeHeading(leadingH1[2]) !== normalizeHeading(title)) {
    return content;
  }
  return `${leadingH1[1]}${content.slice(leadingH1[0].length)}`;
}
