import xss from 'xss';

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

const COMMON_ATTRIBUTES = [
  'class', 'id', 'style', 'title', 'role', 'aria-label', 'aria-hidden',
  'data-dominex-editorial', 'data-youtube-video', 'data-infographic',
  'data-column-layout', 'data-column',
];

const HTML_TAGS = {
  a: ['href', 'target', 'rel'],
  aside: [],
  b: [],
  blockquote: ['cite'],
  br: [],
  code: [],
  del: ['datetime'],
  details: ['open'],
  div: [],
  em: [],
  figcaption: [],
  figure: [],
  h1: [],
  h2: [],
  h3: [],
  h4: [],
  h5: [],
  h6: [],
  hr: [],
  i: [],
  iframe: ['src', 'title', 'loading', 'allow', 'allowfullscreen', 'referrerpolicy', 'width', 'height'],
  img: ['src', 'alt', 'loading', 'decoding', 'width', 'height'],
  li: [],
  ol: [],
  p: [],
  pre: [],
  s: [],
  small: [],
  span: [],
  strong: [],
  summary: [],
  table: ['summary'],
  tbody: [],
  td: ['colspan', 'rowspan'],
  tfoot: [],
  th: ['colspan', 'rowspan', 'scope'],
  thead: [],
  tr: [],
  u: [],
  ul: [],
};

const SVG_TAGS = {
  svg: ['xmlns', 'viewbox', 'width', 'height', 'fill', 'stroke'],
  g: ['fill', 'stroke', 'transform', 'opacity'],
  defs: [],
  lineargradient: ['id', 'x1', 'x2', 'y1', 'y2', 'gradientunits'],
  radialgradient: ['id', 'cx', 'cy', 'r', 'gradientunits'],
  stop: ['offset', 'stop-color', 'opacity'],
  marker: ['id', 'viewbox', 'refx', 'refy', 'markerwidth', 'markerheight', 'orient', 'markerunits'],
  path: ['d', 'fill', 'stroke', 'stroke-width', 'stroke-dasharray', 'marker-end', 'opacity', 'transform'],
  rect: ['x', 'y', 'width', 'height', 'rx', 'fill', 'stroke', 'stroke-width', 'opacity', 'transform'],
  circle: ['cx', 'cy', 'r', 'fill', 'stroke', 'stroke-width', 'opacity', 'transform'],
  line: ['x1', 'x2', 'y1', 'y2', 'stroke', 'stroke-width', 'stroke-dasharray', 'marker-end', 'opacity', 'transform'],
  polyline: ['points', 'fill', 'stroke', 'stroke-width', 'opacity', 'transform'],
  polygon: ['points', 'fill', 'stroke', 'stroke-width', 'opacity', 'transform'],
  text: ['x', 'y', 'fill', 'font-family', 'font-size', 'font-weight', 'text-anchor', 'letter-spacing', 'opacity', 'transform'],
};

const WHITE_LIST = Object.fromEntries(
  Object.entries({ ...HTML_TAGS, ...SVG_TAGS }).map(([tag, attributes]) => [
    tag,
    [...new Set([...COMMON_ATTRIBUTES, ...attributes])],
  ]),
);

const CSS_WHITE_LIST = Object.fromEntries(
  [
    'background', 'border', 'border-left', 'border-radius', 'color', 'display',
    'flex-wrap', 'font-size', 'font-weight', 'gap', 'grid-column',
    'grid-template-columns', 'height', 'margin', 'margin-bottom', 'margin-top',
    'max-height', 'max-width', 'min-height', 'min-width', 'opacity', 'padding',
    'text-align', 'text-decoration', 'white-space', 'width',
  ].map((property) => [property, true]),
);

function canonicalYoutubeEmbed(value) {
  if (!value) return '';
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:') return '';
    if (!['www.youtube.com', 'youtube.com', 'www.youtube-nocookie.com'].includes(url.hostname)) {
      return '';
    }
    const match = url.pathname.match(/^\/embed\/([A-Za-z0-9_-]{11})\/?$/);
    return match ? `https://www.youtube-nocookie.com/embed/${match[1]}` : '';
  } catch {
    return '';
  }
}

function isSafeLink(value) {
  return /^(?:https?:\/\/|mailto:|tel:|\/|\.\/|\.\.\/|#)/i.test(value.trim());
}

function isSafeImage(value) {
  const source = value.trim();
  return /^(?:https?:\/\/|\/|\.\/|\.\.\/)/i.test(source)
    || /^data:image\/(?:png|jpe?g|gif|webp|avif);base64,/i.test(source);
}

function parseTagAttributes(tagHtml) {
  const values = {};
  const body = tagHtml.replace(/^<\/?[a-z0-9:-]+\s*/i, '').replace(/\/?\s*>$/, '');
  xss.parseAttr(body, (name, value) => {
    values[name] = value;
    return '';
  });
  return values;
}

function cleanTextAttribute(value) {
  return xss.escapeAttrValue(String(value || '').slice(0, 300));
}

/**
 * Sanitiza HTML editorial com a mesma politica em browser, SSG, Cloudflare e
 * Vercel. Mantem o subconjunto visual do blog e remove codigo executavel,
 * handlers, URLs perigosas, SVG ativo e iframes fora do YouTube permitido.
 */
export function sanitizeBlogHtml(content) {
  if (!content) return '';

  const iframeStack = [];
  const filter = new xss.FilterXSS({
    whiteList: WHITE_LIST,
    stripIgnoreTag: true,
    stripIgnoreTagBody: ['script', 'style', 'object', 'embed', 'form', 'textarea', 'noscript', 'foreignobject'],
    allowCommentTag: false,
    css: { whiteList: CSS_WHITE_LIST },
    safeAttrValue(tag, name, value, cssFilter) {
      if (name === 'href') {
        return isSafeLink(value) ? xss.escapeAttrValue(value.trim()) : '';
      }
      if (name === 'src') {
        return tag === 'img' && isSafeImage(value) ? xss.escapeAttrValue(value.trim()) : '';
      }
      return xss.safeAttrValue(tag, name, value, cssFilter);
    },
    onTagAttr(tag, name, value) {
      if (name === 'href' && !isSafeLink(value)) return '';
      if (name === 'src' && tag === 'img' && !isSafeImage(value)) return '';
      if (name === 'style' && /(?:url\s*\(|expression\s*\(|javascript:|@import|behavior\s*:)/i.test(value)) {
        return '';
      }
      return undefined;
    },
    onTag(tag, html, options) {
      if (tag !== 'iframe') return undefined;
      if (options.isClosing) {
        return iframeStack.pop() ? '</iframe>' : '';
      }

      const attributes = parseTagAttributes(html);
      const src = canonicalYoutubeEmbed(attributes.src);
      iframeStack.push(Boolean(src));
      if (!src) return '';

      const title = cleanTextAttribute(attributes.title || 'Vídeo incorporado do YouTube');
      return `<iframe src="${src}" title="${title}" loading="lazy" allow="encrypted-media; picture-in-picture; web-share" allowfullscreen referrerpolicy="strict-origin-when-cross-origin">`;
    },
  });

  return filter.process(content);
}
