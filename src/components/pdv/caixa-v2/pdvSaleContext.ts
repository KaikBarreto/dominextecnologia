export interface PdvSaleCashContext {
  sessionId: string;
  terminalId: string;
  stockId: string;
}

export type ParsedPdvSaleCashContext =
  | { kind: 'absent'; context: null }
  | { kind: 'invalid'; context: null }
  | { kind: 'present'; context: PdvSaleCashContext };

export interface PdvSaleContextTerminal {
  id: string;
  stockId: string;
}

export interface PdvSaleContextSession {
  id: string;
  terminalId: string;
}

export type ResolvedPdvSaleCashContext =
  | { status: 'resolved'; context: PdvSaleCashContext }
  | { status: 'missing' | 'ambiguous' | 'invalid'; context: null };

export function buildPdvSaleCashPath(
  basePath: string,
  context: PdvSaleCashContext,
): string {
  const params = new URLSearchParams({
    caixa: context.sessionId,
    terminal: context.terminalId,
    estoque: context.stockId,
  });
  return `${basePath}?${params.toString()}`;
}

export function parsePdvSaleCashContext(search: string): ParsedPdvSaleCashContext {
  const params = new URLSearchParams(search);
  const sessionId = params.get('caixa')?.trim() ?? '';
  const terminalId = params.get('terminal')?.trim() ?? '';
  const stockId = params.get('estoque')?.trim() ?? '';
  const presentCount = [sessionId, terminalId, stockId].filter(Boolean).length;
  if (presentCount === 0) return { kind: 'absent', context: null };
  if (presentCount !== 3) return { kind: 'invalid', context: null };
  return { kind: 'present', context: { sessionId, terminalId, stockId } };
}

/**
 * Resolve uma única gaveta operacional. Quando a URL informa o contexto, os
 * três vínculos precisam coincidir. Sem URL, só existe escolha automática se
 * houver exatamente uma sessão acessível — nunca escolhemos a primeira entre
 * vários caixas.
 */
export function resolvePdvSaleCashContext(input: {
  requested: ParsedPdvSaleCashContext;
  terminals: readonly PdvSaleContextTerminal[];
  sessions: readonly PdvSaleContextSession[];
}): ResolvedPdvSaleCashContext {
  const { requested, terminals, sessions } = input;
  if (requested.kind === 'invalid') return { status: 'invalid', context: null };

  const candidates = sessions.flatMap((session) => {
    const terminal = terminals.find((item) => item.id === session.terminalId);
    return terminal
      ? [{ sessionId: session.id, terminalId: terminal.id, stockId: terminal.stockId }]
      : [];
  });

  if (requested.kind === 'present') {
    const exact = candidates.find((candidate) =>
      candidate.sessionId === requested.context.sessionId
      && candidate.terminalId === requested.context.terminalId
      && candidate.stockId === requested.context.stockId);
    return exact
      ? { status: 'resolved', context: exact }
      : { status: 'invalid', context: null };
  }

  if (candidates.length === 0) return { status: 'missing', context: null };
  if (candidates.length > 1) return { status: 'ambiguous', context: null };
  return { status: 'resolved', context: candidates[0] };
}
