// =============================================================================
// generate-pmoc-dossie-pdf — Gera dossiê PMOC (capa + Termo RT + Certificado).
// =============================================================================
// AUTENTICADA (Authorization obrigatório). Roles admin/gestor/super_admin.
// Plano: docs/planos/2026-05-23-pmoc-onda-C-dossie-cronograma.md §4.2
// Regra: docs/planos/2026-05-23-pmoc-onda-C-rls-rules.md §5.1
//
// Fluxo:
//   1. CORS + Authorization obrigatório.
//   2. Resolver auth.uid().
//   3. Resolver company_id do user + role admin/gestor/super_admin.
//   4. Resolver contrato pedido (404 unificado pra cross-tenant).
//   5. is_pmoc=true (senão 400).
//   6. CNPJ tenant + RT atribuído (senão 400 com mensagem clara).
//   7. Carregar custom_docs.
//   8. Calcular content_hash.
//   9. Cache hit? → retorna signed URL do PDF antigo (TTL 1h).
//  10. Compor PDF: capa + termo + certificado.
//  11. Upload pra bucket pmoc-documents.
//  12. INSERT em pmoc_documents (version = max + 1).
//  13. Retorna { pdf_url, version, cached: false }.
// =============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { PDFDocument } from "https://esm.sh/pdf-lib@1.17.1";
import { drawCapaPage } from "../_shared/pmoc-templates/capa.ts";
import { drawTermoRtPage } from "../_shared/pmoc-templates/termo-rt.ts";
import { drawCertificadoPage } from "../_shared/pmoc-templates/certificado.ts";
import {
  TemplateContext,
  dateToExtenso,
  frequencyLabelFrom,
} from "../_shared/pmoc-templates/context.ts";
import { PmocVariableContext } from "../_shared/pmoc-templates/variables.ts";

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

// Rate limit in-memory: 10 req/min por user (§5.4 RLS rules)
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
    // ---- 1. Authorization obrigatório
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

    // ---- 2. UUID válido no query
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

    // ---- Resolve user via JWT
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

    // Rate limit
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

    // ---- Checagem de role (depois do cross-tenant pra não vazar existência)
    if (!isAdminOrGestor && !isSuperAdmin) {
      return jsonResponse(
        errorBody(
          "forbidden_role",
          "Apenas administradores e gestores podem gerar documentos PMOC. Peça acesso ao administrador da empresa.",
        ),
        403,
      );
    }

    // ---- 5. is_pmoc
    if (contract.is_pmoc !== true) {
      return jsonResponse(
        errorBody(
          "contract_not_pmoc",
          "Este contrato não está marcado como PMOC. Edite o contrato e ative a opção 'Contrato PMOC' para gerar o dossiê.",
          {
            field: "contract.is_pmoc",
            action: { label: "Editar contrato", href: `/contratos/${contractId}/editar` },
          },
        ),
        400,
      );
    }

    // ---- 6. Carregar dependências (tenant, customer, RT, custom_docs)
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
        // CNPJ vive em `company_settings.document` (não há coluna `cnpj`).
        // Onda H: campos extra alimentam o PmocVariableContext do termo/cert.
        .select(
          "name, document, logo_url, white_label_enabled, white_label_logo_url, city, address, address_number, neighborhood, complement, zip_code, state, phone, email",
        )
        .eq("company_id", contract.company_id)
        .maybeSingle(),
      contract.responsible_technician_id
        ? supabase
            .from("responsible_technicians")
            // Onda H: registry_number entra no contexto de variáveis.
            .select(
              "full_name, cft_crea, modality, registry_number, signature_image_url, stamp_image_url",
            )
            .eq("id", contract.responsible_technician_id)
            .maybeSingle()
        : Promise.resolve({ data: null } as { data: null }),
      supabase
        .from("pmoc_contract_documents_custom")
        .select("termo_rt_content, certificado_content")
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

    // ---- Validações bloqueantes (Onda G: mensagens ricas com ação)
    // CNPJ está em `company_settings.document` no schema real (não há coluna `cnpj`).
    const cnpj = (companySettings?.document ?? "").trim();
    if (!cnpj) {
      return jsonResponse(
        errorBody(
          "cnpj_missing",
          "CNPJ da empresa não cadastrado em Configurações > Empresa. O dossiê PMOC exige CNPJ pela Lei 13.589/2018.",
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
    if (!rt) {
      return jsonResponse(
        errorBody(
          "rt_missing",
          "Contrato sem Responsável Técnico vinculado. Edite o contrato e atribua um RT antes de gerar o dossiê.",
          {
            field: "contract.responsible_technician_id",
            action: { label: "Editar contrato", href: `/contratos/${contractId}/editar` },
          },
        ),
        400,
      );
    }
    if (!rt.full_name || !rt.full_name.trim()) {
      return jsonResponse(
        errorBody(
          "rt_full_name_missing",
          "O Responsável Técnico do contrato está sem nome completo cadastrado. Atualize o cadastro do RT antes de gerar o dossiê.",
          {
            field: "responsible_technicians.full_name",
            action: { label: "Ir para Responsáveis Técnicos", href: "/configuracoes/responsaveis-tecnicos" },
          },
        ),
        400,
      );
    }
    if (!rt.modality || !rt.modality.trim()) {
      return jsonResponse(
        errorBody(
          "rt_modality_missing",
          "O Responsável Técnico está sem modalidade cadastrada (ex: Técnico em Refrigeração, Engenheiro Mecânico). Atualize o cadastro do RT.",
          {
            field: "responsible_technicians.modality",
            action: { label: "Ir para Responsáveis Técnicos", href: "/configuracoes/responsaveis-tecnicos" },
          },
        ),
        400,
      );
    }

    // ---- Warnings soft (não bloqueiam — viram header X-Pmoc-Warnings)
    const warnings: string[] = [];
    if (!rt.cft_crea || !rt.cft_crea.trim()) {
      warnings.push("rt_cft_missing");
    }
    if (!customer.address || !customer.address.trim()) {
      warnings.push("customer_address_missing");
    }

    // Logo bytes (best-effort)
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
        // sem logo é ok — fallback é texto
      }
    }

    // Cidade (do company_settings, fallback do customer)
    const cidade = (companySettings?.city ?? customer?.city ?? "").trim() || "_______________________";

    // ---- 7. Monta TemplateContext
    const ctx: TemplateContext = {
      empresa: {
        razao_social: tenantName,
        cnpj,
        cidade,
        logo_bytes: logoBytes,
        logo_mime: logoMime,
      },
      rt: {
        nome: rt.full_name,
        modalidade: rt.modality ?? "Técnico em Refrigeração",
        cft_crea: rt.cft_crea ?? null,
        // Onda E: assinatura visual do RT embedada automaticamente quando existir.
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

    // ---- 7.5 (Onda H) PmocVariableContext — chaves "ponto" pra substituir
    //          os <span data-pmoc-var="X"> no HTML do termo/certificado.
    //          17 chaves espelhando o catálogo em variables.ts. Vazio aqui vira
    //          linha pontilhada `____________________` no PDF final.
    const empresaEnderecoFull = [
      companySettings?.address,
      companySettings?.address_number,
      companySettings?.neighborhood,
      companySettings?.complement,
    ]
      .map((s) => (typeof s === "string" ? s.trim() : ""))
      .filter((s) => s.length > 0)
      .join(", ");

    const variableContext: PmocVariableContext = {
      "empresa.nome": tenantName,
      "empresa.razao_social": tenantName,
      "empresa.cnpj": cnpj,
      "empresa.endereco": empresaEnderecoFull,
      "empresa.cidade": (companySettings?.city ?? "").trim(),
      "empresa.estado": (companySettings?.state ?? "").trim(),
      "empresa.telefone": (companySettings?.phone ?? "").trim(),
      "empresa.email": (companySettings?.email ?? "").trim(),
      "rt.nome": rt.full_name,
      "rt.modalidade": rt.modality ?? "",
      "rt.cft_crea": (rt.cft_crea ?? "").trim(),
      "rt.registro": ((rt as { registry_number?: string | null }).registry_number ?? "").trim(),
      "cliente.nome": customer?.name ?? "",
      "cliente.endereco": (customer?.address ?? "").trim(),
      "cliente.cidade": (customer?.city ?? "").trim(),
      "contrato.nome": contract.name ?? "",
      "contrato.vigencia_inicio": dateToExtenso(contract.start_date ?? null),
      "contrato.frequencia": frequencyLabelFrom(
        (contract.frequency_value ?? null) as number | null,
        (contract.frequency_type ?? null) as string | null,
      ),
      "data.hoje_extenso": dateToExtenso(new Date()),
    };

    // ---- 8. content_hash dos campos dinâmicos
    //    Onda E: bump pra dossie_v2 (signature_image_url entra no hash).
    //    Onda H: bump pra dossie_v3 (variableContext entra — campos novos do
    //    company_settings/RT invalidam cache certinho).
    const hashInput = JSON.stringify({
      v: "dossie_v3",
      tenant: { name: tenantName, cnpj, city: cidade, logo: !!logoBytes },
      rt: {
        nome: ctx.rt.nome,
        modalidade: ctx.rt.modalidade,
        cft_crea: ctx.rt.cft_crea,
        signature_image_url: ctx.rt.signature_image_url ?? null,
      },
      customer: ctx.customer,
      contract: ctx.contract,
      termo: customDocs?.termo_rt_content ?? null,
      cert: customDocs?.certificado_content ?? null,
      vars: variableContext,
    });
    const contentHash = await sha256Hex(hashInput);

    // ---- 9. Cache hit?
    const { data: existingDoc } = await supabase
      .from("pmoc_documents")
      .select("id, version, pdf_storage_path, generated_at, notes")
      .eq("contract_id", contract.id)
      .eq("company_id", contract.company_id)
      .eq("doc_type", "dossie_pmoc")
      .eq("content_hash", contentHash)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingDoc) {
      const { data: signed, error: signedErr } = await supabase.storage
        .from("pmoc-documents")
        .createSignedUrl(existingDoc.pdf_storage_path, 3600); // TTL 1h

      if (signedErr || !signed) {
        // PDF não existe no storage (mismatch). Forçar regen.
        console.warn("[generate-pmoc-dossie-pdf] cache hit mas signed URL falhou — regenerando", {
          contract_id: maskUuid(contract.id),
          path: existingDoc.pdf_storage_path,
        });
      } else {
        // Onda E: derivar signature_status do notes; fallback pra checar a URL.
        const sigStatus =
          existingDoc.notes && existingDoc.notes.startsWith("signature:")
            ? existingDoc.notes.split(":")[1] === "pending"
              ? "pending"
              : "signed"
            : ctx.rt.signature_image_url
              ? "signed"
              : "pending";

        console.log("[generate-pmoc-dossie-pdf] cache hit", {
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
            signature_status: sigStatus,
            warnings,
          },
          200,
          warnings.length > 0 ? { "X-Pmoc-Warnings": warnings.join(",") } : {},
        );
      }
    }

    // ---- 10. Compor PDF
    const pdf = await PDFDocument.create();
    pdf.setTitle(`PMOC — Dossiê — ${ctx.customer.name}`);
    pdf.setSubject("Plano de Manutenção, Operação e Controle — Lei 13.589/2018");
    pdf.setProducer("Dominex");

    await drawCapaPage(pdf, ctx);
    const termoResult = await drawTermoRtPage(
      pdf,
      ctx,
      customDocs?.termo_rt_content ?? null,
      variableContext,
    );
    const certResult = await drawCertificadoPage(
      pdf,
      ctx,
      customDocs?.certificado_content ?? null,
      variableContext,
    );

    const pdfBytes = await pdf.save();
    const pdfSize = pdfBytes.length;

    // Onda E: signature_status agregado (pending se QUALQUER página ficou pendente)
    const signatureStatus: "signed" | "pending" =
      termoResult.signaturePending || certResult.signaturePending ? "pending" : "signed";

    // ---- 11. Próxima versão
    const { data: maxRow } = await supabase
      .from("pmoc_documents")
      .select("version")
      .eq("contract_id", contract.id)
      .eq("company_id", contract.company_id)
      .eq("doc_type", "dossie_pmoc")
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();

    const nextVersion = (maxRow?.version ?? 0) + 1;
    const storagePath = `${contract.company_id}/${contract.id}/dossie_pmoc-v${nextVersion}.pdf`;

    // ---- 12. Upload pro storage
    const { error: uploadErr } = await supabase.storage
      .from("pmoc-documents")
      .upload(storagePath, pdfBytes, {
        contentType: "application/pdf",
        upsert: false,
      });

    if (uploadErr) {
      console.error("[generate-pmoc-dossie-pdf] upload error", {
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

    // ---- 13. INSERT em pmoc_documents
    //    Onda E: notes grava signature:status pra que cache hit subsequente
    //    devolva o mesmo status sem re-embedar a imagem.
    const { error: insertErr } = await supabase.from("pmoc_documents").insert({
      company_id: contract.company_id,
      contract_id: contract.id,
      doc_type: "dossie_pmoc",
      version: nextVersion,
      content_hash: contentHash,
      pdf_storage_path: storagePath,
      generated_by: userId,
      notes: `signature:${signatureStatus}`,
    });

    if (insertErr) {
      // Tenta limpar PDF órfão
      await supabase.storage.from("pmoc-documents").remove([storagePath]);
      console.error("[generate-pmoc-dossie-pdf] insert error", {
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

    // ---- Signed URL pra retorno
    const { data: signed, error: signedErr } = await supabase.storage
      .from("pmoc-documents")
      .createSignedUrl(storagePath, 3600);

    if (signedErr || !signed) {
      return jsonResponse(
        errorBody(
          "pdf_generation_failed",
          "PDF gerado, mas houve falha ao gerar o link de download. Tente novamente.",
        ),
        500,
      );
    }

    console.log("[generate-pmoc-dossie-pdf] generated", {
      contract_id: maskUuid(contract.id),
      version: nextVersion,
      content_hash: contentHash.slice(0, 8) + "...",
      pdf_size_bytes: pdfSize,
      tags_removed_termo: termoResult.tagsRemoved,
      attrs_removed_termo: termoResult.attrsRemoved,
      tags_removed_cert: certResult.tagsRemoved,
      attrs_removed_cert: certResult.attrsRemoved,
      signature_status: signatureStatus,
      warnings: warnings.length,
      duration_ms: Date.now() - t0,
    });

    return jsonResponse(
      {
        pdf_url: signed.signedUrl,
        version: nextVersion,
        generated_at: new Date().toISOString(),
        cached: false,
        signature_status: signatureStatus,
        warnings,
      },
      200,
      warnings.length > 0 ? { "X-Pmoc-Warnings": warnings.join(",") } : {},
    );
  } catch (err) {
    console.error("[generate-pmoc-dossie-pdf] unexpected error", {
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
