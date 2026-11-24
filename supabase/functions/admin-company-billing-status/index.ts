import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const PRODUCT: string = "dom";
const headers = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Content-Type": "application/json" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const paidStates = new Set(["RECEIVED", "CONFIRMED", "RECEIVED_IN_CASH"]);

async function gateway(path: string) {
  const key = Deno.env.get("ASAAS_API_KEY");
  if (!key) throw new Error("gateway_unavailable");
  const response = await fetch(`https://api.asaas.com/v3${path}`, {
    headers: { access_token: key }, signal: AbortSignal.timeout(8000),
  });
  const data = await response.json();
  if (!response.ok || data?.errors) throw new Error("gateway_unavailable");
  return data;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers });
  if (req.method !== "POST") return json({ error: "Método não permitido." }, 405);
  try {
    const auth = req.headers.get("Authorization");
    if (!auth?.startsWith("Bearer ")) return json({ error: "Entre novamente para continuar." }, 401);
    const url = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: identity, error: authError } = await admin.auth.getUser(auth.slice(7));
    if (authError || !identity.user) return json({ error: "Entre novamente para continuar." }, 401);
    const { data: canRead, error: permissionError } = await admin.rpc("can_read_admin_financial", { _user_id: identity.user.id });
    if (permissionError || canRead !== true) return json({ error: "Você não tem acesso aos dados de cobrança." }, 403);
    const body = await req.json().catch(() => null);
    if (!uuid.test(body?.companyId ?? "")) return json({ error: "Empresa inválida." }, 400);
    // A permissão financeira não amplia o conjunto de empresas acessíveis ao usuário.
    const scoped = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
    const { data: allowedCompany, error: scopeError } = await scoped.from("companies").select("id").eq("id", body.companyId).maybeSingle();
    if (scopeError || !allowedCompany) return json({ error: "Empresa não disponível para este acesso." }, 403);
    const companyFields = "id,asaas_customer_id,asaas_subscription_id,subscription_value,billing_cycle,custom_price" + (PRODUCT === "eco" ? ",billing_managed_by_group_id" : "");
    const { data: rawCompany, error: companyError } = await admin.from("companies").select(companyFields).eq("id", body.companyId).single();
    if (companyError || !rawCompany) throw new Error("company_unavailable");
    const company = rawCompany as unknown as Record<string, any>;
    const paymentColumn = PRODUCT === "eco" ? "gateway_payment_id" : "asaas_payment_id";
    const { data: changes, error: changesError } = await admin.from("subscription_change_requests")
      .select(`id,change_kind,status,amount_due,paid_at,applied_at,created_at,target_billing_cycle,target_monthly_value,target_period_value,${paymentColumn}`)
      .eq("company_id", company.id).order("created_at", { ascending: false }).limit(5);
    if (changesError) throw new Error("changes_unavailable");
    const paymentIds = (changes ?? []).map((row: any) => row[paymentColumn]).filter(Boolean);
    const { data: payments, error: paymentsError } = paymentIds.length
      ? await admin.from("subscription_payments").select("asaas_payment_id,status,paid_at").eq("company_id", company.id).in("asaas_payment_id", paymentIds)
      : { data: [], error: null };
    if (paymentsError) throw new Error("payments_unavailable");
    const paymentById = new Map((payments ?? []).map((row: any) => [row.asaas_payment_id, row]));
    const changeStates = await Promise.all((changes ?? []).map(async (raw: any, index: number) => {
      const local = paymentById.get(raw[paymentColumn]) as any;
      let paymentStatus = local?.status ?? null;
      let paymentVerified = !!raw.paid_at || paidStates.has(paymentStatus);
      let paymentCheckFailed = false;
      if (!paymentVerified && Number(raw.amount_due) > 0 && raw[paymentColumn] && index < 3 && ["pending", "payment_pending"].includes(raw.status)) {
        try {
          const p = await gateway(`/payments/${encodeURIComponent(raw[paymentColumn])}`);
          if (p.id !== raw[paymentColumn] || p.customer !== company.asaas_customer_id) throw new Error("payment_binding_mismatch");
          paymentStatus = p.status;
          paymentVerified = paidStates.has(p.status);
        } catch { paymentCheckFailed = true; }
      }
      return { id: raw.id, kind: raw.change_kind, status: raw.status, amount: Number(raw.amount_due), createdAt: raw.created_at, paidAt: raw.paid_at ?? local?.paid_at ?? null, appliedAt: raw.applied_at, paymentStatus, paymentVerified, paymentCheckFailed };
    }));
    let recurrenceId = company.asaas_subscription_id;
    let customerId = company.asaas_customer_id;
    let expectedAmount: number | null = null;
    const groupId = company.billing_managed_by_group_id ?? null;
    if (groupId) {
      const { data: group, error: groupError } = await admin.from("company_groups").select("asaas_subscription_id,owner_company_id").eq("id", groupId).single();
      if (groupError || !group) throw new Error("group_unavailable");
      const { data: owner, error: ownerError } = await admin.from("companies").select("asaas_customer_id").eq("id", group.owner_company_id).single();
      const { data: expected, error: expectedError } = await admin.rpc("group_expected_payment", { p_group_id: groupId });
      if (ownerError || expectedError) throw new Error("group_unavailable");
      recurrenceId = group.asaas_subscription_id;
      customerId = owner?.asaas_customer_id;
      if (!expected?.mixed_cycle && Number(expected?.total) > 0) expectedAmount = Number(expected.total);
    }
    let recurrence: Record<string, unknown> = { state: "none", kind: null, value: null, expectedAmount, grouped: !!groupId, mismatch: false, manualCreation: false };
    if (recurrenceId) {
      try {
        const subscription = String(recurrenceId).startsWith("sub_");
        if (!subscription && !uuid.test(recurrenceId)) throw new Error("invalid_recurrence");
        const live = await gateway(subscription ? `/subscriptions/${encodeURIComponent(recurrenceId)}` : `/pix/automatic/authorizations/${encodeURIComponent(recurrenceId)}`);
        if (live.id !== recurrenceId || (live.customer ?? live.customerId) !== customerId) throw new Error("recurrence_binding_mismatch");
        const latestApplied = (changes ?? []).find((row: any) => row.status === "applied" && row.applied_at) as any;
        const cycle = subscription ? live.cycle : live.frequency;
        const monthly = cycle === "MONTHLY";
        const yearly = cycle === "YEARLY" || cycle === "ANNUALLY";
        if (!groupId && latestApplied && !Number(company.custom_price) && Number(company.subscription_value) === Number(latestApplied.target_monthly_value) && company.billing_cycle === latestApplied.target_billing_cycle) {
          if (monthly && (company.billing_cycle === "monthly" || live.billingType === "CREDIT_CARD")) expectedAmount = Number(latestApplied.target_monthly_value);
          if (yearly && company.billing_cycle === "yearly") expectedAmount = Number(latestApplied.target_period_value);
        }
        const value = live.value == null ? null : Number(live.value);
        recurrence = { state: live.status === "ACTIVE" ? "active" : "inactive", kind: subscription ? (live.billingType === "CREDIT_CARD" ? "card" : live.billingType === "PIX" ? "pix_invoice" : "boleto") : "pix_automatic", status: live.status, value, expectedAmount, grouped: !!groupId, mismatch: live.status === "ACTIVE" && value !== null && expectedAmount !== null && Math.abs(value - expectedAmount) > 0.02, manualCreation: !subscription && live.paymentCreationMode === "MANUAL", nextDueDate: live.nextDueDate ?? null };
      } catch { recurrence = { ...recurrence, state: "unavailable" }; }
    }
    return json({ checkedAt: new Date().toISOString(), changes: changeStates, recurrence });
  } catch {
    return json({ error: "Não foi possível consultar a cobrança agora. Tente novamente." }, 503);
  }
});
