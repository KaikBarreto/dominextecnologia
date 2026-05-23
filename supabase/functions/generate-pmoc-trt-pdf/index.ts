// =============================================================================
// generate-pmoc-trt-pdf — Gera SÓ o Termo de Responsabilidade Técnica (1 doc).
// =============================================================================
// AUTENTICADA (Authorization obrigatório). Roles admin/gestor/super_admin.
// Plano: Onda E (v1.9.x) — TRT como documento separado.
// Espelha generate-pmoc-dossie-pdf mas:
//   - Renderiza só 1 página (Termo RT), sem capa, sem certificado.
//   - doc_type='termo_rt' ao gravar em pmoc_documents.
//   - Hash inclui signature_image_url (RT atualiza assinatura → cache miss).
//   - Retorno: { pdf_url, version, cached, signature_status }.
// =============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { PDFDocument } from "https://esm.sh/pdf-lib@1.17.1";
import { drawTermoRtPage } from "../_shared/pmoc-templates/termo-rt.ts";
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

// Rate limit in-memory: 10 req/min por user
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
    // ---- 1. Authorization obrigatório
    const authHeader = req.headers.get("Authorization") ?? req.headers.get("authorization");
    if (!authHeader || !authHeader.toLowerCase().startsWith("bearer ")) {
      return jsonResponse({ error: "unauthorized" }, 401);
    }

    // ---- 2. UUID válido no query
    const url = new URL(req.url);
    const contractId = url.searchParams.get("contract_id");
    if (!contractId || !UUID_REGEX.test(contractId)) {
      return jsonResponse({ error: "invalid_contract_id" }, 400);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // ---- Resolve user via JWT
    const supabaseAuthed = createClient(supabaseUrl, serviceRoleKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await supabaseAuthed.auth.getUser();
    if (userErr || !userData?.user?.id) {
      return jsonResponse({ error: "unauthorized" }, 401);
    }
    const userId = userData.user.id;

    // Rate limit
    if (!rateLimitOk(userId)) {
      return jsonResponse({ error: "rate_limited" }, 429, { "Retry-After": "60" });
    }

    // ---- Service-role client (RLS bypass + queries explícitas com filtro defensivo)
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // ---- 3. Resolver tenant + role do user
    const [{ data: profileRow }, { data: rolesRows }] = await Promise.all([
      supabase.from("profiles").select("company_id").eq("user_id", userId).maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", userId),
    ]);
    const userCompany = profileRow?.company_id ?? null;
    const roles = new Set((rolesRows ?? []).map((r) => r.role));
    const isSuperAdmin = roles.has("super_admin");
    const isAdminOrGestor = roles.has("admin") || roles.has("gestor");

    // ---- 4. Resolver contrato — 404 unificado pra cross-tenant
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

    // ---- Checagem de role (depois do cross-tenant pra não vazar existência)
    if (!isAdminOrGestor && !isSuperAdmin) {
      return jsonResponse(
        { error: "forbidden_role", message: "Apenas administradores e gestores podem gerar documentos PMOC." },
        403,
      );
    }

    // ---- 5. is_pmoc
    if (contract.is_pmoc !== true) {
      return jsonResponse({ error: "not_a_pmoc_contract" }, 400);
    }

    // ---- 6. Carregar dependências (tenant, customer, RT com assinatura, custom_docs)
    const [
      { data: customer },
      { data: companySettings },
      { data: rt },
      { data: customDocs },
    ] = await Promise.all([
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
            .select("full_name, cft_crea, modality, signature_image_url, stamp_image_url")
            .eq("id", contract.responsible_technician_id)
            .maybeSingle()
        : Promise.resolve({ data: null } as { data: null }),
      supabase
        .from("pmoc_contract_documents_custom")
        .select("termo_rt_content")
        .eq("contract_id", contract.id)
        .eq("company_id", contract.company_id) // filtro defensivo cross-tenant
        .maybeSingle(),
    ]);

    // Resolver tenant name (fallback companies.name)
    let tenantName = (companySettings?.name ?? "").trim();
    if (!tenantName) {
      const { data: companyRow } = await supabase
        .from("companies")
        .select("name")
        .eq("id", contract.company_id)
        .maybeSingle();
      tenantName = (companyRow?.name ?? "").trim() || "Empresa";
    }

    const cnpj = (companySettings?.cnpj ?? "").trim();
    if (!cnpj) {
      return jsonResponse(
        {
          error: "cnpj_missing",
          message: "Configure o CNPJ da empresa em Configurações antes de gerar o Termo RT.",
        },
        400,
      );
    }
    if (!rt || !rt.full_name) {
      return jsonResponse(
        {
          error: "rt_missing",
          message: "Atribua um Responsável Técnico ao contrato antes de gerar o Termo RT.",
        },
        400,
      );
    }

    // Cidade (do company_settings, fallback do customer)
    const cidade = (companySettings?.city ?? customer?.city ?? "").trim() || "_______________________";

    // ---- 7. Monta TemplateContext (sem logo — TRT não usa capa)
    const ctx: TemplateContext = {
      empresa: {
        razao_social: tenantName,
        cnpj,
        cidade,
        logo_bytes: null,
        logo_mime: null,
      },
      rt: {
        nome: rt.full_name,
        modalidade: rt.modality ?? "Técnico em Refrigeração",
        cft_crea: rt.cft_crea ?? null,
        signature_image_url: rt.signature_image_url ?? null,
        stamp_image_url: rt.stamp_image_url ?? null,
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

    // ---- 8. content_hash — INCLUI signature_image_url (Onda E:
    //         RT atualiza assinatura → hash muda → cache miss → nova versão).
    const hashInput = JSON.stringify({
      v: "trt_v1",
      tenant: { name: tenantName, cnpj, city: cidade },
      rt: {
        nome: ctx.rt.nome,
        modalidade: ctx.rt.modalidade,
        cft_crea: ctx.rt.cft_crea,
        // URL faz parte do hash — se o RT troca a assinatura, regen é forçado.
        signature_image_url: ctx.rt.signature_image_url ?? null,
      },
      customer: ctx.customer,
      contract: ctx.contract,
      termo: customDocs?.termo_rt_content ?? null,
    });
    const contentHash = await sha256Hex(hashInput);

    // ---- 9. Cache hit?
    const { data: existingDoc } = await supabase
      .from("pmoc_documents")
      .select("id, version, pdf_storage_path, generated_at, notes")
      .eq("contract_id", contract.id)
      .eq("company_id", contract.company_id)
      .eq("doc_type", "termo_rt")
      .eq("content_hash", contentHash)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingDoc) {
      const { data: signed, error: signedErr } = await supabase.storage
        .from("pmoc-documents")
        .createSignedUrl(existingDoc.pdf_storage_path, 3600); // TTL 1h

      if (signedErr || !signed) {
        console.warn("[generate-pmoc-trt-pdf] cache hit mas signed URL falhou — regenerando", {
          contract_id: maskUuid(contract.id),
          path: existingDoc.pdf_storage_path,
        });
      } else {
        // Estimar signature_status do notes (gravado no INSERT)
        const sigStatus =
          existingDoc.notes && existingDoc.notes.startsWith("signature:")
            ? existingDoc.notes.split(":")[1] === "pending"
              ? "pending"
              : "signed"
            : ctx.rt.signature_image_url
              ? "signed"
              : "pending";

        console.log("[generate-pmoc-trt-pdf] cache hit", {
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
            signature_status: sigStatus,
          },
          200,
        );
      }
    }

    // ---- 10. Compor PDF (só o Termo RT)
    const pdf = await PDFDocument.create();
    pdf.setTitle(`PMOC — Termo de Responsabilidade Técnica — ${ctx.customer.name}`);
    pdf.setSubject("Termo de Responsabilidade Técnica — Lei 13.589/2018");
    pdf.setProducer("Dominex");

    const termoResult = await drawTermoRtPage(pdf, ctx, customDocs?.termo_rt_content ?? null);

    const pdfBytes = await pdf.save();
    const pdfSize = pdfBytes.length;

    const signatureStatus: "signed" | "pending" = termoResult.signaturePending
      ? "pending"
      : "signed";

    // ---- 11. Próxima versão
    const { data: maxRow } = await supabase
      .from("pmoc_documents")
      .select("version")
      .eq("contract_id", contract.id)
      .eq("company_id", contract.company_id)
      .eq("doc_type", "termo_rt")
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();

    const nextVersion = (maxRow?.version ?? 0) + 1;
    const storagePath = `${contract.company_id}/${contract.id}/termo_rt-v${nextVersion}.pdf`;

    // ---- 12. Upload pro storage
    const { error: uploadErr } = await supabase.storage
      .from("pmoc-documents")
      .upload(storagePath, pdfBytes, {
        contentType: "application/pdf",
        upsert: false,
      });

    if (uploadErr) {
      console.error("[generate-pmoc-trt-pdf] upload error", {
        contract_id: maskUuid(contract.id),
        message: uploadErr.message,
      });
      return jsonResponse({ error: "upload_failed" }, 500);
    }

    // ---- 13. INSERT em pmoc_documents — grava signature_status no notes pra
    //         que o cache hit subsequente saiba devolver sem precisar embedar.
    const { error: insertErr } = await supabase.from("pmoc_documents").insert({
      company_id: contract.company_id,
      contract_id: contract.id,
      doc_type: "termo_rt",
      version: nextVersion,
      content_hash: contentHash,
      pdf_storage_path: storagePath,
      generated_by: userId,
      notes: `signature:${signatureStatus}`,
    });

    if (insertErr) {
      // Tenta limpar PDF órfão
      await supabase.storage.from("pmoc-documents").remove([storagePath]);
      console.error("[generate-pmoc-trt-pdf] insert error", {
        contract_id: maskUuid(contract.id),
        message: insertErr.message,
      });
      return jsonResponse({ error: "persist_failed" }, 500);
    }

    // ---- Signed URL pra retorno
    const { data: signed, error: signedErr } = await supabase.storage
      .from("pmoc-documents")
      .createSignedUrl(storagePath, 3600);

    if (signedErr || !signed) {
      return jsonResponse({ error: "sign_failed" }, 500);
    }

    console.log("[generate-pmoc-trt-pdf] generated", {
      contract_id: maskUuid(contract.id),
      version: nextVersion,
      content_hash: contentHash.slice(0, 8) + "...",
      pdf_size_bytes: pdfSize,
      tags_removed: termoResult.tagsRemoved,
      attrs_removed: termoResult.attrsRemoved,
      signature_status: signatureStatus,
      duration_ms: Date.now() - t0,
    });

    return jsonResponse(
      {
        pdf_url: signed.signedUrl,
        version: nextVersion,
        generated_at: new Date().toISOString(),
        cached: false,
        signature_status: signatureStatus,
      },
      200,
    );
  } catch (err) {
    console.error("[generate-pmoc-trt-pdf] unexpected error", {
      message: (err as Error)?.message ?? String(err),
    });
    return jsonResponse({ error: "render_failed" }, 500);
  }
});
