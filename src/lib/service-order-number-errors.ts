/** Traduz apenas a família da reserva; demais erros seguem seu domínio original. */
export function normalizeServiceOrderNumberError(error: unknown): unknown {
  if (!error || typeof error !== 'object' || !('code' in error)) return error;
  const code = String(error.code);
  let message: string;
  if (code === 'OSN02') {
    message = 'A reserva do número da OS venceu. Gere outro número para continuar; os dados preenchidos serão mantidos.';
  } else if (code === 'OSN03') {
    message = 'Este número já pertence a uma OS salva. Confira a OS na listagem antes de iniciar outro preenchimento.';
  } else if (code.startsWith('OSN')) {
    message = 'Não foi possível confirmar o número da OS. Seus dados foram mantidos; tente novamente.';
  } else {
    return error;
  }
  return Object.assign(new Error(message), { code });
}
