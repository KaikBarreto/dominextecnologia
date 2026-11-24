import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync('src/hooks/useContracts.ts', 'utf8');

describe('useContracts — guardas das visitas personalizadas', () => {
  it('renova o contrato pela referência e não pela data operacional reagendada', () => {
    const renewal = source.slice(source.indexOf('const renewContract = useMutation'), source.indexOf('const deleteContractMutation'));
    expect(renewal).toContain(".select('scheduled_date, origin, contract_reference_date, contract_visit_customized_at')");
    expect(renewal).toContain('o.contract_reference_date ?? o.scheduled_date');
    expect(renewal).toContain("o.origin === 'contract' || (!!o.contract_reference_date && !!o.contract_visit_customized_at)");
  });

  it('limpa metadados contratuais ao preservar uma OS passada como avulsa', () => {
    // A exclusão de contrato virou tudo-ou-nada no banco (delete_contract_cascade):
    // a regra de desvincular a OS passada mora na migration.
    const rpc = readFileSync('supabase/migrations/20261121150000_delete_cascade_rpcs_transacionais.sql', 'utf8');
    expect(rpc).toMatch(/contract_reference_date = NULL,\s+contract_visit_customized_at = NULL/);
    expect(source).toContain("supabase.rpc('delete_contract_cascade', { p_contract_id: id, p_today: todayStr })");
  });

  it('usa somente a RPC transacional para persistir visitas contratuais', () => {
    const orchestration = source.slice(
      source.indexOf('export async function regenerateContractVisitsAtomic'),
      source.indexOf('async function deleteRegenerableOrders'),
    );
    expect(orchestration).toContain("a.rpc('regenerate_contract_visits_with_override'");
    expect(orchestration).toContain('assertAllVisitsPersisted(createdCount, a.expectedOsCount)');
    expect(orchestration).not.toContain('fallback');
  });

  it('não usa flag de rollout nem chama o regenerador legado nos fluxos do contrato', () => {
    const hook = source.slice(source.indexOf('export function useContracts()'));
    expect(hook).not.toContain('useFeatureFlag');
    expect(hook).not.toContain('isFlagEnabledFor');
    expect(hook).not.toContain('regenerateFutureVisits({');
  });
});
