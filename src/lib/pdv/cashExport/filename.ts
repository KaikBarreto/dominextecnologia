export type CashExportFileExtension = 'pdf' | 'xlsx';

function slug(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}

/** Ex.: `caixa-caixa-principal-2026-11-17.xlsx` ou `caixas-2026-11-01-a-2026-11-17.pdf`. */
export function buildCashExportFilename(input: {
  scope: 'session' | 'period';
  extension: CashExportFileExtension;
  terminalName?: string | null;
  /** Data civil (yyyy-MM-dd) do fechamento, no fuso da empresa. */
  closedDate?: string | null;
  from?: string | null;
  to?: string | null;
}): string {
  const parts: string[] = [];
  if (input.scope === 'session') {
    parts.push('caixa');
    const terminal = slug(input.terminalName ?? '');
    if (terminal) parts.push(terminal);
    if (input.closedDate) parts.push(input.closedDate);
  } else {
    parts.push('caixas');
    if (input.from && input.to) parts.push(input.from === input.to ? input.from : `${input.from}-a-${input.to}`);
  }
  return `${parts.join('-')}.${input.extension}`;
}
