// =============================================================================
// pmoc-templates/html-sanitizer.ts — Sanitizador HTML server-side.
// =============================================================================
// Defesa em profundidade ANTES de passar o HTML editado pelo gestor pro parser
// HTML→PDF. Whitelist explícita de tags/atributos. Tudo fora dessa lista é
// strippado.
//
// Por que não usar isomorphic-dompurify aqui:
//   - Pesa muito no edge runtime (JSDOM completo).
//   - Nosso conteúdo é controlado (HTML do TipTap) — whitelist simples cobre.
//
// Regra Plataforma §2.7 — whitelist mínima:
//   <p>, <strong>, <em>, <u>, <h1>, <h2>, <h3>, <ul>, <ol>, <li>, <br>, <a>, <span>
// =============================================================================

const ALLOWED_TAGS = new Set([
  "p",
  "strong",
  "b",
  "em",
  "i",
  "u",
  "h1",
  "h2",
  "h3",
  "ul",
  "ol",
  "li",
  "br",
  "a",
  "span",
]);

// Atributos permitidos por tag.
const ALLOWED_ATTRS: Record<string, Set<string>> = {
  a: new Set(["href", "target", "rel"]),
  // outras tags: nenhum atributo permitido (style/onclick/onload sempre out)
};

// Regex de URL aceita (http/https/mailto/tel) — bloqueia javascript:, data:, etc.
const SAFE_HREF = /^(https?:\/\/|mailto:|tel:|\/|#)/i;

export interface SanitizeResult {
  clean: string;
  tagsRemoved: number;
  attrsRemoved: number;
}

/**
 * Sanitiza HTML por whitelist. Implementação leve (regex-based) — suficiente
 * pra HTML controlado vindo do TipTap. Não substitui defesa do browser, é
 * defesa server-side (regra-lei #1).
 */
export function sanitizeHtml(input: string | null | undefined): SanitizeResult {
  if (!input) return { clean: "", tagsRemoved: 0, attrsRemoved: 0 };

  let tagsRemoved = 0;
  let attrsRemoved = 0;

  // Strip comments completos
  let s = input.replace(/<!--[\s\S]*?-->/g, "");

  // Strip <script>, <style>, <iframe>, <embed>, <object>, <form>, <link>,
  // <meta>, <svg>, <input>, <button> COM SEU CONTEÚDO.
  const dangerTags = [
    "script",
    "style",
    "iframe",
    "embed",
    "object",
    "form",
    "link",
    "meta",
    "svg",
    "input",
    "button",
    "textarea",
    "select",
    "option",
    "img",
    "video",
    "audio",
    "source",
    "track",
    "math",
    "template",
    "noscript",
    "title",
    "head",
    "html",
    "body",
  ];
  for (const t of dangerTags) {
    const re = new RegExp(`<${t}[^>]*>[\\s\\S]*?</${t}>`, "gi");
    s = s.replace(re, () => {
      tagsRemoved++;
      return "";
    });
    // self-closing
    const reSelf = new RegExp(`<${t}[^>]*/?>`, "gi");
    s = s.replace(reSelf, () => {
      tagsRemoved++;
      return "";
    });
  }

  // Processa tags restantes: mantém só whitelist; pra cada tag whitelistada,
  // sanitiza atributos.
  s = s.replace(/<\/?([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g, (match, rawTag, rawAttrs) => {
    const tag = String(rawTag).toLowerCase();
    const isClosing = match.startsWith("</");

    if (!ALLOWED_TAGS.has(tag)) {
      tagsRemoved++;
      return ""; // strippa tag não-whitelistada inteira (mantém texto)
    }

    if (isClosing) {
      return `</${tag}>`;
    }

    // Atributos: parse minimalista key="value" / key='value' / key=value
    const allowedSet = ALLOWED_ATTRS[tag] ?? new Set<string>();
    const sanitizedAttrs: string[] = [];
    const attrRegex = /([a-zA-Z_:][a-zA-Z0-9_:.-]*)\s*=\s*("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|[^\s>]+)/g;
    let m: RegExpExecArray | null;
    while ((m = attrRegex.exec(rawAttrs)) !== null) {
      const name = m[1].toLowerCase();
      let value = m[2];
      // Strip aspas
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }

      // Bloqueia handlers (onload, onclick, etc) e style sempre
      if (name.startsWith("on") || name === "style" || name === "srcdoc" || name === "formaction") {
        attrsRemoved++;
        continue;
      }

      if (!allowedSet.has(name)) {
        attrsRemoved++;
        continue;
      }

      // Pra href: validar contra SAFE_HREF
      if (name === "href" && !SAFE_HREF.test(value)) {
        attrsRemoved++;
        continue;
      }

      // Escape de aspas pra segurança no PDF/HTML output
      const safeValue = value.replace(/"/g, "&quot;");
      sanitizedAttrs.push(`${name}="${safeValue}"`);
    }

    if (sanitizedAttrs.length === 0) {
      return `<${tag}>`;
    }
    return `<${tag} ${sanitizedAttrs.join(" ")}>`;
  });

  // Strip `javascript:` em qualquer texto que sobrou (defesa redundante)
  s = s.replace(/javascript:/gi, "blocked:");

  return { clean: s, tagsRemoved, attrsRemoved };
}
