import { describe, expect, it } from 'vitest';
import { getErrorMessage } from '@/utils/errorMessages';

describe('mensagem de vínculo ao excluir equipamento', () => {
  it('prioriza a orientação de domínio sobre o SQLSTATE 23503 genérico', () => {
    expect(getErrorMessage({
      code: '23503',
      message: 'update or delete on table "equipment" violates foreign key constraint "contract_items_equipment_id_fkey"',
    })).toBe('Este equipamento não pode ser excluído porque está vinculado a ordens de serviço, contratos ou planos PMOC.');
  });
});
