import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  'src/components/contracts/ContractFormDialog.tsx',
  'utf8',
);

describe('ContractFormDialog — estrutura do wizard', () => {
  it('mantém altura estável, rodapé externo e resumo contextual', () => {
    expect(source).toContain('sm:h-[90vh] sm:max-h-[90vh] sm:w-[96vw] sm:max-w-[1240px]');
    expect(source).toContain('drawerClassName="h-[90dvh]"');
    expect(source).toContain('footer={wizardFooter}');
    expect(source).toContain('xl:grid-cols-[minmax(0,1fr)_248px]');
    expect(source).toContain('aria-label="Resumo do contrato"');
  });

  it('não trunca os nomes das etapas e usa resumo compacto no mobile', () => {
    expect(source).toContain('ariaLabel="Etapas do contrato"');
    expect(source).toContain('Etapa {step + 1} de {STEPS.length}');
    expect(source).toContain('<FormWizardStepper');
    expect(source).not.toContain("'text-xs hidden sm:inline truncate text-left'");
  });

  it('agrupa criação em cinco decisões e mantém Portal somente na edição', () => {
    expect(source).toContain("info: 'Dados do contrato'");
    expect(source).toContain("items: 'Escopo técnico'");
    expect(source).toContain("frequency: 'Agenda'");
    expect(source).toContain("team: 'Operação e cobrança'");
    expect(source).not.toContain("{ key: 'unit'");
    expect(source).not.toContain("{ key: 'finance'");
    expect(source).toContain("isEditing ? [{ key: 'portal', label: 'Portal' }] : []");
    expect(source).toContain("{isPmoc && pmocUnitSection}");
    expect(source).toContain("currentStepKey === 'team' && !isEditing");
  });

  it('restaura rascunho por chave e mantém a revisão sem card decorativo', () => {
    expect(source).toContain('step: number; stepKey?: string;');
    expect(source).toContain('stepKey: currentStepKey');
    expect(source).toContain("requestedKey === 'unit'");
    expect(source).toContain("requestedKey === 'finance'");
    expect(source).toContain("{currentStepKey === 'review' && (\n            <div className=\"space-y-4\">");
    expect(source).toContain('<WizardReviewChecklist items={contractReviewItems} onEdit={setStep} />');
    expect(source).toContain('<WizardMobileSummary');
    expect(source).toContain('divide-y border-y');
    expect(source).toContain('aria-disabled={!canNext()}');
    expect(source).toContain('data-contract-validation="customer"');
  });

  it('mantém o escopo e a agenda compactos sem duplicar ações', () => {
    expect(source).not.toContain('action={{ label: t.items.addEnvButton, onClick: addEnvironment }}');
    expect(source).toContain('data-contract-guidance="pmoc-cadence"');
    expect(source).not.toContain('<NoticeBanner variant="info" icon={ShieldCheck} title={t.frequency.pmocCadenceAlertTitle}>');
  });
});
