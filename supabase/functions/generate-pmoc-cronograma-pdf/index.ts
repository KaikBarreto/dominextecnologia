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

// =============================================================================
// Erro padronizado (Onda G): code + message PT-BR + field + action.
// =============================================================================
type ErrorAction = { label: string; href: string };
interface StandardError {
  error: string; // mantém retrocompat (legacy)
  code: string;
  message: string;
  field?: string;
  action?: ErrorAction;
}

function errorBody(
  code: string,
  message: string,
  opts: { field?: string; action?: ErrorAction } = {},
): StandardError {
  return {
    error: code,
    code,
    message,
    ...(opts.field ? { field: opts.field } : {}),
    ...(opts.action ? { action: opts.action } : {}),
  };
}

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
    return jsonResponse(
      errorBody("method_not_allowed", "Método HTTP não suportado."),
      405,
    );
  }

  const t0 = Date.now();

  try {
    const authHeader = req.headers.get("Authorization") ?? req.headers.get("authorization");
    if (!authHeader || !authHeader.toLowerCase().startsWith("bearer ")) {
      return jsonResponse(
        errorBody(
          "unauthorized",
          "Sessão expirada. Faça login novamente para gerar o documento.",
        ),
        401,
      );
    }

    const url = new URL(req.url);
    const contractId = url.searchParams.get("contract_id");
    if (!contractId || !UUID_REGEX.test(contractId)) {
      return jsonResponse(
        errorBody(
          "invalid_contract_id",
          "Identificador do contrato inválido. Atualize a página e tente novamente.",
          { field: "contract.id" },
        ),
        400,
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabaseAuthed = createClient(supabaseUrl, serviceRoleKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await supabaseAuthed.auth.getUser();
    if (userErr || !userData?.user?.id) {
      return jsonResponse(
        errorBody(
          "unauthorized",
          "Sessão expirada. Faça login novamente para gerar o documento.",
        ),
        401,
      );
    }
    const userId = userData.user.id;

    if (!rateLimitOk(userId)) {
      return jsonResponse(
        errorBody(
          "rate_limited",
          "Muitas tentativas em pouco tempo. Aguarde 1 minuto antes de gerar novamente.",
        ),
        429,
        { "Retry-After": "60" },
      );
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // can_manage_contracts é a fonte única da verdade da régua de acesso
    // (super_admin/admin/gestor OU acesso total OU permissão de contratos).
    const [{ data: profileRow }, { data: rolesRows }, { data: canManage }] = await Promise.all([
      supabase.from("profiles").select("company_id").eq("user_id", userId).maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", userId),
      supabase.rpc("can_manage_contracts", { _user_id: userId }),
    ]);
    const userCompany = profileRow?.company_id ?? null;
    const roles = new Set((rolesRows ?? []).map((r) => r.role));
    const isSuperAdmin = roles.has("super_admin");

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
      return jsonResponse(
        errorBody(
          "not_found",
          "Contrato não encontrado. Pode ter sido excluído ou você não tem acesso a ele.",
        ),
        404,
      );
    }
    if (!isSuperAdmin && contract.company_id !== userCompany) {
      // 404 unificado: não vaza existência cross-tenant.
      return jsonResponse(
        errorBody(
          "not_found",
          "Contrato não encontrado. Pode ter sido excluído ou você não tem acesso a ele.",
        ),
        404,
      );
    }
    if (canManage !== true) {
      return jsonResponse(
        errorBody(
          "forbidden_role",
          "Você não tem permissão para gerar documentos deste contrato. Peça acesso aos contratos ao administrador da sua empresa.",
        ),
        403,
      );
    }
    if (contract.is_pmoc !== true) {
      return jsonResponse(
        errorBody(
          "contract_not_pmoc",
          "Este contrato não está marcado como PMOC. Edite o contrato e ative a opção 'Contrato PMOC' para gerar o cronograma.",
          {
            field: "contract.is_pmoc",
            action: { label: "Editar contrato", href: `/contratos/${contractId}/editar` },
          },
        ),
        400,
      );
    }

    const [{ data: customer }, { data: companySettings }, { data: rt }] = await Promise.all([
      supabase
        .from("customers")
        .select("name, address, city, state")
        .eq("id", contract.customer_id)
        .maybeSingle(),
      supabase
        .from("company_settings")
        // CNPJ vive em `company_settings.document` (não há coluna `cnpj`).
        .select("name, document, logo_url, white_label_enabled, white_label_logo_url, city")
        .eq("company_id", contract.company_id)
        .maybeSingle(),
      contract.responsible_technician_id
        ? supabase
            .from("responsible_technicians")
            .select("full_name, cft_crea, modality, signature_image_url, stamp_image_url")
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

    // ---- Validações bloqueantes (Onda G).
    //      Cronograma exige: CNPJ + customer (RT é opcional aqui — o cronograma
    //      não renderiza assinatura/CFT, só calendário).
    // CNPJ está em `company_settings.document` no schema real (não há coluna `cnpj`).
    const cnpj = (companySettings?.document ?? "").trim();
    if (!cnpj) {
      return jsonResponse(
        errorBody(
          "cnpj_missing",
          "CNPJ da empresa não cadastrado em Configurações > Empresa. O cronograma PMOC exige CNPJ pela Lei 13.589/2018.",
          {
            field: "company_settings.document",
            action: { label: "Ir para Configurações", href: "/configuracoes/empresa" },
          },
        ),
        400,
      );
    }
    if (!customer) {
      return jsonResponse(
        errorBody(
          "customer_missing",
          "O contrato não tem cliente vinculado. Edite o contrato e selecione um cliente.",
          {
            field: "contract.customer_id",
            action: { label: "Editar contrato", href: `/contratos/${contractId}/editar` },
          },
        ),
        400,
      );
    }

    // ---- Warnings soft (não bloqueiam — viram header X-Pmoc-Warnings).
    //      Cronograma só usa endereço no cabeçalho informativo, então ausência
    //      vira "—" no PDF, mas o usuário é avisado.
    const warnings: string[] = [];
    if (!customer.address || !customer.address.trim()) {
      warnings.push("customer_address_missing");
    }
    if (rt && (!rt.cft_crea || !rt.cft_crea.trim())) {
      warnings.push("rt_cft_missing");
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

    // ---- Hash baseado em OSs + datas + statuses + janela.
    //    Onda E: bump pra cronograma_v2 (signature_image_url do RT entra no
    //    hash, mesmo que o cronograma não desenhe assinatura — coerência: "se
    //    o RT muda a assinatura, TODOS os PDFs do contrato regeneram", lei do
    //    CEO).
    const hashInput = JSON.stringify({
      v: "cronograma_v3",
      tenant: tenantName,
      customer: customer?.name ?? "",
      window: { start: startIso, end: endIso },
      rt_signature: rt?.signature_image_url ?? null,
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
          warnings: warnings.length,
          duration_ms: Date.now() - t0,
        });
        return jsonResponse(
          {
            pdf_url: signed.signedUrl,
            version: existingDoc.version,
            generated_at: existingDoc.generated_at,
            cached: true,
            warnings,
          },
          200,
          warnings.length > 0 ? { "X-Pmoc-Warnings": warnings.join(",") } : {},
        );
      }
    }

    // ---- TemplateContext (cronograma usa só tenant + customer + contract pra cabeçalho)
    const cidade = (companySettings?.city ?? customer?.city ?? "").trim() || "";
    const ctx: TemplateContext = {
      empresa: {
        razao_social: tenantName,
        cnpj,
        cidade,
        logo_bytes: logoBytes,
        logo_mime: logoMime,
      },
      rt: {
        nome: rt?.full_name ?? "",
        modalidade: rt?.modality ?? "",
        cft_crea: rt?.cft_crea ?? null,
        signature_image_url: rt?.signature_image_url ?? null,
        stamp_image_url: rt?.stamp_image_url ?? null,
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
      return jsonResponse(
        errorBody(
          "pdf_generation_failed",
          "Falha ao salvar o PDF. Tente novamente em alguns segundos. Se o problema continuar, contate o suporte.",
        ),
        500,
      );
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
      return jsonResponse(
        errorBody(
          "pdf_generation_failed",
          "Falha ao registrar o PDF gerado. Tente novamente em alguns segundos.",
        ),
        500,
      );
    }

    const { data: signed } = await supabase.storage
      .from("pmoc-documents")
      .createSignedUrl(storagePath, 3600);

    if (!signed) {
      return jsonResponse(
        errorBody(
          "pdf_generation_failed",
          "PDF gerado, mas houve falha ao gerar o link de download. Tente novamente.",
        ),
        500,
      );
    }

    console.log("[generate-pmoc-cronograma-pdf] generated", {
      contract_id: maskUuid(contract.id),
      version: nextVersion,
      content_hash: contentHash.slice(0, 8) + "...",
      orders_count: serviceOrders.length,
      pdf_size_bytes: pdfBytes.length,
      warnings: warnings.length,
      duration_ms: Date.now() - t0,
    });

    return jsonResponse(
      {
        pdf_url: signed.signedUrl,
        version: nextVersion,
        generated_at: new Date().toISOString(),
        cached: false,
        warnings,
      },
      200,
      warnings.length > 0 ? { "X-Pmoc-Warnings": warnings.join(",") } : {},
    );
  } catch (err) {
    console.error("[generate-pmoc-cronograma-pdf] unexpected error", {
      message: (err as Error)?.message ?? String(err),
    });
    return jsonResponse(
      errorBody(
        "pdf_generation_failed",
        "Falha inesperada ao gerar o documento. Tente novamente em alguns segundos. Se persistir, contate o suporte.",
      ),
      500,
    );
  }
});
