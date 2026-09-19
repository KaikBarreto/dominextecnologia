/**
 * Lista de ações de uma linha de cobrança na FICHA DO CLIENTE (aba Financeiro
 * e aba Cobranças, desktop e mobile).
 *
 * Existe como função pura, fora do componente, por dois motivos:
 *
 * 1. A ficha do cliente monta a mesma lista em TRÊS lugares (tabela da aba
 *    Financeiro, tabela da aba Cobranças e cards do mobile). Enquanto cada um
 *    repetia a condição, bastava esquecer um para abrir um caminho que fura a
 *    trava — exatamente o risco de duplicar a tela sem duplicar a regra.
 * 2. Dá pra PROVAR a trava em teste sem montar a página inteira: as três
 *    superfícies chamam esta função, então testar a função testa as três.
 *
 * Quem decide o que pode é `@/lib/tenantChargeRules` — o mesmo módulo que a
 * Central de Cobranças (FinanceCobrancas) usa.
 */
import { canManageCharge, canRefundCharge, type ChargeRuleInput } from '@/lib/tenantChargeRules';

export type ChargeRowActionKey = 'copy' | 'whatsapp' | 'checkout' | 'edit' | 'delete' | 'refund';

export type ChargeRowActionVariant = 'default' | 'edit' | 'delete';

export interface ChargeRowAction {
  key: ChargeRowActionKey;
  label: string;
  variant: ChargeRowActionVariant;
  onClick: () => void;
}

export interface ChargeRowActionLabels {
  copyLink: string;
  whatsapp: string;
  openCheckout: string;
  edit: string;
  delete: string;
  refund: string;
}

export interface ChargeRowActionHandlers {
  onCopyLink: () => void;
  onWhatsapp: () => void;
  onOpenCheckout: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onRefund: () => void;
}

/**
 * Ações visíveis para esta cobrança, na ordem em que aparecem no menu.
 * Copiar link / WhatsApp / checkout valem sempre (são leitura).
 * Editar e excluir seguem `canManageCharge`; estornar segue `canRefundCharge`.
 */
export function buildChargeRowActions(
  charge: ChargeRuleInput,
  labels: ChargeRowActionLabels,
  handlers: ChargeRowActionHandlers,
): ChargeRowAction[] {
  const actions: ChargeRowAction[] = [
    { key: 'copy', label: labels.copyLink, variant: 'default', onClick: handlers.onCopyLink },
    { key: 'whatsapp', label: labels.whatsapp, variant: 'default', onClick: handlers.onWhatsapp },
    { key: 'checkout', label: labels.openCheckout, variant: 'default', onClick: handlers.onOpenCheckout },
  ];
  if (canManageCharge(charge.status)) {
    actions.push({ key: 'edit', label: labels.edit, variant: 'edit', onClick: handlers.onEdit });
    actions.push({ key: 'delete', label: labels.delete, variant: 'delete', onClick: handlers.onDelete });
  }
  if (canRefundCharge(charge)) {
    actions.push({ key: 'refund', label: labels.refund, variant: 'delete', onClick: handlers.onRefund });
  }
  return actions;
}
