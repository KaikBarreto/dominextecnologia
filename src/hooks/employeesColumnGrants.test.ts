// ─────────────────────────────────────────────────────────────────────────────
// Trava de regressão da leitura de RH em `employees` (fase B, 21/11/2026).
//
// Depois da migration 20261122090000 o banco só concede SELECT a
// `authenticated` nas colunas listadas no GRANT dela. Qualquer leitura de
// `employees` no front que peça `*`, coluna fora da lista ou que devolva a
// linha inteira (`.insert(...).select()`), FALHA a consulta inteira em
// produção. Um embed `employees(...)` com coluna sensível derruba a tela que o
// embute (foi o caso da lista do Financeiro com `salary`).
//
// Este teste lê a lista concedida direto da migration (fonte da verdade) e
// varre `src/` atrás de:
//   1. `.from('employees')` seguido de `.select(...)`: só colunas concedidas.
//   2. `.from('employees')` com `.insert(`/`.update(`/`.upsert(` seguido de
//      `.select(` sem argumento (devolve a linha inteira).
//   3. Embeds `employees(...)` / `alias:employees(...)` / `employees!fk(...)`
//      em qualquer string: só colunas concedidas, nunca `*`.
//   4. A constante EMPLOYEE_PUBLIC_COLUMNS do hook bate com o GRANT.
// ─────────────────────────────────────────────────────────────────────────────
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  EMPLOYEE_PUBLIC_COLUMNS,
  EMPLOYEE_PUBLIC_SELECT,
  EMPLOYEE_SENSITIVE_COLUMNS,
} from './useEmployees';

const ROOT = process.cwd();
const MIGRATION = join(ROOT, 'supabase/migrations/20261122090000_employees_leitura_rh_fase_b2_revoga_colunas.sql');

function grantedColumns(): Set<string> {
  const sql = readFileSync(MIGRATION, 'utf8');
  // Ancorado no começo da linha: o cabeçalho da migration cita "GRANT SELECT
  // (col)" em comentário, que não é o comando.
  const match = sql.match(/^GRANT\s+SELECT\s*\(([^)]*)\)\s*ON\s+public\.employees\s+TO\s+authenticated/im);
  if (!match) throw new Error('GRANT SELECT (...) ON public.employees não encontrado na migration da fase B2');
  return new Set(match[1].split(',').map((c) => c.trim()).filter(Boolean));
}

function listSourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (entry === 'node_modules' || entry === 'TMP') continue;
      listSourceFiles(full, out);
    } else if (/\.(ts|tsx)$/.test(entry) && !/\.test\.(ts|tsx)$/.test(entry) && !full.endsWith('integrations/supabase/types.ts')) {
      out.push(full);
    }
  }
  return out;
}

/** Colunas de uma lista de select do PostgREST (ignora embeds aninhados de outras tabelas). */
function parseColumns(list: string): string[] {
  const cols: string[] = [];
  let depth = 0;
  let current = '';
  for (const ch of list) {
    if (ch === '(') depth += 1;
    if (ch === ')') depth -= 1;
    if (ch === ',' && depth === 0) {
      cols.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  cols.push(current);
  return cols
    .map((c) => c.trim())
    .filter(Boolean)
    // Embed aninhado (`tabela(...)`) é de outra tabela: não é coluna de employees.
    .filter((c) => !c.includes('('))
    // `alias:coluna` e `coluna::cast` → nome real da coluna.
    .map((c) => c.split('::')[0])
    .map((c) => (c.includes(':') ? c.split(':').pop()!.trim() : c));
}

/** Resolve o argumento do `.select(...)`: literal de string ou a constante pública. */
function resolveSelectArg(arg: string): string | null {
  const trimmed = arg.trim();
  if (trimmed === '') return '';
  if (trimmed === 'EMPLOYEE_PUBLIC_SELECT') return EMPLOYEE_PUBLIC_SELECT;
  const literal = trimmed.match(/^(['"`])([\s\S]*)\1$/);
  if (literal && !literal[2].includes('${')) return literal[2];
  return null;
}

interface Finding { file: string; line: number; problem: string }

/**
 * Apaga comentários mantendo as quebras de linha (números de linha batem).
 * `//` só conta como comentário no começo da linha ou depois de espaço, para
 * não comer `https://` dentro de string.
 */
function stripComments(source: string): string {
  const blank = (text: string) => text.replace(/[^\n]/g, ' ');
  return source
    .replace(/\/\*[\s\S]*?\*\//g, blank)
    .replace(/(^|\s)\/\/[^\n]*/g, (m, lead: string) => lead + blank(m.slice(lead.length)));
}

function lineOf(source: string, index: number): number {
  return source.slice(0, index).split('\n').length;
}

function scan(): Finding[] {
  const granted = grantedColumns();
  const findings: Finding[] = [];
  for (const file of listSourceFiles(join(ROOT, 'src'))) {
    findings.push(...scanSource(relative(ROOT, file), readFileSync(file, 'utf8'), granted));
  }
  return findings;
}

function scanSource(rel: string, rawSource: string, granted: Set<string>): Finding[] {
  const findings: Finding[] = [];
  {
    const source = stripComments(rawSource);

    // 1 e 2: chamadas encadeadas a partir de .from('employees').
    const fromRe = /\.from\(\s*['"`]employees['"`]\s*\)/g;
    for (let m = fromRe.exec(source); m; m = fromRe.exec(source)) {
      // A cadeia termina no fim da instrução (`;`) ou no próximo `.from(`.
      const rest = source.slice(m.index + m[0].length);
      const stop = rest.search(/;|\.from\(/);
      const chain = stop === -1 ? rest : rest.slice(0, stop);
      const isWrite = /^\s*\.(insert|update|upsert)\(/.test(chain);
      const selectRe = /\.select\(([^)]*)\)/g;
      for (let s = selectRe.exec(chain); s; s = selectRe.exec(chain)) {
        const line = lineOf(source, m.index + m[0].length + s.index);
        const resolved = resolveSelectArg(s[1].split(/,\s*\{/)[0]);
        if (resolved === null) {
          findings.push({ file: rel, line, problem: `select de employees com argumento não literal: ${s[1].trim()}` });
          continue;
        }
        if (resolved === '' || resolved.trim() === '*') {
          findings.push({ file: rel, line, problem: isWrite ? 'insert/update de employees com .select() devolvendo a linha inteira' : 'select("*") em employees' });
          continue;
        }
        for (const col of parseColumns(resolved)) {
          if (!granted.has(col)) findings.push({ file: rel, line, problem: `coluna sem GRANT em employees: ${col}` });
        }
      }
    }

    // 1b: helpers genéricos do export (fetchAllPaged / loadLabelMap) com a
    // tabela 'employees' e as colunas como literal (concatenado ou não).
    // fetchAllPaged junta literais com `+`; loadLabelMap separa por vírgula.
    const helperRe = /\b(fetchAllPaged|loadLabelMap)\(\s*['"`]employees['"`]\s*,((?:\s*['"`][^'"`]*['"`]\s*[+,]?)+)/g;
    for (let h = helperRe.exec(source); h; h = helperRe.exec(source)) {
      const line = lineOf(source, h.index);
      const literals = [...h[2].matchAll(/['"`]([^'"`]*)['"`]/g)].map((x) => x[1]);
      // loadLabelMap(tabela, idColumn, labelColumn): cada literal é uma coluna.
      const columns = h[1] === 'loadLabelMap' ? literals : parseColumns(literals.join(''));
      for (const col of columns) {
        if (col === '*' || !granted.has(col)) findings.push({ file: rel, line, problem: `coluna sem GRANT em employees: ${col}` });
      }
    }

    // 3: embeds employees(...) dentro de strings de select de outras tabelas.
    const embedRe = /(?:^|[\s,`'"(:])employees(?:![\w]+)?\s*\(([^()]*(?:\([^()]*\)[^()]*)*)\)/g;
    for (let e = embedRe.exec(source); e; e = embedRe.exec(source)) {
      // Ignora chamadas de função JS (`employees(` precedido de identificador já
      // é excluído pela regex) e argumentos de código que não parecem colunas.
      const inner = e[1];
      if (/[=;{}]/.test(inner)) continue;
      const line = lineOf(source, e.index);
      if (inner.trim() === '*' || inner.trim() === '') {
        findings.push({ file: rel, line, problem: 'embed employees(*) ou vazio' });
        continue;
      }
      for (const col of parseColumns(inner)) {
        if (!granted.has(col)) findings.push({ file: rel, line, problem: `embed employees(...) com coluna sem GRANT: ${col}` });
      }
    }
  }
  return findings;
}

describe('employees: leitura só das colunas concedidas pela fase B2', () => {
  it('a migration concede exatamente as 17 colunas não sensíveis', () => {
    const granted = grantedColumns();
    expect(granted.size).toBe(17);
    expect([...granted].sort()).toEqual([...EMPLOYEE_PUBLIC_COLUMNS].sort());
    for (const col of EMPLOYEE_SENSITIVE_COLUMNS) expect(granted.has(col)).toBe(false);
  });

  it('EMPLOYEE_PUBLIC_SELECT pede exatamente as colunas públicas', () => {
    expect(parseColumns(EMPLOYEE_PUBLIC_SELECT).sort()).toEqual([...EMPLOYEE_PUBLIC_COLUMNS].sort());
  });

  it('nenhum select/embed de employees em src/ pede coluna sensível, * ou a linha inteira', () => {
    const findings = scan();
    expect(findings.map((f) => `${f.file}:${f.line} ${f.problem}`)).toEqual([]);
  });

  it('o detector pega as regressões que derrubariam produção (código de antes da fase B)', () => {
    const granted = grantedColumns();
    const problems = (code: string) => scanSource('x.ts', code, granted).map((f) => f.problem);

    // useEmployees antigo
    expect(problems("supabase\n  .from('employees')\n  .select('*')\n  .order('name');")).toEqual(['select("*") em employees']);
    expect(problems("await supabase.from('employees').insert({ a: 1 }).select().single();"))
      .toEqual(['insert/update de employees com .select() devolvendo a linha inteira']);
    expect(problems("await supabase.from('employees').update(x).eq('id', id).select().single();"))
      .toEqual(['insert/update de employees com .select() devolvendo a linha inteira']);
    // useFinancial antigo
    expect(problems("supabase.from('financial_transactions').select(`*, employee:employees(id, name, salary, photo_url)`)"))
      .toEqual(['embed employees(...) com coluna sem GRANT: salary']);
    expect(problems("x.select('*, employees!fk(*)')")).toEqual(['embed employees(*) ou vazio']);
    // export antigo (argumento em outra chamada não passa pelo .from literal,
    // mas coluna sensível literal no select direto é pega)
    expect(problems("supabase.from('employees').select('id, cpf, pix_key')"))
      .toEqual(['coluna sem GRANT em employees: cpf', 'coluna sem GRANT em employees: pix_key']);
    expect(problems("const rows = await fetchAllPaged(\n  'employees',\n  'id, name, cpf, ' +\n    'salary, created_at',\n  { orderBy: ['name'] });"))
      .toEqual(['coluna sem GRANT em employees: cpf', 'coluna sem GRANT em employees: salary']);
    expect(problems("loadLabelMap('employees', 'id', 'salary')")).toEqual(['coluna sem GRANT em employees: salary']);
    expect(problems("loadLabelMap('employees', 'id', 'name')")).toEqual([]);
    // Argumento dinâmico não passa calado.
    expect(problems("supabase.from('employees').select(cols)")).toEqual(['select de employees com argumento não literal: cols']);

    // O que é permitido
    expect(problems("supabase.from('employees').select('id, name, photo_url').eq('id', 1);")).toEqual([]);
    expect(problems("supabase.from('employees').select(EMPLOYEE_PUBLIC_SELECT).in('id', ids);")).toEqual([]);
    expect(problems("supabase.from('employees').update(x, { count: 'exact' }).eq('id', id);")).toEqual([]);
    expect(problems("x.select('*, employee:employees(id, name, photo_url)')")).toEqual([]);
  });

  it('o parser de colunas e de comentários funciona', () => {
    // Sanidade do próprio parser: os casos reais que existiam antes da fase B.
    expect(parseColumns('id, name, salary, photo_url')).toContain('salary');
    expect(parseColumns('*, employee:employees(id)')).toEqual(['*']);
    expect(parseColumns('id, nome:name, cpf::text')).toEqual(['id', 'name', 'cpf']);
    expect(resolveSelectArg('')).toBe('');
    expect(resolveSelectArg("'*'")).toBe('*');
    expect(resolveSelectArg('cols')).toBeNull();
    expect(stripComments('a // employees(salary)\nb')).toBe('a                     \nb');
    expect(stripComments("x('https://a')")).toBe("x('https://a')");
  });
});
