/**
 * Auditoria estática de escrita de banco nas edge functions.
 *
 * ⚠️ O PORQUÊ: o `supabase-js` NÃO lança quando o banco recusa a escrita — ele
 * devolve `{ error }`. Um `await supabase.from("x").update({...})` sem checar o
 * erro engole a falha inteira: o `try/catch` em volta nunca dispara e a função
 * responde sucesso com o estado local mentindo. Quando a coluna é estado de
 * dinheiro (pago/não pago, valor agendado, receita lançada), a mentira vira
 * prejuízo silencioso. O padrão já reapareceu três vezes em arquivos diferentes,
 * sempre por esquecimento — nunca por decisão.
 *
 * Este módulo é o detector que fecha a porta: dado o CÓDIGO-FONTE de uma edge,
 * aponta toda escrita (`insert`/`update`/`delete`/`upsert`) que não passa por
 * `applyWrite`/`tryWrite` nem desestrutura `error`. É usado pelo teste
 * `edgeWriteAudit.test.ts`, que roda o detector nos arquivos reais das edges de
 * dinheiro — o vitest só varre `src/**`, então a auditoria mora aqui e LÊ o
 * arquivo da edge.
 *
 * Função PURA: recebe string, devolve achados. Sem I/O.
 */

/** Métodos do PostgREST que ESCREVEM. Ler (`select`) não entra. */
export const MUTATION_METHODS = ['insert', 'update', 'upsert', 'delete'] as const;

export interface UncheckedWrite {
  /** Tabela do `.from("…")`, quando dá pra ler. */
  table: string;
  /** Método de escrita encontrado na cadeia. */
  method: string;
  /** Linha (1-based) da chamada, pra apontar o dedo no lugar certo. */
  line: number;
  /** Trecho da cadeia, só pra mensagem de erro do teste ser legível. */
  snippet: string;
}

/**
 * Substitui o CONTEÚDO de comentários e literais de string por espaços,
 * preservando o comprimento (índices continuam válidos no original).
 *
 * Existe porque sem isso o detector acusaria `.from(` citado num comentário
 * explicativo e, pior, `//` dentro de `"https://esm.sh/…"` viraria comentário e
 * cegaria o resto da linha.
 */
export function blankCommentsAndStrings(source: string): string {
  const out = source.split('');
  let i = 0;
  const n = source.length;
  const blank = (from: number, to: number) => {
    for (let k = from; k < to && k < n; k++) {
      if (out[k] !== '\n') out[k] = ' ';
    }
  };

  while (i < n) {
    const c = source[i];
    const next = source[i + 1];

    if (c === '/' && next === '/') {
      const end = source.indexOf('\n', i);
      const stop = end === -1 ? n : end;
      blank(i, stop);
      i = stop;
      continue;
    }
    if (c === '/' && next === '*') {
      const end = source.indexOf('*/', i + 2);
      const stop = end === -1 ? n : end + 2;
      blank(i, stop);
      i = stop;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      const quote = c;
      let j = i + 1;
      while (j < n) {
        if (source[j] === '\\') {
          j += 2;
          continue;
        }
        if (source[j] === quote) break;
        j++;
      }
      blank(i + 1, Math.min(j, n));
      i = Math.min(j + 1, n);
      continue;
    }
    i++;
  }
  return out.join('');
}

/** Passa pelo helper (`applyWrite`/`tryWrite`). É o padrão preferido. */
// O `(<…>)?` cobre a forma genérica `tryWriteReturning<{ id: string }>(…)`.
const VIA_HELPER = /\b(applyWrite|tryWrite|tryWriteReturning)\s*(?:<[^()]*>)?\s*\(/;

/**
 * Desestrutura o erro na mão (`const { error } = await …`, `const { error: x }`).
 * Aceito — mas é o padrão frágil: desestruturar e esquecer o `if (error)` logo
 * abaixo foi exatamente como o bug nasceu.
 */
const VIA_DESTRUCTURE = /\{[^{}]*\berror\b[^{}]*\}\s*=/;

function hasCheck(segment: string): boolean {
  return VIA_HELPER.test(segment) || VIA_DESTRUCTURE.test(segment);
}

/**
 * Aponta as escritas que não passam por nenhum portão de checagem.
 *
 * Estratégia: apaga comentários/strings, quebra o arquivo em instruções por `;`
 * e, em cada instrução que tenha `.from(` + método de escrita, exige a presença
 * de um marcador de checagem.
 */
export function findUncheckedWrites(source: string): UncheckedWrite[] {
  const blanked = blankCommentsAndStrings(source);
  const found: UncheckedWrite[] = [];

  let start = 0;
  for (let i = 0; i <= blanked.length; i++) {
    if (i !== blanked.length && blanked[i] !== ';') continue;
    const segment = blanked.slice(start, i);
    const segmentStart = start;
    start = i + 1;

    if (!segment.includes('.from(')) continue;
    const method = MUTATION_METHODS.find((m) => segment.includes(`.${m}(`));
    if (!method) continue;
    if (hasCheck(segment)) continue;

    const offset = segmentStart + segment.indexOf('.from(');
    const line = source.slice(0, offset).split('\n').length;
    const tableMatch = /\.from\(\s*["'`]([^"'`]+)["'`]/.exec(source.slice(offset, offset + 120));
    found.push({
      table: tableMatch?.[1] ?? '?',
      method,
      line,
      snippet: source.slice(offset, offset + 60).replace(/\s+/g, ' ').trim(),
    });
  }
  return found;
}
