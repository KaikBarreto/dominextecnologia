import { describe, expect, it } from 'vitest';
import { MESSAGES } from '@/lib/i18n/messages';
import { createEquipmentFormSchema } from '@/lib/equipmentFormValidation';

describe('EquipmentFormDialog — mensagens obrigatórias', () => {
  it.each([
    ['pt-br', 'Selecione o cliente', 'Informe o nome do equipamento'],
    ['en', 'Select the customer', 'Enter the equipment name'],
    ['es', 'Selecciona el cliente', 'Ingresa el nombre del equipo'],
    ['fr', 'Sélectionnez le client', "Saisissez le nom de l'équipement"],
  ] as const)('traduz as chaves internas no locale %s', (locale, customerMessage, nameMessage) => {
    const messages = MESSAGES[locale].app.equipment.form;
    const result = createEquipmentFormSchema(messages).safeParse({ customer_id: '', name: '' });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.flatten().fieldErrors.customer_id).toEqual([customerMessage]);
    expect(result.error.flatten().fieldErrors.name).toEqual([nameMessage]);
  });
});
