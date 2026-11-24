import {
  WHATSAPP_CUSTOM_TEMPLATE_MAX_LENGTH,
  findInvalidWhatsappTemplateTokens,
  type WhatsappMessageDomain,
} from './whatsappMessageTemplates';

/**
 * Conversor PURO entre o texto guardado do aviso (formato do WhatsApp:
 * `*negrito*`, `_itálico_`, `~riscado~`, variáveis `{{os.numero}}`) e o
 * documento do editor TipTap (parágrafos, marcas e nó atômico de variável).
 *
 * Regras do WhatsApp que valem aqui:
 * - o marcador de abertura precisa vir colado ao texto (`* texto*` não formata);
 * - o de fechamento também (`*texto *` não formata), por isso, ao gerar o
 *   texto, o espaço sai de dentro da marca;
 * - o marcador não abre no meio de uma palavra (`snake_case_word` fica intacto).
 */

export type WhatsappEditorMark = 'bold' | 'italic' | 'strike';

export const WHATSAPP_VARIABLE_NODE_NAME = 'whatsappVariable';

export interface WhatsappEditorMarkJson {
  type: WhatsappEditorMark;
}

export interface WhatsappEditorNodeJson {
  type: string;
  text?: string;
  attrs?: { variableKey?: string };
  marks?: WhatsappEditorMarkJson[];
  content?: WhatsappEditorNodeJson[];
}

export interface WhatsappEditorDoc {
  type: 'doc';
  content: WhatsappEditorNodeJson[];
}

type Item = { kind: 'char'; ch: string } | { kind: 'var'; key: string };

interface Atom {
  item: Item;
  marks: WhatsappEditorMark[];
}

const MARK_ORDER: WhatsappEditorMark[] = ['bold', 'italic', 'strike'];
const MARK_CHAR: Record<WhatsappEditorMark, string> = { bold: '*', italic: '_', strike: '~' };
const CHAR_MARK: Record<string, WhatsappEditorMark> = { '*': 'bold', _: 'italic', '~': 'strike' };

// Mesmo formato aceito pelo motor de mensagens (`{{ os.numero }}` com ou sem espaços).
const VARIABLE_SOURCE = '\\{\\{\\s*([a-z]+\\.[a-z_]+)\\s*\\}\\}';

function tokenizeLine(line: string): Item[] {
  const items: Item[] = [];
  const pattern = new RegExp(VARIABLE_SOURCE, 'g');
  let cursor = 0;
  let match: RegExpExecArray | null;
  const pushChars = (chunk: string) => {
    for (const ch of Array.from(chunk)) items.push({ kind: 'char', ch });
  };
  while ((match = pattern.exec(line)) !== null) {
    pushChars(line.slice(cursor, match.index));
    items.push({ kind: 'var', key: match[1] });
    cursor = match.index + match[0].length;
  }
  pushChars(line.slice(cursor));
  return items;
}

function isSpace(item: Item | undefined): boolean {
  return item?.kind === 'char' && /\s/.test(item.ch);
}

function isWordLike(item: Item | undefined): boolean {
  if (!item) return false;
  return item.kind === 'var' || /[\p{L}\p{N}]/u.test(item.ch);
}

function parseRange(
  items: Item[],
  start: number,
  end: number,
  marks: WhatsappEditorMark[],
  out: Atom[],
): void {
  let i = start;
  while (i < end) {
    const item = items[i];
    if (item.kind === 'char' && CHAR_MARK[item.ch]) {
      const mark = CHAR_MARK[item.ch];
      const next = items[i + 1];
      const canOpen = i + 1 < end
        && next !== undefined
        && !isSpace(next)
        && !(next.kind === 'char' && next.ch === item.ch)
        && !isWordLike(items[i - 1]);
      if (canOpen) {
        let closer = -1;
        for (let j = i + 2; j < end; j += 1) {
          const candidate = items[j];
          if (
            candidate.kind === 'char'
            && candidate.ch === item.ch
            && !isSpace(items[j - 1])
            && !isWordLike(items[j + 1])
          ) {
            closer = j;
            break;
          }
        }
        if (closer !== -1) {
          parseRange(items, i + 1, closer, marks.includes(mark) ? marks : [...marks, mark], out);
          i = closer + 1;
          continue;
        }
      }
    }
    out.push({ item, marks });
    i += 1;
  }
}

function parseLine(line: string): Atom[] {
  const items = tokenizeLine(line);
  const out: Atom[] = [];
  parseRange(items, 0, items.length, [], out);
  return out;
}

function sameMarks(a: WhatsappEditorMark[], b: WhatsappEditorMark[]): boolean {
  return a.length === b.length && a.every((mark) => b.includes(mark));
}

function orderedMarks(marks: WhatsappEditorMark[]): WhatsappEditorMarkJson[] {
  return MARK_ORDER.filter((mark) => marks.includes(mark)).map((type) => ({ type }));
}

/** Um trecho de uma linha, já com as marcas aplicadas (usado pela prévia também). */
export type WhatsappInlineSegment =
  | { type: 'text'; text: string; marks: WhatsappEditorMark[] }
  | { type: 'variable'; key: string; marks: WhatsappEditorMark[] };

function atomsToSegments(atoms: Atom[]): WhatsappInlineSegment[] {
  const segments: WhatsappInlineSegment[] = [];
  for (const atom of atoms) {
    const marks = MARK_ORDER.filter((mark) => atom.marks.includes(mark));
    if (atom.item.kind === 'var') {
      segments.push({ type: 'variable', key: atom.item.key, marks });
      continue;
    }
    const last = segments[segments.length - 1];
    if (last && last.type === 'text' && sameMarks(last.marks, marks)) {
      last.text += atom.item.ch;
    } else {
      segments.push({ type: 'text', text: atom.item.ch, marks });
    }
  }
  return segments;
}

/** Interpreta uma linha no formato do WhatsApp. Usado pela prévia da mensagem. */
export function parseWhatsappLine(line: string): WhatsappInlineSegment[] {
  return atomsToSegments(parseLine(line));
}

/** Texto guardado → documento do editor. Linha = parágrafo; linha em branco = parágrafo vazio. */
export function whatsappTextToEditorDoc(text: string): WhatsappEditorDoc {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  return {
    type: 'doc',
    content: lines.map((line) => {
      const segments = parseWhatsappLine(line);
      if (segments.length === 0) return { type: 'paragraph' };
      return {
        type: 'paragraph',
        content: segments.map((segment): WhatsappEditorNodeJson => {
          const marks = orderedMarks(segment.marks);
          const withMarks = marks.length > 0 ? { marks } : {};
          return segment.type === 'text'
            ? { type: 'text', text: segment.text, ...withMarks }
            : {
                type: WHATSAPP_VARIABLE_NODE_NAME,
                attrs: { variableKey: segment.key },
                ...withMarks,
              };
        }),
      };
    }),
  };
}

function emitAtoms(atoms: Atom[], depth: number): string {
  if (atoms.length === 0) return '';
  if (depth >= MARK_ORDER.length) {
    return atoms
      .map((atom) => (atom.item.kind === 'var' ? `{{${atom.item.key}}}` : atom.item.ch))
      .join('');
  }
  const mark = MARK_ORDER[depth];
  let out = '';
  let index = 0;
  while (index < atoms.length) {
    const marked = atoms[index].marks.includes(mark);
    let end = index;
    while (end < atoms.length && atoms[end].marks.includes(mark) === marked) end += 1;
    const run = atoms.slice(index, end);
    index = end;

    if (!marked) {
      out += emitAtoms(run, depth + 1);
      continue;
    }

    // O espaço colado por dentro desfaz a formatação no WhatsApp: ele sai da marca.
    let from = 0;
    let to = run.length;
    while (from < to && isSpace(run[from].item)) from += 1;
    while (to > from && isSpace(run[to - 1].item)) to -= 1;
    const core = run.slice(from, to);
    out += emitAtoms(run.slice(0, from), depth + 1);
    if (core.length > 0) {
      out += `${MARK_CHAR[mark]}${emitAtoms(core, depth + 1)}${MARK_CHAR[mark]}`;
    }
    out += emitAtoms(run.slice(to), depth + 1);
  }
  return out;
}

function nodeMarks(node: WhatsappEditorNodeJson): WhatsappEditorMark[] {
  return (node.marks ?? [])
    .map((mark) => mark.type)
    .filter((type): type is WhatsappEditorMark => MARK_ORDER.includes(type));
}

/** Documento do editor → texto guardado. */
export function whatsappEditorDocToText(doc: WhatsappEditorDoc | { content?: WhatsappEditorNodeJson[] }): string {
  const paragraphs = doc.content ?? [];
  return paragraphs
    .map((paragraph) => {
      const atoms: Atom[] = [];
      for (const node of paragraph.content ?? []) {
        const marks = nodeMarks(node);
        if (node.type === WHATSAPP_VARIABLE_NODE_NAME) {
          const key = node.attrs?.variableKey;
          if (key) atoms.push({ item: { kind: 'var', key }, marks });
        } else if (node.type === 'text' && node.text) {
          for (const ch of Array.from(node.text)) atoms.push({ item: { kind: 'char', ch }, marks });
        }
      }
      return emitAtoms(atoms, 0);
    })
    .join('\n');
}

export type WhatsappCustomTextError = 'empty' | 'too_long' | 'invalid_variables';

export interface WhatsappCustomTextValidation {
  valid: boolean;
  error: WhatsappCustomTextError | null;
  /** Quantos caracteres o texto usa (sem contar espaços e linhas das pontas). */
  length: number;
  invalidTokens: string[];
}

/** Regras para o texto personalizado poder ser salvo. */
export function validateWhatsappCustomText(
  text: string,
  domain: WhatsappMessageDomain,
): WhatsappCustomTextValidation {
  const trimmed = text.trim();
  const invalidTokens = findInvalidWhatsappTemplateTokens(trimmed, domain);
  const error: WhatsappCustomTextError | null = trimmed.length === 0
    ? 'empty'
    : trimmed.length > WHATSAPP_CUSTOM_TEMPLATE_MAX_LENGTH
      ? 'too_long'
      : invalidTokens.length > 0
        ? 'invalid_variables'
        : null;
  return { valid: error === null, error, length: trimmed.length, invalidTokens };
}
