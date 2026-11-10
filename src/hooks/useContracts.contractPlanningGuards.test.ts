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
    expect(source).toContain('contract_id: null,\n        contract_reference_date: null,\n        contract_visit_customized_at: null');
  });

  it('não cai no fluxo não atômico quando a RPC transacional está habilitada', () => {
    const orchestration = source.slice(
      source.indexOf('export async function regenerateViaRpcOrFallback'),
      source.indexOf('async function deleteRegenerableOrders'),
    );
    expect(orchestration).toContain('if (!a.enabled) return a.fallback()');
    expect(orchestration).not.toContain('catch');
    expect(orchestration).not.toContain('return a.fallback();\n  } catch');
  });
});
