// Checkout publico de assinatura.
// Aceita somente short_code aleatorio e devolve uma allowlist sem IDs internos,
// documentos, e-mails, chave Asaas ou payload bruto do gateway.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handleCors } from "../_shared/cors.ts";
import { jsonResponse } from "../_shared/payments-auth.ts";

const SHORT_CODE_RE = /^[abcdefghjklmnpqrstuvwxyz23456789]{12}$/;

function serviceClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

function firstName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const clean = value.trim().split(/\s+/)[0]?.slice(0, 80) ?? "";
  return clean || null;
}

function safeAsaasUrl(value: unknown): string | null {
  if (typeof value !== "string" || !value) return null;
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    if (
      url.protocol !== "https:" ||
      (host !== "asaas.com" && !host.endsWith(".asaas.com"))
    ) {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

type PublicStatus = "pending" | "authorized" | "cancelled" | "expired";

function publicStatus(raw: unknown, expiresAt: string | null): PublicStatus {
  const status = String(raw ?? "").toUpperCase();
  if (
    ["AUTHORIZED", "APPROVED", "ACTIVE", "PAID", "COMPLETED", "CONFIRMED"]
      .includes(status)
  ) {
    return "authorized";
  }
  if (
    ["CANCELLED", "CANCELED", "REJECTED", "REFUSED", "DENIED", "INACTIVE"]
      .includes(status)
  ) {
    return "cancelled";
  }
  if (
    status === "EXPIRED" ||
    (expiresAt && new Date(expiresAt).getTime() <= Date.now())
  ) {
    return "expired";
  }
  return "pending";
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;
  if (req.method !== "GET" && req.method !== "POST") {
    return jsonResponse(req, { error: "Método não permitido." }, 405, {
      Allow: "GET, POST, OPTIONS",
    });
  }

  let shortCode = "";
  if (req.method === "GET") {
    shortCode =
      new URL(req.url).searchParams.get("short_code")?.trim().toLowerCase() ??
        "";
  } else {
    try {
      const body = await req.json();
      shortCode = typeof body?.short_code === "string"
        ? body.short_code.trim().toLowerCase()
        : "";
    } catch {
      return jsonResponse(req, { error: "Requisição inválida." }, 400);
    }
  }
  if (!SHORT_CODE_RE.test(shortCode)) {
    return jsonResponse(req, { error: "Link de assinatura inválido." }, 404);
  }

  const supabase = serviceClient();
  const { data: subData, error: subErr } = await supabase
    .from("tenant_subscriptions")
    .select(
      "company_id, customer_id, billing_type, description, value, cycle, next_due_date, " +
        "checkout_status, checkout_expires_at, checkout_url, pix_auto_status, " +
        "pix_auto_qr_code, pix_auto_copy_paste, deleted_at",
    )
    .eq("public_short_code", shortCode)
    .is("deleted_at", null)
    .maybeSingle();
  const sub = subData as any;
  if (subErr || !sub) {
    return jsonResponse(
      req,
      { error: "Link de assinatura não encontrado." },
      404,
    );
  }

  const [{ data: company }, { data: settings }, { data: customer }] =
    await Promise.all([
      supabase.from("companies").select("name, logo_url").eq(
        "id",
        sub.company_id,
      ).maybeSingle(),
      supabase
        .from("company_settings")
        .select("name, logo_url, white_label_enabled, white_label_logo_url")
        .eq("company_id", sub.company_id)
        .maybeSingle(),
      sub.customer_id
        ? supabase.from("customers").select("name").eq("id", sub.customer_id)
          .eq("company_id", sub.company_id).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

  const kind = sub.billing_type === "PIX_AUTO" ? "pix_auto" : "asaas";
  const expiresAt = typeof sub.checkout_expires_at === "string"
    ? sub.checkout_expires_at
    : null;
  const status = publicStatus(
    kind === "pix_auto"
      ? (sub.pix_auto_status ?? sub.checkout_status)
      : sub.checkout_status,
    expiresAt,
  );
  const isPayable = status === "pending";
  const merchantLogo = settings?.white_label_enabled === true
    ? (settings?.white_label_logo_url ?? settings?.logo_url ??
      company?.logo_url ?? null)
    : (settings?.logo_url ?? company?.logo_url ?? null);

  return jsonResponse(req, {
    checkout: {
      kind,
      status,
      expires_at: expiresAt,
      checkout_url: kind === "asaas" && isPayable
        ? safeAsaasUrl(sub.checkout_url)
        : null,
      qr_code: kind === "pix_auto" && isPayable &&
          typeof sub.pix_auto_qr_code === "string"
        ? sub.pix_auto_qr_code
        : null,
      copy_paste: kind === "pix_auto" && isPayable &&
          typeof sub.pix_auto_copy_paste === "string"
        ? sub.pix_auto_copy_paste
        : null,
    },
    subscription: {
      description: typeof sub.description === "string" ? sub.description : null,
      value: Number(sub.value),
      cycle: String(sub.cycle),
      next_due_date: typeof sub.next_due_date === "string"
        ? sub.next_due_date
        : null,
      billing_type: String(sub.billing_type),
    },
    merchant: {
      name: settings?.name ?? company?.name ?? "Empresa",
      logo_url: typeof merchantLogo === "string" ? merchantLogo : null,
    },
    customer: { first_name: firstName(customer?.name) },
  }, 200);
});
