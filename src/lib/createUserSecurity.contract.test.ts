import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(`${process.cwd()}/supabase/functions/create-user/index.ts`, 'utf8');
const employeesPage = readFileSync(`${process.cwd()}/src/pages/Employees.tsx`, 'utf8');
const employeeForm = readFileSync(`${process.cwd()}/src/components/employees/EmployeeFormDialog.tsx`, 'utf8');

describe('segurança da criação de acesso', () => {
  it('falha fechado sem empresa e restringe funcionário ao tenant do chamador', () => {
    expect(source).toContain('!callerCompanyId');
    expect(source.match(/\.eq\('company_id', callerCompanyId\)/g)?.length).toBeGreaterThanOrEqual(2);
    expect(source).toContain(".select('id, user_id')");
  });

  it('não permite super_admin e trata o vínculo como etapa crítica', () => {
    expect(source).toContain("new Set(['admin', 'gestor', 'tecnico', 'comercial', 'financeiro'])");
    expect(source).not.toContain("falha (não-fatal) ao vincular funcionário");
    expect(source).toContain('Não foi possível vincular o acesso ao funcionário da sua empresa.');
  });

  it('reconhece retry idempotente sem remover ou duplicar o vínculo', () => {
    expect(source).toContain('getUserById(targetEmployee.user_id)');
    expect(source).toContain('already_linked: true');
    expect(employeesPage).toContain('pendingCreatedEmployeeId');
    expect(employeesPage).toContain('id: pendingCreatedEmployeeId, ...employeeWriteData');
    expect(employeesPage).toContain("filter(([key]) => key !== 'user_id')");
  });

  it('mantém o modal aberto até o acesso terminar e concentra o fluxo na aba Acesso', () => {
    expect(employeesPage).toContain('await createAccess.mutateAsync');
    expect(employeesPage.indexOf('await createAccess.mutateAsync')).toBeLessThan(employeesPage.indexOf('setFormOpen(false)', employeesPage.indexOf('await createAccess.mutateAsync')));
    expect(employeeForm).toContain("const TAB_ACESSO = 'acesso'");
    expect(employeeForm).toContain('setActiveTab(TAB_ACESSO)');
    expect(employeeForm).toContain('PermissionsEditor');
    expect(employeeForm).toContain('Conclua a criação do acesso primeiro');
  });

  it('não devolve mensagens internas do banco ao usuário final', () => {
    expect(source).not.toContain('JSON.stringify({ error: createError.message })');
    expect(source).not.toContain("error: 'Unauthorized'");
    expect(source).not.toContain('Forbidden: requires');
  });
});
