import { describe, expect, it } from 'vitest';
import { isWhatsAppOptOutText } from '../../supabase/functions/_shared/whatsapp-opt-out';

describe('opt-out de WhatsApp', () => {
  it.each([
    'PARAR',
    'sair.',
    'Stop!',
    'não quero receber mensagens',
    'Não quero mais receber mensagens.',
    'cancelar mensagens',
    'cancelar notificações',
  ])('aceita o comando inequívoco %s', (message) => {
    expect(isWhatsAppOptOutText(message)).toBe(true);
  });

  it.each([
    'cancelar visita',
    'cancelar cobrança',
    'não quero cancelar a OS',
    'remover equipamento',
    'parar amanhã',
  ])('não confunde a solicitação operacional %s com opt-out', (message) => {
    expect(isWhatsAppOptOutText(message)).toBe(false);
  });
});
