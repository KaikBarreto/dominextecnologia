// =============================================================================
// generate-pmoc-cronograma-pdf — PDF anual (12 páginas, 1 mês/página).
// =============================================================================
// AUTENTICADA. Mesmo padrão de auth do dossie. Roles admin/gestor/super_admin.
// Plano: docs/planos/2026-05-23-pmoc-onda-C-dossie-cronograma.md §4.3
// Regra: docs/planos/2026-05-23-pmoc-onda-C-rls-rules.md §5.1
// =============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { PDFDocument } from "https://esm.sh/pdf-lib@1.17.1";
import {
  drawCronogramaMesPage,
  CronogramaServiceOrder,
} from "../_shared/pmoc-templates/cronograma-mes.ts";
import {
  TemplateContext,
  dateToExtenso,
  frequencyLabelFrom,
} from "../_shared/pmoc-templates/context.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Rate limit 10 req/min por user
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 10;
const rateBucket = new Map<string, number[]>();

function rateLimitOk(userId: string): boolean {
  const now = Date.now();
  const arr = rateBucket.get(userId) ?? [];
  const fresh = arr.filter((t) => now - t < RATE_WINDOW_MS);
  if (fresh.length >= RATE_MAX) {
    rateBucket.set(userId, fresh);
    return false;
  }
  fresh.push(now);
  rateBucket.set(userId, fresh);
  if (rateBucket.size > 5000) {
    const oldest = Array.from(rateBucket.entries())
      .sort(([, a], [, b]) => (a[a.length - 1] ?? 0) - (b[b.length - 1] ?? 0))
      .slice(0, 1000);
    for (const [k] of oldest) rateBucket.delete(k);
  }
  return true;
}

function maskUuid(s: string | null | undefined): string {
  if (!s) return "<none>";
  return s.slice(0, 8) + "...";
}

function jsonResponse(body: unknown, status: number, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "private, no-store",
      ...extraHeaders,
    },
  });
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest("SHA-256", data);
  const arr = Array.from(new Uint8Array(buf));
  return arr.map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "GET") {
    return jsonResponse({ error: "method_not_allowed" }, 405);
  }

  const t0 = Date.now();

  try {
    const authHeader = req.headers.get("Authorization") ?? req.headers.get("authorization");
    if (!authHeader || !authHeader.toLowerCase().startsWith("bearer ")) {
      return jsonResponse({ error: "unauthorized" }, 401);
    }

    const url = new URL(req.url);
    const contractId = url.searchParams.get("contract_id");
    if (!contractId || !UUID_REGEX.test(contractId)) {
      return jsonResponse({ error: "invalid_contract_id" }, 400);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabaseAuthed = createClient(supabaseUrl, serviceRoleKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await supabaseAuthed.auth.getUser();
    if (userErr || !userData?.user?.id) {
      return jsonResponse({ error: "unauthorized" }, 401);
    }
    const userId = userData.user.id;

    if (!rateLimitOk(userId)) {
      return jsonResponse({ error: "rate_limited" }, 429, { "Retry-After": "60" });
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const [{ data: profileRow }, { data: rolesRows }] = await Promise.all([
      supabase.from("profiles").select("company_id").eq("user_id", userId).maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", userId),
    ]);
    const userCompany = profileRow?.company_id ?? null;
    const roles = new Set((rolesRows ?? []).map((r) => r.role));
    const isSuperAdmin = roles.has("super_admin");
    const isAdminOrGestor = roles.has("admin") || roles.has("gestor");

    const { data: contract } = await supabase
      .from("contracts")
      .select(
        [
          "id",
          "company_id",
          "name",
          "customer_id",
          "responsible_technician_id",
          "is_pmoc",
          "start_date",
          "frequency_type",
          "frequency_value",
        ].join(","),
      )
      .eq("id", contractId)
      .maybeSingle();

    if (!contract) {
      return jsonResponse({ error: "not_found" }, 404);
    }
    if (!isSuperAdmin && contract.company_id !== userCompany) {
      return jsonResponse({ error: "not_found" }, 404);
    }
    if (!isAdminOrGestor && !isSuperAdmin) {
      return jsonResponse(
        { error: "forbidden_role", message: "Apenas administradores e gestores podem gerar documentos PMOC." },
        403,
      );
    }
    if (contract.is_pmoc !== true) {
      return jsonResponse({ error: "not_a_pmoc_contract" }, 400);
    }

    const [{ data: customer }, { data: companySettings }, { data: rt }] = await Promise.all([
      supabase
        .from("customers")
        .select("name, address, city, state")
        .eq("id", contract.customer_id)
        .maybeSingle(),
      supabase
        .from("company_settings")
        .select("name, cnpj, logo_url, white_label_enabled, white_label_logo_url, city")
        .eq("company_id", contract.company_id)
        .maybeSingle(),
      contract.responsible_technician_id
        ? supabase
            .from("responsible_technicians")
            .select("full_name, cft_crea, modality")
            .eq("id", contract.responsible_technician_id)
            .maybeSingle()
        : Promise.resolve({ data: null } as { data: null }),
    ]);

    let tenantName = (companySettings?.name ?? "").trim();
    if (!tenantName) {
      const { data: companyRow } = await supabase
        .from("companies")
        .select("name")
        .eq("id", contract.company_id)
        .maybeSingle();
      tenantName = (companyRow?.name ?? "").trim() || "Empresa";
    }

    const useWhiteLabel = companySettings?.white_label_enabled === true;
    const logoUrl = useWhiteLabel
      ? companySettings?.white_label_logo_url ?? companySettings?.logo_url ?? null
      : companySettings?.logo_url ?? null;

    let logoBytes: Uint8Array | null = null;
    let logoMime: "image/png" | "image/jpeg" | null = null;
    if (logoUrl) {
      try {
        const res = await fetch(logoUrl);
        if (res.ok) {
          const ct = res.headers.get("content-type") ?? "";
          if (ct.includes("png")) {
            logoBytes = new Uint8Array(await res.arrayBuffer());
            logoMime = "image/png";
          } else if (ct.includes("jpeg") || ct.includes("jpg")) {
            logoBytes = new Uint8Array(await res.arrayBuffer());
            logoMime = "image/jpeg";
          }
        }
      } catch {
        // ignora
      }
    }

    // ---- Janela 12 meses a partir do mês atual
    const now = new Date();
    const startMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const endMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 12, 1));

    const startIso = startMonth.toISOString().slice(0, 10);
    const endIso = endMonth.toISOString().slice(0, 10);

    const { data: orders } = await supabase
      .from("service_orders")
      .select("id, order_number, scheduled_date, status")
      .eq("contract_id", contract.id)
      .eq("company_id", contract.company_id) // filtro defensivo
      .gte("scheduled_date", startIso)
      .lt("scheduled_date", endIso);

    const serviceOrders: CronogramaServiceOrder[] = (orders ?? []).map((o) => ({
      id: o.id,
      order_number: o.order_number ?? null,
      scheduled_date: o.scheduled_date ?? null,
      status: o.status,
    }));

    // ---- Hash baseado em OSs + datas + statuses + janela
    const hashInput = JSON.stringify({
      v: "cronograma_v1",
      tenant: tenantName,
      customer: customer?.name ?? "",
      window: { start: startIso, end: endIso },
      orders: serviceOrders
        .map((o) => ({
          n: o.order_number,
          d: o.scheduled_date,
          s: o.status,
        }))
        .sort((a, b) => (a.d ?? "").localeCompare(b.d ?? "")),
    });
    const contentHash = await sha256Hex(hashInput);

    // ---- Cache hit?
    const { data: existingDoc } = await supabase
      .from("pmoc_documents")
      .select("id, version, pdf_storage_path, generated_at")
      .eq("contract_id", contract.id)
      .eq("company_id", contract.company_id)
      .eq("doc_type", "cronograma_anual")
      .eq("content_hash", contentHash)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingDoc) {
      const { data: signed } = await supabase.storage
        .from("pmoc-documents")
        .createSignedUrl(existingDoc.pdf_storage_path, 3600);
      if (signed) {
        console.log("[generate-pmoc-cronograma-pdf] cache hit", {
          contract_id: maskUuid(contract.id),
          version: existingDoc.version,
          duration_ms: Date.now() - t0,
        });
        return jsonResponse(
          {
            pdf_url: signed.signedUrl,
            version: existingDoc.version,
            generated_at: existingDoc.generated_at,
            cached: true,
          },
          200,
        );
      }
    }

    // ---- TemplateContext (cronograma usa só tenant + customer + contract pra cabeçalho)
    const cidade = (companySettings?.city ?? customer?.city ?? "").trim() || "";
    const ctx: TemplateContext = {
      empresa: {
        razao_social: tenantName,
        cnpj: companySettings?.cnpj ?? "",
        cidade,
        logo_bytes: logoBytes,
        logo_mime: logoMime,
      },
      rt: {
        nome: rt?.full_name ?? "",
        modalidade: rt?.modality ?? "",
        cft_crea: rt?.cft_crea ?? null,
      },
      customer: {
        name: customer?.name ?? "Unidade",
        address: customer?.address ?? "",
        city: customer?.city ?? null,
        state: customer?.state ?? null,
      },
      contract: {
        name: contract.name ?? null,
        frequency_label: frequencyLabelFrom(
          (contract.frequency_value ?? null) as number | null,
          (contract.frequency_type ?? null) as string | null,
        ),
        start_date_extenso: dateToExtenso(contract.start_date ?? null),
      },
      cidade,
      generated_at_extenso: dateToExtenso(new Date()),
    };

    // ---- Compor PDF: 12 páginas
    const pdf = await PDFDocument.create();
    pdf.setTitle(`PMOC — Cronograma Anual — ${ctx.customer.name}`);
    pdf.setSubject("Cronograma de Manutenções — Lei 13.589/2018");
    pdf.setProducer("Dominex");

    for (let i = 0; i < 12; i++) {
      const month = new Date(Date.UTC(startMonth.getUTCFullYear(), startMonth.getUTCMonth() + i, 1));
      await drawCronogramaMesPage({
        pdf,
        ctx,
        month,
        serviceOrders,
      });
    }

    const pdfBytes = await pdf.save();

    // ---- Próxima versão
    const { data: maxRow } = await supabase
      .from("pmoc_documents")
      .select("version")
      .eq("contract_id", contract.id)
      .eq("company_id", contract.company_id)
      .eq("doc_type", "cronograma_anual")
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();

    const nextVersion = (maxRow?.version ?? 0) + 1;
    const storagePath = `${contract.company_id}/${contract.id}/cronograma_anual-v${nextVersion}.pdf`;

    const { error: uploadErr } = await supabase.storage
      .from("pmoc-documents")
      .upload(storagePath, pdfBytes, {
        contentType: "application/pdf",
        upsert: false,
      });

    if (uploadErr) {
      console.error("[generate-pmoc-cronograma-pdf] upload error", {
        contract_id: maskUuid(contract.id),
        message: uploadErr.message,
      });
      return jsonResponse({ error: "upload_failed" }, 500);
    }

    const { error: insertErr } = await supabase.from("pmoc_documents").insert({
      company_id: contract.company_id,
      contract_id: contract.id,
      doc_type: "cronograma_anual",
      version: nextVersion,
      content_hash: contentHash,
      pdf_storage_path: storagePath,
      generated_by: userId,
    });

    if (insertErr) {
      await supabase.storage.from("pmoc-documents").remove([storagePath]);
      console.error("[generate-pmoc-cronograma-pdf] insert error", {
        contract_id: maskUuid(contract.id),
        message: insertErr.message,
      });
      return jsonResponse({ error: "persist_failed" }, 500);
    }

    const { data: signed } = await supabase.storage
      .from("pmoc-documents")
      .createSignedUrl(storagePath, 3600);

    if (!signed) {
      return jsonResponse({ error: "sign_failed" }, 500);
    }

    console.log("[generate-pmoc-cronograma-pdf] generated", {
      contract_id: maskUuid(contract.id),
      version: nextVersion,
      content_hash: contentHash.slice(0, 8) + "...",
      orders_count: serviceOrders.length,
      pdf_size_bytes: pdfBytes.length,
      duration_ms: Date.now() - t0,
    });

    return jsonResponse(
      {
        pdf_url: signed.signedUrl,
        version: nextVersion,
        generated_at: new Date().toISOString(),
        cached: false,
      },
      200,
    );
  } catch (err) {
    console.error("[generate-pmoc-cronograma-pdf] unexpected error", {
      message: (err as Error)?.message ?? String(err),
    });
    return jsonResponse({ error: "render_failed" }, 500);
  }
});
