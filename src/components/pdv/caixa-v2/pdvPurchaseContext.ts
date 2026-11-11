export interface PdvPurchaseCashContext {
  sessionId: string;
  terminalId: string;
  stockId: string;
}

export type ParsedPdvPurchaseCashContext =
  | { kind: 'absent'; context: null }
  | { kind: 'invalid'; context: null }
  | { kind: 'present'; context: PdvPurchaseCashContext };

export function buildPdvPurchaseCashPath(basePath: string, context: PdvPurchaseCashContext): string {
  const params = new URLSearchParams({
    caixa: context.sessionId,
    terminal: context.terminalId,
    estoque: context.stockId,
  });
  return `${basePath}?${params.toString()}`;
}

export function parsePdvPurchaseCashContext(search: string): ParsedPdvPurchaseCashContext {
  const params = new URLSearchParams(search);
  const sessionId = params.get('caixa')?.trim() ?? '';
  const terminalId = params.get('terminal')?.trim() ?? '';
  const stockId = params.get('estoque')?.trim() ?? '';
  const presentCount = [sessionId, terminalId, stockId].filter(Boolean).length;
  if (presentCount === 0) return { kind: 'absent', context: null };
  if (presentCount !== 3) return { kind: 'invalid', context: null };
  return { kind: 'present', context: { sessionId, terminalId, stockId } };
}

export function pdvPurchaseCashDraftStorageSuffix(context: PdvPurchaseCashContext): string {
  return `cash:${context.sessionId}:${context.terminalId}:${context.stockId}`;
}
