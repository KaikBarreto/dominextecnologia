/** Antecipação é uma operação composta: lê somente os lançamentos da operação notificada. */
export async function anticipationMovements(
  body: Record<string, any>,
): Promise<any[]> {
  if (
    !["RECEIVABLE_ANTICIPATION_CREDITED", "RECEIVABLE_ANTICIPATION_DEBITED"]
      .includes(body.event)
  ) return [];
  const ant = body.anticipation || body.receivableAnticipation || {};
  if (!ant.id) throw new Error("Antecipação sem identificador");
  const key = Deno.env.get("ASAAS_API_KEY");
  if (!key) throw new Error("Asaas não configurado");
  const day = String(
    body.dateCreated || ant.creditDate || ant.anticipationDate || "",
  ).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !Number.isFinite(Date.parse(day))) {
    throw new Error("Antecipação sem data válida");
  }
  const startDate = new Date(Date.parse(day) - 86400000).toISOString().slice(
    0,
    10,
  );
  const finishDate = new Date(Date.parse(day) + 86400000).toISOString().slice(
    0,
    10,
  );
  const base = Deno.env.get("ASAAS_BASE_URL") || "https://api.asaas.com/v3";
  const entries: any[] = [];
  for (let offset = 0; offset < 10000; offset += 100) {
    const query = new URLSearchParams({
      startDate,
      finishDate,
      offset: String(offset),
      limit: "100",
    });
    const response = await fetch(`${base}/financialTransactions?${query}`, {
      headers: { access_token: key },
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) {
      throw new Error(
        `Extrato da antecipação indisponível: ${response.status}`,
      );
    }
    const page = await response.json();
    if (!Array.isArray(page.data)) {
      throw new Error("Extrato da antecipação inválido");
    }
    for (const tx of page.data) {
      if (tx.anticipationId !== ant.id) continue;
      if (
        !tx.id || !tx.type || !Number.isFinite(Number(tx.value)) ||
        !Number(tx.value)
      ) throw new Error("Movimento da antecipação inválido");
      entries.push({
        asaas_transaction_id: tx.id,
        asaas_event_type: tx.type,
        asaas_payment_id: tx.paymentId ?? null,
        asaas_transfer_id: tx.transferId ?? tx.billId ?? null,
        direction: Number(tx.value) < 0 ? "debit" : "credit",
        amount: Math.abs(Number(tx.value)),
        occurred_at: new Date(`${tx.date}T12:00:00-03:00`).toISOString(),
        description: tx.description,
        raw_payload: tx,
      });
    }
    if (!page.hasMore) {
      if (!entries.length) {
        throw new Error("Lançamentos da antecipação ainda não disponíveis");
      }
      return entries;
    }
  }
  throw new Error("Limite de paginação da antecipação excedido");
}
