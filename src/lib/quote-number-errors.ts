/** Fronteira de domínio: códigos e detalhes internos nunca chegam ao usuário. */
export function quoteNumberErrorMessage(error: { code?: string } | null | undefined): string {
  if (error?.code === 'QNR02') return 'A reserva deste número venceu. Gere um novo número para continuar; os dados preenchidos serão mantidos.';
  if (error?.code === 'QNR03') return 'Este número já foi usado por outra versão do orçamento. Confira o orçamento salvo ou gere um novo número para salvar esta versão.';
  if (error?.code === '42501' || error?.code === 'QNR01') return 'Não foi possível confirmar seu acesso para salvar este orçamento. Confira a empresa selecionada e entre novamente.';
  if (error?.code?.startsWith('22') || error?.code?.startsWith('23')) return 'Não foi possível salvar os dados do orçamento. Confira os itens e o cliente selecionado e tente novamente.';
  return 'Não foi possível salvar o orçamento com este número. Seus dados foram mantidos; tente novamente.';
}
