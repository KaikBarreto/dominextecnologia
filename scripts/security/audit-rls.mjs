#!/usr/bin/env node

import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const IDENTIFIER = String.raw`(?:"(?:[^"]|"")*"|[a-zA-Z_][a-zA-Z0-9_$]*)`;
const RELATION = new RegExp(
  String.raw`^\s*(${IDENTIFIER})(?:\s*\.\s*(${IDENTIFIER}))?`,
);

export const SENSITIVE_TABLES = new Set([
  'profiles',
  'user_roles',
  'user_permissions',
  'admin_permissions',
  'active_sessions',
  'company_settings',
  'user_preferences',
  'company_modules',
  'companies',
  'usage_events',
  'self_registration_attempts',
  'salesperson_daily_activity',
]);

function unquoteIdentifier(identifier) {
  if (identifier.startsWith('"')) {
    return identifier.slice(1, -1).replace(/""/g, '"').toLowerCase();
  }

  return identifier.toLowerCase();
}

function parseRelation(sql) {
  const match = sql.match(RELATION);
  if (!match) return null;

  const schema = match[2] ? unquoteIdentifier(match[1]) : 'public';
  const table = unquoteIdentifier(match[2] ?? match[1]);

  return { schema, table, length: match[0].length };
}

function parsePolicyName(sql) {
  const match = sql.match(new RegExp(String.raw`^\s*(${IDENTIFIER})`));
  return match ? { name: unquoteIdentifier(match[1]), length: match[0].length } : null;
}

function policyRoles(statement) {
  const match = statement.match(
    /\bto\s+(.+?)(?=\s+using\b|\s+with\s+check\b|\s*$)/is,
  );

  if (!match) return ['public'];

  return match[1]
    .split(',')
    .map((role) => unquoteIdentifier(role.trim()))
    .filter(Boolean);
}

function isTriviallyTrue(statement, clause) {
  return new RegExp(String.raw`\b${clause}\s*\(\s*true\s*\)`, 'i').test(statement);
}

export function splitSqlStatements(sql, file = '<memory>') {
  const statements = [];
  let buffer = '';
  let state = 'normal';
  let dollarTag = '';
  let blockCommentDepth = 0;
  let line = 1;
  let startLine = 1;

  const emit = () => {
    const text = buffer.trim();
    if (text) statements.push({ text, file, line: startLine });
    buffer = '';
    startLine = line;
  };

  for (let index = 0; index < sql.length; index += 1) {
    const char = sql[index];
    const next = sql[index + 1];

    if (state === 'line-comment') {
      if (char === '\n') {
        buffer += '\n';
        line += 1;
        state = 'normal';
        if (!buffer.trim()) startLine = line;
      }
      continue;
    }

    if (state === 'block-comment') {
      if (char === '/' && next === '*') {
        blockCommentDepth += 1;
        index += 1;
      } else if (char === '*' && next === '/') {
        blockCommentDepth -= 1;
        index += 1;
        if (blockCommentDepth === 0) state = 'normal';
      } else if (char === '\n') {
        buffer += '\n';
        line += 1;
      }
      continue;
    }

    if (state === 'single-quote') {
      buffer += char;
      if (char === "'" && next === "'") {
        buffer += next;
        index += 1;
      } else if (char === "'") {
        state = 'normal';
      }
      if (char === '\n') line += 1;
      continue;
    }

    if (state === 'double-quote') {
      buffer += char;
      if (char === '"' && next === '"') {
        buffer += next;
        index += 1;
      } else if (char === '"') {
        state = 'normal';
      }
      if (char === '\n') line += 1;
      continue;
    }

    if (state === 'dollar-quote') {
      if (sql.startsWith(dollarTag, index)) {
        buffer += dollarTag;
        index += dollarTag.length - 1;
        state = 'normal';
        continue;
      }
      buffer += char;
      if (char === '\n') line += 1;
      continue;
    }

    if (char === '-' && next === '-') {
      state = 'line-comment';
      index += 1;
      continue;
    }
    if (char === '/' && next === '*') {
      state = 'block-comment';
      blockCommentDepth = 1;
      index += 1;
      continue;
    }
    if (char === "'") {
      state = 'single-quote';
      buffer += char;
      continue;
    }
    if (char === '"') {
      state = 'double-quote';
      buffer += char;
      continue;
    }
    if (char === '$') {
      const tag = sql.slice(index).match(/^\$[a-zA-Z_][a-zA-Z0-9_]*\$|^\$\$/)?.[0];
      if (tag) {
        state = 'dollar-quote';
        dollarTag = tag;
        buffer += tag;
        index += tag.length - 1;
        continue;
      }
    }
    if (char === ';') {
      emit();
      startLine = line;
      continue;
    }

    buffer += char;
    if (char === '\n') {
      line += 1;
      if (!buffer.trim()) startLine = line;
    }
  }

  emit();
  return statements;
}

function ensurePublicTable(tables, relation, statement) {
  if (!relation || relation.schema !== 'public') return null;

  if (!tables.has(relation.table)) {
    tables.set(relation.table, {
      name: relation.table,
      rlsEnabled: false,
      firstSeen: statement,
      lastRlsChange: null,
      anonSelectRevoked: false,
      lastAnonPrivilegeChange: null,
    });
  }

  return tables.get(relation.table);
}

function parsePolicyTarget(statement, action) {
  const prefix = new RegExp(String.raw`^\s*${action}\s+policy\s+`, 'i');
  const afterAction = statement.text
    .replace(prefix, '')
    .replace(/^\s*if\s+exists\s+/i, '');
  const policy = parsePolicyName(afterAction);
  if (!policy) return null;

  const afterName = afterAction.slice(policy.length);
  const onMatch = afterName.match(/^\s+on\s+(?:only\s+)?/i);
  if (!onMatch) return null;

  const relation = parseRelation(afterName.slice(onMatch[0].length));
  if (!relation) return null;

  return { name: policy.name, relation };
}

function policyKey(table, name) {
  return `${table}\0${name}`;
}

function applyStaticDynamicRlsLoop(statement, tables) {
  if (!/^\s*do\s+\$/i.test(statement.text)) return;

  const loop = statement.text.match(
    /foreach\s+([a-zA-Z_][a-zA-Z0-9_]*)\s+in\s+array\s+([a-zA-Z_][a-zA-Z0-9_]*)\s+loop/i,
  );
  if (!loop) return;

  const variable = loop[1];
  const arrayVariable = loop[2];
  const arrayDeclaration = statement.text.match(
    new RegExp(
      String.raw`\b${arrayVariable}\s+text\s*\[\s*\]\s*:=\s*array\s*\[([\s\S]*?)\]\s*;`,
      'i',
    ),
  );
  if (!arrayDeclaration) return;

  const enablePattern = new RegExp(
    String.raw`execute\s+format\s*\(\s*'alter\s+table\s+public\.%i\s+enable\s+row\s+level\s+security;?'\s*,\s*${variable}\s*\)`,
    'i',
  );
  if (!enablePattern.test(statement.text)) return;

  const names = [...arrayDeclaration[1].matchAll(/'((?:[^']|'')+)'/g)].map((match) =>
    match[1].replace(/''/g, "'").toLowerCase(),
  );

  for (const name of names) {
    const table = ensurePublicTable(
      tables,
      { schema: 'public', table: name },
      statement,
    );
    table.rlsEnabled = true;
    table.lastRlsChange = statement;
  }
}

function applyStaticDropAllPolicies(statement, policies) {
  if (!/^\s*do\s+\$/i.test(statement.text)) return;
  if (!/\bfrom\s+pg_policies\b/i.test(statement.text)) return;
  if (!/drop\s+policy\s+%i\s+on\s+%i\.%i/i.test(statement.text)) return;

  const targetList = statement.text.match(
    /tablename\s*=\s*any\s*\(\s*array\s*\[([\s\S]*?)\]\s*\)/i,
  );
  if (!targetList) return;

  const tables = [...targetList[1].matchAll(/'((?:[^']|'')+)'/g)].map((match) =>
    match[1].replace(/''/g, "'").toLowerCase(),
  );

  for (const table of tables) {
    for (const key of policies.keys()) {
      if (key.startsWith(`${table}\0`)) policies.delete(key);
    }
  }
}

function applyAnonTablePrivilege(statement, tables) {
  const privilege = statement.text.match(
    /^\s*(grant|revoke)\s+([\s\S]+?)\s+on\s+([\s\S]+?)\s+(to|from)\s+([\s\S]+)$/i,
  );
  if (!privilege) return;

  const action = privilege[1].toLowerCase();
  const privileges = privilege[2]
    .replace(/\bprivileges\b/gi, '')
    .split(',')
    .map((value) => value.trim().toLowerCase());
  if (!privileges.some((value) => value === 'all' || value === 'select')) return;

  const roles = privilege[5]
    .split(',')
    .map((role) => unquoteIdentifier(role.trim().replace(/;$/, '')));
  if (!roles.some((role) => role === 'anon' || role === 'public')) return;

  let target = privilege[3].trim().replace(/^table\s+/i, '');
  const allPublicTables = /^all\s+tables\s+in\s+schema\s+public$/i.test(target);
  const affectedTables = [];

  if (allPublicTables) {
    affectedTables.push(
      ...[...tables.values()].filter((table) => SENSITIVE_TABLES.has(table.name)),
    );
  } else {
    for (const rawRelation of target.split(',')) {
      const relation = parseRelation(rawRelation);
      if (!relation || !SENSITIVE_TABLES.has(relation.table)) continue;
      const table = ensurePublicTable(tables, relation, statement);
      if (table) affectedTables.push(table);
    }
  }

  for (const table of affectedTables) {
    table.anonSelectRevoked = action === 'revoke';
    table.lastAnonPrivilegeChange = statement;
  }
}

export function auditStatements(statements) {
  const tables = new Map();
  const policies = new Map();

  for (const statement of statements) {
    const sql = statement.text;

    // Algumas migrations do repo aplicam a mesma protecao a uma lista estatica
    // de tabelas via FOREACH + format('%I'). Expandimos apenas esse molde exato.
    applyStaticDynamicRlsLoop(statement, tables);
    applyStaticDropAllPolicies(statement, policies);
    applyAnonTablePrivilege(statement, tables);

    const createTable = sql.match(
      /^\s*create\s+(?:unlogged\s+)?table\s+(if\s+not\s+exists\s+)?/i,
    );
    if (createTable) {
      const relation = parseRelation(sql.slice(createTable[0].length));
      if (relation?.schema === 'public') {
        const existed = tables.has(relation.table);
        const table = ensurePublicTable(tables, relation, statement);
        if (!existed || !createTable[1]) {
          table.rlsEnabled = false;
          table.firstSeen = statement;
          table.lastRlsChange = null;
        }
      }
      continue;
    }

    const dropTable = sql.match(/^\s*drop\s+table\s+(?:if\s+exists\s+)?/i);
    if (dropTable) {
      const relation = parseRelation(sql.slice(dropTable[0].length));
      if (relation?.schema === 'public') {
        tables.delete(relation.table);
        for (const key of policies.keys()) {
          if (key.startsWith(`${relation.table}\0`)) policies.delete(key);
        }
      }
      continue;
    }

    const alterTable = sql.match(
      /^\s*alter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?/i,
    );
    if (alterTable) {
      const remainder = sql.slice(alterTable[0].length);
      const relation = parseRelation(remainder);
      const table = ensurePublicTable(tables, relation, statement);
      if (!table) continue;

      const operation = remainder.slice(relation.length);
      if (/\benable\s+row\s+level\s+security\b/i.test(operation)) {
        table.rlsEnabled = true;
        table.lastRlsChange = statement;
      }
      if (/\bdisable\s+row\s+level\s+security\b/i.test(operation)) {
        table.rlsEnabled = false;
        table.lastRlsChange = statement;
      }
      continue;
    }

    const createPolicy = parsePolicyTarget(statement, 'create');
    if (createPolicy?.relation.schema === 'public') {
      policies.set(policyKey(createPolicy.relation.table, createPolicy.name), {
        ...createPolicy,
        roles: policyRoles(sql),
        usingTrue: isTriviallyTrue(sql, 'using'),
        checkTrue: isTriviallyTrue(sql, String.raw`with\s+check`),
        statement,
      });
      continue;
    }

    const dropPolicy = parsePolicyTarget(statement, 'drop');
    if (dropPolicy?.relation.schema === 'public') {
      policies.delete(policyKey(dropPolicy.relation.table, dropPolicy.name));
      continue;
    }

    const alterPolicy = parsePolicyTarget(statement, 'alter');
    if (alterPolicy?.relation.schema === 'public') {
      const key = policyKey(alterPolicy.relation.table, alterPolicy.name);
      const existing = policies.get(key) ?? {
        ...alterPolicy,
        roles: ['public'],
        usingTrue: false,
        checkTrue: false,
      };
      policies.set(key, {
        ...existing,
        roles: /\bto\b/i.test(sql) ? policyRoles(sql) : existing.roles,
        usingTrue: /\busing\b/i.test(sql)
          ? isTriviallyTrue(sql, 'using')
          : existing.usingTrue,
        checkTrue: /\bwith\s+check\b/i.test(sql)
          ? isTriviallyTrue(sql, String.raw`with\s+check`)
          : existing.checkTrue,
        statement,
      });
    }
  }

  const findings = [];

  for (const table of tables.values()) {
    if (!table.rlsEnabled) {
      const location = table.lastRlsChange ?? table.firstSeen;
      findings.push({
        code: 'RLS_DISABLED',
        table: table.name,
        file: location.file,
        line: location.line,
        message: `public.${table.name} termina as migrations sem RLS habilitado`,
      });
    }


    if (SENSITIVE_TABLES.has(table.name) && !table.anonSelectRevoked) {
      const location = table.lastAnonPrivilegeChange ?? table.firstSeen;
      findings.push({
        code: 'SENSITIVE_ANON_SELECT_NOT_REVOKED',
        table: table.name,
        file: location.file,
        line: location.line,
        message: `public.${table.name} nao termina com SELECT explicitamente revogado de anon`,
      });
    }
  }

  for (const policy of policies.values()) {
    if (!SENSITIVE_TABLES.has(policy.relation.table)) continue;

    const hasPublicAccess =
      policy.roles.includes('anon') || policy.roles.includes('public');
    const serviceRoleOnly = policy.roles.every((role) => role === 'service_role');

    if (hasPublicAccess) {
      findings.push({
        code: 'SENSITIVE_PUBLIC_POLICY',
        table: policy.relation.table,
        file: policy.statement.file,
        line: policy.statement.line,
        message: `policy "${policy.name}" se aplica a anon/PUBLIC`,
      });
    }

    if ((policy.usingTrue || policy.checkTrue) && !serviceRoleOnly) {
      findings.push({
        code: 'SENSITIVE_TRIVIAL_POLICY',
        table: policy.relation.table,
        file: policy.statement.file,
        line: policy.statement.line,
        message: `policy "${policy.name}" usa predicado incondicional true`,
      });
    }
  }

  findings.sort((left, right) =>
    `${left.file}:${left.line}:${left.code}`.localeCompare(
      `${right.file}:${right.line}:${right.code}`,
    ),
  );

  return { findings, tables, policies };
}

export async function auditMigrationDirectory(migrationsDirectory) {
  const files = (await readdir(migrationsDirectory))
    .filter((file) => file.endsWith('.sql'))
    .sort();
  const statements = [];

  for (const file of files) {
    const absolutePath = path.join(migrationsDirectory, file);
    const sql = await readFile(absolutePath, 'utf8');
    statements.push(...splitSqlStatements(sql, path.relative(process.cwd(), absolutePath)));
  }

  return { ...auditStatements(statements), files };
}

async function main() {
  const migrationsDirectory = path.resolve(process.cwd(), 'supabase/migrations');
  const result = await auditMigrationDirectory(migrationsDirectory);

  if (result.findings.length > 0) {
    console.error('Auditoria de RLS reprovada:\n');
    for (const finding of result.findings) {
      console.error(
        `- [${finding.code}] ${finding.file}:${finding.line} — ${finding.message}`,
      );
    }
    console.error(
      '\nCorrija a migration ou revise explicitamente a excecao estreita no auditor.',
    );
    process.exitCode = 1;
    return;
  }

  console.log(
    `Auditoria de RLS aprovada: ${result.files.length} migrations, ` +
      `${result.tables.size} tabelas public e ${SENSITIVE_TABLES.size} tabelas sensiveis protegidas.`,
  );
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  await main();
}
