import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { performEquipmentDetailDelete, performEquipmentDetailUpdate } from './equipmentDetailActions';

describe('ações da ficha do equipamento', () => {
  it('atualiza, confirma sucesso e não depende de recarregar a página', async () => {
    const update = vi.fn().mockResolvedValue({ id: 'eq-1' });
    const onSuccess = vi.fn();

    await performEquipmentDetailUpdate({
      id: 'eq-1',
      data: { name: 'Split atualizado' },
      update,
      onSuccess,
    });

    expect(update).toHaveBeenCalledWith({ id: 'eq-1', data: { name: 'Split atualizado' } });
    expect(onSuccess).toHaveBeenCalledOnce();
    expect(readFileSync('src/pages/EquipmentDetail.tsx', 'utf8')).not.toContain('window.location.reload');
  });

  it('navega somente depois que a exclusão é confirmada', async () => {
    const remove = vi.fn().mockResolvedValue('eq-1');
    const navigateAfterSuccess = vi.fn();
    const showError = vi.fn();

    await expect(performEquipmentDetailDelete({
      id: 'eq-1',
      remove,
      onSuccess: navigateAfterSuccess,
      onError: showError,
    })).resolves.toBe(true);

    expect(navigateAfterSuccess).toHaveBeenCalledOnce();
    expect(showError).not.toHaveBeenCalled();
  });

  it('mantém o fluxo na ficha e explica o vínculo quando o banco retorna 23503', async () => {
    const remove = vi.fn().mockRejectedValue({
      code: '23503',
      message: 'violates foreign key constraint "contract_items_equipment_id_fkey"',
    });
    const navigateAfterSuccess = vi.fn();
    const showError = vi.fn();

    await expect(performEquipmentDetailDelete({
      id: 'eq-linked',
      remove,
      onSuccess: navigateAfterSuccess,
      onError: showError,
    })).resolves.toBe(false);

    expect(navigateAfterSuccess).not.toHaveBeenCalled();
    expect(showError).toHaveBeenCalledWith(
      'Este equipamento não pode ser excluído porque está vinculado a ordens de serviço, contratos ou planos PMOC.',
    );
  });
});
