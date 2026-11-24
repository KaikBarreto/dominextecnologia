export const FINANCE_PDV_RECONCILIATION_ROOT = ['financial-transactions','pdv-reconciliation'] as const;
/** Strict read model: a partial commercial result is never a company result. */
export type FinancePdvProjection = 'dre_competence' | 'dre_cash' | 'dfc';
export interface FinancePdvEntry {
  eventKey: string; eventDate: string; sourceRole: string; sourceId: string;
  scope: 'pdv_commercial' | 'inventory_acquisition'; revenue: number; cmv: number | null;
  expense: number; cashFlow: number; purchaseAmount: number; purchasePaidAmount: number;
}
export interface FinancePdvReconciliation {
  snapshot:string; projection: FinancePdvProjection; from: string; to: string; coverage: 'incomplete';
  companyResult: null; companyCashFlow: null;
  commercial: {revenue: number; cmv: number | null; expense: number; result: number | null; cashFlow: number};
  acquisitions: {amount: number; fullyPaidAmount: number; count: number};
  totalCount: number; limit: number; offset: number; hasMore: boolean; entries: FinancePdvEntry[];
}
const fail = (): never => { throw new Error('A conferência recebida está incompleta. Atualize e tente novamente.'); };
const record = (v: unknown): Record<string, unknown> => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : fail();
const text = (v: unknown) => typeof v === 'string' && v.length > 0 ? v : fail();
const number = (v: unknown) => typeof v === 'number' && Number.isFinite(v) ? v : fail();
const nullable = (v: unknown) => v === null ? null : number(v);
const integer = (v: unknown) => { const n = number(v); return Number.isSafeInteger(n) && n >= 0 ? n : fail(); };
export function financePdvCivilDate(v: unknown): string {
  const s = text(v);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return fail();
  const d = new Date(`${s}T12:00:00Z`);
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0,10) === s ? s : fail();
}
export function parseFinancePdvEntry(v: unknown): FinancePdvEntry {
  const r = record(v);
  if (!['pdv_commercial','inventory_acquisition'].includes(String(r.source_scope))) return fail();
  return {eventKey:text(r.event_key),eventDate:financePdvCivilDate(r.event_date),sourceRole:text(r.source_role),sourceId:text(r.source_id),scope:r.source_scope as FinancePdvEntry['scope'],
    revenue:number(r.revenue),cmv:nullable(r.cmv),expense:number(r.expense),cashFlow:number(r.cash_flow),purchaseAmount:number(r.purchase_amount),purchasePaidAmount:number(r.purchase_paid_amount)};
}
export function parseFinancePdvReconciliation(v: unknown): FinancePdvReconciliation {
  const r = record(v), c = record(r.commercial), a = record(r.acquisitions);
  if (typeof r.snapshot !== 'string' || !/^[0-9a-f]{32}$/.test(r.snapshot) || r.scope !== 'company_shadow' || r.coverage_status !== 'incomplete' || r.company_result !== null || r.company_cash_flow !== null
    || !['dre_competence','dre_cash','dfc'].includes(String(r.projection)) || !Array.isArray(r.entries)) return fail();
  const entries = r.entries.map(parseFinancePdvEntry), totalCount = integer(r.total_count), limit = integer(r.limit), offset = integer(r.offset);
  if (limit < 1 || limit > 200 || entries.length > limit || offset+entries.length > totalCount
    || r.has_more !== (offset+entries.length < totalCount) || new Set(entries.map(e => e.eventKey)).size !== entries.length) return fail();
  const from = financePdvCivilDate(r.from), to = financePdvCivilDate(r.to);
  if (from > to || entries.some(e => e.eventDate < from || e.eventDate > to)) return fail();
  const cmv = nullable(c.cmv), result = nullable(c.result);
  if ((cmv === null) !== (result === null)) return fail();
  return {snapshot:r.snapshot as string,projection:r.projection as FinancePdvProjection,from,to,coverage:'incomplete',companyResult:null,companyCashFlow:null,
    commercial:{revenue:number(c.revenue),cmv,expense:number(c.expense),result,cashFlow:number(c.cash_flow)},
    acquisitions:{amount:number(a.amount),fullyPaidAmount:number(a.fully_paid_amount),count:integer(a.count)},totalCount,limit,offset,hasMore:r.has_more as boolean,entries};
}
const LABELS: Record<string,string> = {delivery_v2:'Entrega',settlement_application_v2:'Recebimento aplicado',payment_reversal_application_v2:'Estorno de recebimento',commercial_return_v2:'Devolução',commercial_return_reversal_v2:'Estorno de devolução',inventory_acquisition:'Compra de estoque',zero_value_delivery_cmv_v2:'Entrega bonificada',pdv_receivable_settlement:'Recebimento',pdv_receivable_reversal:'Estorno',pdv_refund:'Reembolso',pdv_refund_reversal:'Estorno de reembolso',pdv_card_fee:'Taxa de cartão',pdv_cash_shortage:'Quebra de caixa',pdv_cash_surplus:'Sobra de caixa',legacy_financial:'Movimento anterior',pdv_supplier_payment:'Pagamento a fornecedor'};
export const financePdvSourceLabel = (role: string) => LABELS[role] ?? 'Outro movimento da loja';

/** Export every row or no file; offset pages are rejected if any source changed. */
export async function loadFinancePdvExport(read:(offset:number)=>Promise<FinancePdvReconciliation>,isCurrent:()=>boolean,maxRows=10000):Promise<FinancePdvEntry[]> {
  const entries:FinancePdvEntry[]=[],seen=new Set<string>(); let first:FinancePdvReconciliation|undefined;
  while(true) {
    if(!isCurrent()) throw new Error('A conferência mudou. Inicie a exportação novamente.');
    const page=await read(entries.length);
    if(!isCurrent()) throw new Error('A conferência mudou. Inicie a exportação novamente.');
    if(!first) first=page;
    if(page.totalCount>maxRows) throw new Error('Escolha um período menor para exportar todos os movimentos.');
    if(page.snapshot!==first.snapshot || page.totalCount!==first.totalCount || page.from!==first.from || page.to!==first.to || page.projection!==first.projection || page.offset!==entries.length)
      throw new Error('Os movimentos mudaram durante a exportação. Tente novamente.');
    for(const entry of page.entries) {
      if(seen.has(entry.eventKey)) throw new Error('Os movimentos mudaram durante a exportação. Tente novamente.');
      seen.add(entry.eventKey);entries.push(entry);
    }
    if(!page.hasMore) {
      if(entries.length!==first.totalCount) throw new Error('Não foi possível conferir todos os movimentos. Tente novamente.');
      return entries;
    }
    if(page.entries.length===0) throw new Error('Não foi possível conferir todos os movimentos. Tente novamente.');
  }
}
