import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  'src/components/service-orders/ServiceOrderFormDialog.tsx',
  'utf8',
);

describe('ServiceOrderFormDialog — contrato do wizard', () => {
  it('mantém o payload operacional ao adicionar a etapa de revisão', () => {
    for (const field of [
      'service_type_ids',
      'budget_items',
      'schedule_plan',
      'equipment_items',
      'assignee_user_ids',
      'assignee_team_ids',
      'require_tech_signature',
      'require_client_signature',
      'generate_nps_survey',
      'recurrence_weekdays',
      'service_address',
    ]) {
      expect(source).toContain(field);
    }
    expect(source).toContain('await onSubmit(cleanedData)');
    expect(source).toContain("{ key: 'review' as const, label: 'Revisão' }");
    expect(source).toContain('if (isLastStep) handleCreateSubmit()');
    expect(source).toContain('if (isLastStep) form.handleSubmit(handleEditSubmit)()');
  });

  it('organiza o fluxo em quatro etapas com orçamento no atendimento e escopo na revisão', () => {
    expect(source).toContain("{ key: 'client' as const, label: t.stepClient }");
    expect(source).not.toContain("{ key: 'budget' as const, label: t.stepBudget }");
    expect(source).toContain("{ key: 'equipment' as const, label: t.stepEquipment }");
    expect(source).toContain("{ key: 'details' as const, label: t.stepDetails }");
    expect(source.match(/currentStepKey === 'client'/g)).toHaveLength(3);
    expect(source.match(/<ServiceOrderBudgetSection/g)).toHaveLength(2);
    expect(source.match(/<div className="border-t pt-5">\{scopeSummary\}<\/div>/g)).toHaveLength(2);
  });

  it('expõe e hidrata as preferências de conclusão da OS', () => {
    expect(source).toContain('setRequireTechSignature(Boolean(so?.require_tech_signature))');
    expect(source).toContain('setRequireClientSignature(Boolean(so?.require_client_signature))');
    expect(source).toContain('aria-label={t.requireTechSignatureLabel}');
    expect(source).toContain('aria-label={t.requireClientSignatureLabel}');
    expect(source).toContain('aria-label={t.npsLabel}');
  });

  it('usa modal estável, rodapé externo e resumo responsivo', () => {
    expect(source).toContain('sm:h-[88vh] sm:max-h-[88vh] sm:w-[96vw] sm:max-w-[1180px]');
    expect(source.match(/drawerClassName="h-\[90dvh\]"/g)).toHaveLength(2);
    expect(source).toContain('footer={editFooter}');
    expect(source).toContain('footer={createFooter}');
    expect(source).toContain('xl:grid-cols-[minmax(0,1fr)_288px]');
    expect(source.match(/showDesktopSummary && \(/g)).toHaveLength(2);
    expect(source).toContain("const showDesktopSummary = currentStepKey !== 'review'");
    expect(source).toContain('sticky top-0 z-20');
  });

  it('mantém a revisão acionável e a validação acessível sem duplicar o resumo', () => {
    expect(source.match(/<WizardReviewChecklist/g)).toHaveLength(2);
    expect(source.match(/<WizardMobileSummary/g)).toHaveLength(2);
    expect(source).not.toContain('<ServiceOrderFormSummary data={formSummaryData} mode="review" />');
    expect(source.match(/aria-disabled={!canGoNext\(\)}/g)).toHaveLength(2);
    expect(source).toContain('data-os-validation="customer"');
    expect(source).toContain('data-os-validation="adhoc-name"');
  });
});
