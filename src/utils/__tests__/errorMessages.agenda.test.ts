import { describe, expect, it } from 'vitest';
import { getErrorMessage } from '../errorMessages';

describe('erros da agenda', () => {
  it.each([
    ['P0001', 'schedule_resource_not_in_tenant', 'Um dos responsáveis desta OS não está mais ativo na empresa. Atualize a atribuição e tente novamente.'],
    ['P0001', 'schedule_equipment_not_found', 'Um dos equipamentos desta OS não está mais disponível. Atualize a seleção e tente novamente.'],
    ['22023', 'schedule_invalid_equipment_items', 'Não foi possível validar os equipamentos e checklists desta OS. Atualize a seleção e tente novamente.'],
    ['42501', 'schedule_override_permission_denied', 'Você não tem permissão para autorizar conflitos de agenda.'],
    ['42501', 'schedule_tenant_not_entitled', 'O acesso da empresa não está ativo para esta operação. Verifique a assinatura ou fale com o suporte.'],
    ['22023', 'schedule_invalid_duration', 'A duração do atendimento deve ficar entre 15 minutos e 8 horas.'],
    ['P0001', 'schedule_company_timezone_invalid', 'O fuso horário da empresa está inválido. Ajuste-o nas configurações antes de agendar.'],
    ['P0001', 'schedule_team_without_active_members', 'A equipe selecionada não possui integrantes ativos. Escolha outra equipe ou adicione um integrante.'],
  ])('traduz %s/%s sem expor codigo interno', (code, internalMessage, expected) => {
    const message = getErrorMessage({ code, message: internalMessage });

    expect(message).toBe(expected);
    expect(message).not.toContain('schedule_');
    expect(message).not.toContain(code);
  });

  it('tambem traduz codigo interno recebido como Error', () => {
    expect(getErrorMessage(new Error('schedule_form_template_not_found | P0001')))
      .toBe('Um dos checklists selecionados não está mais disponível. Atualize a seleção e tente novamente.');
  });

  it.each([
    'public_api_schedule_conflict',
    'schedule_conflict',
    'schedule_auth_required',
    'schedule_tenant_not_entitled',
    'schedule_create_permission_denied',
    'schedule_edit_permission_denied',
    'schedule_override_permission_denied',
    'schedule_override_justification_required',
    'schedule_customer_not_found',
    'schedule_equipment_not_found',
    'schedule_form_template_not_found',
    'schedule_service_type_not_found',
    'schedule_lead_not_found',
    'schedule_resource_not_in_tenant',
    'schedule_team_without_active_members',
    'schedule_service_order_not_found',
    'schedule_service_order_status_not_bookable',
    'schedule_company_timezone_invalid',
    'schedule_invalid_duration',
    'schedule_invalid_request',
    'schedule_invalid_plan',
    'schedule_invalid_order_payload',
    'schedule_invalid_equipment_items',
  ])('nunca exibe o codigo interno %s', (internalMessage) => {
    const message = getErrorMessage({ code: 'P0001', message: internalMessage });

    expect(message).not.toContain('schedule_');
    expect(message).not.toContain('P0001');
    expect(message).not.toBe(internalMessage);
  });
});
