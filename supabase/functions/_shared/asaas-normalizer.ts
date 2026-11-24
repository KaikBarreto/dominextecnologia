export interface AsaasNormalizedEntry {
  asaas_transaction_id: string;
  asaas_event_type: string;
  direction: "credit" | "debit";
  amount: number;
  occurred_at: string;
  asaas_payment_id: string | null;
  asaas_transfer_id: string | null;
  raw_payload: Record<string, unknown>;
}

// Aceita 3 formatos vindos do Asaas:
//   "2026-04-28T16:21:34.000Z"           — ISO completo (já tem T)
//   "2026-04-28 16:21:34"                — formato Asaas com espaço (timestamp BRT)
//   "2026-04-28"                         — apenas data → null (caller decide fallback)
function toISOOrNull(dateStr: string | undefined): string | null {
  if (!dateStr) return null;
  if (dateStr.includes("T")) return dateStr;
  const dt = dateStr.match(/^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2}(?::\d{2})?)$/);
  if (dt) {
    const time = dt[2].length === 5 ? `${dt[2]}:00` : dt[2];
    return new Date(`${dt[1]}T${time}-03:00`).toISOString();
  }
  // Apenas data (sem hora) — caller decide o fallback (preferir hora do webhook).
  return null;
}

function toISO(dateStr: string | undefined): string {
  return toISOOrNull(dateStr) || new Date().toISOString();
}

// Pra PAYMENT_RECEIVED/CONFIRMED, prefere o timestamp mais preciso disponível.
// Se nenhum dos campos tem hora real (só data), usa o instante em que o webhook
// chegou — evita conciliação aparecer com 12h00 BRT fixo (problema histórico).
//
// EXPORTADO: reutilizado por confirm-sale-payment para ancorar o vencimento da
// 1ª venda na DATA REAL do pagamento (mesma prioridade clientPaymentDate →
// dateCreated → paymentDate → now, mesma normalização BRT). Single source of
// truth do parse — não duplicar o hazard do T12:00 fixo.
export function bestPaymentTimestamp(p: Record<string, any>): string {
  return (
    toISOOrNull(p?.clientPaymentDate) ||
    toISOOrNull(p?.dateCreated) ||
    toISOOrNull(p?.paymentDate) ||
    new Date().toISOString()
  );
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function normalizeAsaasPayload(payload: Record<string, any>): AsaasNormalizedEntry[] {
  const event = String(payload.event ?? "");
  const result: AsaasNormalizedEntry[] = [];

  if (event === "PAYMENT_RECEIVED" || event === "PAYMENT_CONFIRMED") {
    const p = payload.payment ?? {};
    if (!p.id) return [];
    const value = Number(p.value ?? 0);
    const netValue = Number(p.netValue ?? value);
    const fee = round2(value - netValue);
    const occurred = toISOOrNull(payload.dateCreated) || bestPaymentTimestamp(p);

    result.push({
      asaas_transaction_id: p.id,
      asaas_event_type: "PAYMENT_RECEIVED",
      direction: "credit",
      amount: round2(value),
      occurred_at: occurred,
      asaas_payment_id: p.id,
      asaas_transfer_id: null,
      raw_payload: payload,
    });

    if (fee > 0) {
      result.push({
        asaas_transaction_id: `${p.id}_fee`,
        asaas_event_type: "PAYMENT_FEE",
        direction: "debit",
        amount: fee,
        occurred_at: occurred,
        asaas_payment_id: p.id,
        asaas_transfer_id: null,
        raw_payload: payload,
      });
    }
    return result;
  }

  if (event === "PAYMENT_REFUNDED") {
    const p = payload.payment ?? {};
    if (!p.id) return [];
    const refund = Array.isArray(p.refunds) && p.refunds.length > 0 ? p.refunds[0] : null;
    const amount = Number(refund?.value ?? p.value ?? 0);
    const occurred = toISO(refund?.dateCreated ?? new Date().toISOString());

    result.push({
      asaas_transaction_id: `${p.id}_refund`,
      asaas_event_type: "PAYMENT_REFUND",
      direction: "debit",
      amount: round2(amount),
      occurred_at: occurred,
      asaas_payment_id: p.id,
      asaas_transfer_id: null,
      raw_payload: payload,
    });
    return result;
  }

  if (event === "PAYMENT_CHARGEBACK_REQUESTED" || event === "PAYMENT_CHARGEBACK_DISPUTE") {
    const p = payload.payment ?? {};
    if (!p.id) return [];
    result.push({
      asaas_transaction_id: `${p.id}_chargeback`,
      asaas_event_type: "CHARGEBACK",
      direction: "debit",
      amount: round2(Number(p.value ?? 0)),
      occurred_at: bestPaymentTimestamp(p),
      asaas_payment_id: p.id,
      asaas_transfer_id: null,
      raw_payload: payload,
    });
    return result;
  }

  if (event === "TRANSFER_DONE") {
    const t = payload.transfer ?? {};
    if (!t.id) return [];
    const value = Number(t.value ?? 0);
    const netValue = Number(t.netValue ?? value);
    const fee = round2(Number(t.transferFee ?? t.fee ?? (value - netValue)));
    const occurred = toISOOrNull(t.effectiveDate) || toISOOrNull(payload.dateCreated) || toISO(t.dateCreated);

    result.push({
      asaas_transaction_id: t.id,
      asaas_event_type: "TRANSFER",
      direction: "debit",
      amount: round2(value),
      occurred_at: occurred,
      asaas_payment_id: null,
      asaas_transfer_id: t.id,
      raw_payload: payload,
    });

    if (fee > 0) {
      result.push({
        asaas_transaction_id: `${t.id}_fee`,
        asaas_event_type: "TRANSFER_FEE",
        direction: "debit",
        amount: fee,
        occurred_at: occurred,
        asaas_payment_id: null,
        asaas_transfer_id: t.id,
        raw_payload: payload,
      });
    }
    return result;
  }

  if (event === "BILL_PAID" || event === "BILL_REFUNDED") {
    const bill = payload.bill ?? {};
    if (!bill.id) return [];
    result.push({asaas_transaction_id: event === "BILL_PAID" ? bill.id : `${bill.id}_refund`,asaas_event_type:event === "BILL_PAID" ? "BILL_PAYMENT" : "BILL_REFUND",direction:event === "BILL_PAID" ? "debit" : "credit",amount:round2(Number(bill.value ?? 0)),occurred_at:toISOOrNull(payload.dateCreated)||toISO(bill.paymentDate),asaas_payment_id:null,asaas_transfer_id:bill.id,raw_payload:payload});
    return result;
  }

  // Evento desconhecido: retorna vazio (webhook ainda responde 200)
  return result;
}
