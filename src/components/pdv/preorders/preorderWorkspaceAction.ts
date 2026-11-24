/** Abertura do contexto não concede a permissão de editar preços nem de gerar pedido. */
export function preorderWorkspaceAction(status: string, canValue: boolean, canConvert: boolean): string | null {
  if (status === 'edicao') return 'Editar orçamento';
  if (status !== 'encaminhado') return null;
  if (canValue) return 'Valorizar orçamento';
  return canConvert ? 'Gerar pedido' : null;
}
