import { getErrorMessage } from '@/utils/errorMessages';

interface UpdateEquipmentDetailOptions<TData> {
  id: string;
  data: TData;
  update: (input: { id: string; data: TData }) => Promise<unknown>;
  onSuccess: () => void;
}

export async function performEquipmentDetailUpdate<TData>({
  id,
  data,
  update,
  onSuccess,
}: UpdateEquipmentDetailOptions<TData>): Promise<void> {
  try {
    await update({ id, data });
  } catch (error) {
    // O formulário mantém-se aberto ao receber a rejeição. Nunca repassamos a
    // mensagem técnica do Supabase para a copy de usuário final.
    throw new Error(getErrorMessage(error));
  }
  onSuccess();
}

interface DeleteEquipmentDetailOptions {
  id: string;
  remove: (id: string) => Promise<unknown>;
  onSuccess: () => void;
  onError: (message: string) => void;
}

export async function performEquipmentDetailDelete({
  id,
  remove,
  onSuccess,
  onError,
}: DeleteEquipmentDetailOptions): Promise<boolean> {
  try {
    await remove(id);
  } catch (error) {
    onError(getErrorMessage(error));
    return false;
  }
  onSuccess();
  return true;
}
