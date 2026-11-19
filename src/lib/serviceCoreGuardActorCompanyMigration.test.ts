import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20261119120000_service_core_guard_fill_actor_company.sql'),
  'utf8',
);

const FILLED_TABLES = [
  'company_pmoc_document_templates',
  'contract_attachments',
  'contracts',
  'equipment',
  'form_templates',
  'os_statuses',
  'pmoc_contract_documents_custom',
  'pmoc_documents',
  'quotes',
  'responsible_technicians',
  'service_orders',
  'service_types',
  'task_types',
];

describe('guard de Serviços preenche a empresa do ator antes de validar', () => {
  it('só troca a função, sem DDL de tabela nem recriar gatilho', () => {
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.guard_service_business_core_v1()');
    const code = sql.replace(/--.*$/gm, '');
    expect(code).not.toMatch(/ALTER\s+TABLE/i);
    expect(code).not.toMatch(/CREATE\s+TRIGGER/i);
    expect(code).not.toMatch(/DROP\s+TRIGGER/i);
    expect(sql).toContain('SECURITY DEFINER SET search_path=pg_catalog,public');
    expect(sql).toContain(
      'REVOKE ALL ON FUNCTION public.guard_service_business_core_v1() FROM PUBLIC,anon,authenticated,service_role;',
    );
  });

  it('preenche company_id nulo em INSERT com a empresa do ator, antes de resolver a empresa', () => {
    const fill = sql.indexOf('NEW.company_id:=public.get_user_company_id(auth.uid());');
    const resolveNew = sql.indexOf(
      'v_company:=public.service_core_row_company_internal_v1(to_jsonb(NEW),TG_TABLE_NAME,false);',
    );
    const bypass = sql.indexOf("IF auth.role()='service_role' OR");
    expect(fill).toBeGreaterThan(-1);
    expect(resolveNew).toBeGreaterThan(fill);
    expect(fill).toBeGreaterThan(bypass);
    expect(sql).toContain("IF TG_OP='INSERT' AND auth.uid() IS NOT NULL");
    // Nunca sobrescreve company_id enviado explicitamente.
    expect(sql).toContain('IF NEW.company_id IS NULL THEN');
  });

  it('limita o preenchimento às tabelas com gatilho próprio de empresa e usa IF aninhado', () => {
    for (const table of FILLED_TABLES) expect(sql).toContain(`'${table}'`);
    // Tabelas filhas tiram a empresa do pai: não entram na lista.
    const list = sql.slice(sql.indexOf("AND TG_TABLE_NAME IN ('company_pmoc"), sql.indexOf('IF NEW.company_id IS NULL'));
    for (const child of ['quote_items', 'service_order_materials', 'form_questions', 'contract_items']) {
      expect(list).not.toContain(`'${child}'`);
    }
    // NEW.company_id não pode ser avaliado no mesmo AND da lista (42703 em tabela sem a coluna).
    expect(list).not.toContain('NEW.company_id');
  });

  it('mantém a validação de empresa do ator e de módulo/assinatura depois do preenchimento', () => {
    const fill = sql.indexOf('NEW.company_id:=public.get_user_company_id(auth.uid());');
    const denied = sql.lastIndexOf('code=service_business_core_company_denied');
    const module = sql.lastIndexOf('code=business_core_module_not_contracted');
    expect(denied).toBeGreaterThan(fill);
    expect(module).toBeGreaterThan(fill);
    expect(sql).toContain('code=service_business_core_actor_inactive');
  });
});
