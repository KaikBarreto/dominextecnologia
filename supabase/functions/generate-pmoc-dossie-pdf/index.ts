// =============================================================================
// generate-pmoc-dossie-pdf — Gera dossiê PMOC (capa + Termo RT + Certificado +
//                            Cronograma Anual de 12 meses).
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
//  10. Compor PDF: capa + termo + certificado + cronograma (12 páginas).
//  11. Upload pra bucket pmoc-documents.
//  12. INSERT em pmoc_documents (version = max + 1).
//  13. Retorna { pdf_url, version, cached: false }.
// =============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { PDFDocument } from "https://esm.sh/pdf-lib@1.17.1";
import QRCode from "https://esm.sh/qrcode@1.5.4";
import { drawCapaPage } from "../_shared/pmoc-templates/capa.ts";
import { drawTermoRtPage } from "../_shared/pmoc-templates/termo-rt.ts";
import { drawCertificadoPage } from "../_shared/pmoc-templates/certificado.ts";
import {
  drawCronogramaMesPage,
  CronogramaServiceOrder,
} from "../_shared/pmoc-templates/cronograma-mes.ts";
import {
  drawPlanilha,
  PlanilhaActivity,
  PlanilhaAmbiente,
  PlanilhaAmbienteBlock,
  PlanilhaData,
  PlanilhaEquipment,
} from "../_shared/pmoc-templates/planilha.ts";
import {
  TemplateContext,
  computeValidUntil,
  dateToExtenso,
  extractContractCreatedParts,
  formatDateBr,
  frequencyLabelFrom,
} from "../_shared/pmoc-templates/context.ts";
import { PmocVariableContext } from "../_shared/pmoc-templates/variables.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Portal PMOC público — mesma base/rota usada em generate-pmoc-qr-pdf e em
// buildPmocPortalUrl no frontend (`/contrato/unidade/<token>`).
const APP_DOMAIN = "https://dominex.app";
const PORTAL_PATH = "/contrato/unidade";

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

// Reduz um PNG p/ no máx. `maxSide` px de lado mantendo proporção. Só age se a
// imagem for maior que o limite. Best-effort: qualquer falha devolve os bytes
// originais (o pior caso vira o comportamento antigo, não um erro). Evita que
// logos gigantes (raster descomprimido de dezenas de MB por decode) estourem a
// memória do worker quando embedados várias vezes no Dossiê.
async function downscalePngIfLarge(
  bytes: Uint8Array,
  maxSide: number,
): Promise<Uint8Array> {
  try {
    const { Image } = await import("https://deno.land/x/imagescript@1.2.17/mod.ts");
    const img = await Image.decode(bytes);
    const longest = Math.max(img.width, img.height);
    if (longest <= maxSide) return bytes;
    const scale = maxSide / longest;
    img.resize(Math.round(img.width * scale), Math.round(img.height * scale));
    return await img.encode();
  } catch {
    return bytes;
  }
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

    // ---- 3. Resolver tenant + role do user + permissão de contratos
    //    can_manage_contracts é a fonte única da verdade da régua de acesso
    //    (super_admin/admin/gestor OU acesso total OU permissão de contratos).
    const [{ data: profileRow }, { data: rolesRows }, { data: canManage }] = await Promise.all([
      supabase.from("profiles").select("company_id").eq("user_id", userId).maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", userId),
      supabase.rpc("can_manage_contracts", { _user_id: userId }),
    ]);
    const userCompany = profileRow?.company_id ?? null;
    const roles = new Set((rolesRows ?? []).map((r) => r.role));
    const isSuperAdmin = roles.has("super_admin");

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
          // Onda H+ — usado pra `contrato.criado_{dia,mes,ano}` no termo/cert.
          "created_at",
          // Link + QR do Portal PMOC na capa (preenchido pela trigger
          // ensure_pmoc_token quando is_pmoc=true).
          "public_pmoc_token",
          // Seção 1 da Planilha embutida — identificação da UNIDADE/local
          // (1 contrato = 1 unidade, endereço pode ser próprio). Vazio → cliente.
          "unidade_nome",
          "unidade_endereco",
          "unidade_numero",
          "unidade_complemento",
          "unidade_bairro",
          "unidade_cidade",
          "unidade_uf",
          "unidade_cep",
          // Seção 4 da Planilha embutida — caracterização do ambiente climatizado.
          "pmoc_tipo_atividade",
          "pmoc_identificacao_ambiente",
          "pmoc_area_climatizada_m2",
          "pmoc_ocupantes_fixos",
          "pmoc_ocupantes_flutuantes",
          "pmoc_carga_termica_tr",
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

    // ---- Checagem de permissão (depois do cross-tenant pra não vazar existência)
    if (canManage !== true) {
      return jsonResponse(
        errorBody(
          "forbidden_role",
          "Você não tem permissão para gerar documentos deste contrato. Peça acesso aos contratos ao administrador da sua empresa.",
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
      { data: docTemplates },
    ] = await Promise.all([
      supabase
        .from("customers")
        .select("name, document, address, city, state")
        .eq("id", contract.customer_id)
        .maybeSingle(),
      supabase
        .from("company_settings")
        // CNPJ vive em `company_settings.document` (não há coluna `cnpj`).
        // Onda H: campos extra alimentam o PmocVariableContext do termo/cert.
        // Onda I: + report_header_* pra estilizar o cabeçalho identidade do
        //         tenant no topo do Termo RT (embedded no Dossiê).
        .select(
          "name, document, logo_url, white_label_enabled, white_label_logo_url, city, address, address_number, neighborhood, complement, zip_code, state, phone, email, report_header_bg_color, report_header_text_color, report_header_logo_size",
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
      // Validade configurável por empresa (TRT + Certificado). O Dossiê NÃO
      // persiste valid_until (fica null), mas usa a validade do TRT pra
      // preencher a linha "Válido até …" nas páginas embutidas.
      supabase
        .from("company_pmoc_document_templates")
        .select("termo_rt_validity_months, certificado_validity_months")
        .eq("company_id", contract.company_id)
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

    // ---- Onda Memória (2026-06): downscale defensivo do logo.
    //   O logo nunca é desenhado acima de ~72pt, mas alguns tenants sobem PNGs
    //   gigantes (ex.: Glacial = 1898x1898 ≈ 13,7 MB descomprimidos por decode).
    //   Cada embed no pdf-lib decodifica o raster inteiro; o Dossiê embeda o
    //   logo na capa + Termo RT + cronograma, e o pico somado estourava a
    //   memória do worker (WORKER_RESOURCE_LIMIT, sem cair no catch). Reduzimos
    //   pra no máx. 512px de lado UMA vez aqui — best-effort: se a redução
    //   falhar, seguimos com os bytes originais.
    if (logoBytes && logoMime === "image/png") {
      logoBytes = await downscalePngIfLarge(logoBytes, 512);
    }

    // Cidade (do company_settings, fallback do customer)
    const cidade = (companySettings?.city ?? customer?.city ?? "").trim() || "_______________________";

    // ---- (Onda I — v1.9.x) Cores do report_header_* pro cabeçalho identidade
    //      tenant no Termo RT (embedded no Dossiê).
    const dossieHeaderBg =
      ((companySettings as unknown as Record<string, unknown>)?.report_header_bg_color as string | null) ?? null;
    const dossieHeaderText =
      ((companySettings as unknown as Record<string, unknown>)?.report_header_text_color as string | null) ?? null;
    const dossieHeaderLogoSize =
      ((companySettings as unknown as Record<string, unknown>)?.report_header_logo_size as number | null) ?? null;

    // ---- 6.9 Portal PMOC: URL pública + QR Code pra capa (canto inf. direito).
    //      Token vem de contracts.public_pmoc_token (mesma fonte do portal e do
    //      generate-pmoc-qr-pdf). Sem token → não renderiza o bloco.
    const portalToken = (contract as { public_pmoc_token?: string | null })
      .public_pmoc_token ?? null;
    let portalUrl: string | null = null;
    let portalQrPng: Uint8Array | null = null;
    if (portalToken) {
      portalUrl = `${APP_DOMAIN}${PORTAL_PATH}/${portalToken}`;
      try {
        const qrPngDataUrl = await QRCode.toDataURL(portalUrl, {
          errorCorrectionLevel: "M",
          margin: 1,
          width: 400,
          color: { dark: "#000000", light: "#FFFFFF" },
        });
        portalQrPng = Uint8Array.from(
          atob(qrPngDataUrl.replace(/^data:image\/png;base64,/, "")),
          (c) => c.charCodeAt(0),
        );
      } catch (e) {
        // QR best-effort — capa segue sem o bloco do portal se falhar.
        console.warn("[generate-pmoc-dossie-pdf] qr generation failed", {
          message: (e as Error)?.message ?? String(e),
        });
        portalUrl = null;
      }
    }

    // ---- 7. Monta TemplateContext
    const ctx: TemplateContext = {
      empresa: {
        razao_social: tenantName,
        cnpj,
        cidade,
        logo_bytes: logoBytes,
        logo_mime: logoMime,
        // Onda I (v1.9.x) — campos extras pro cabeçalho identidade tenant no
        // Termo RT (página 2 do Dossiê) e pro rodapé Dominex (oculto em
        // white-label).
        phone: companySettings?.phone ?? null,
        email: companySettings?.email ?? null,
        address: companySettings?.address ?? null,
        address_number: companySettings?.address_number ?? null,
        neighborhood: companySettings?.neighborhood ?? null,
        state: companySettings?.state ?? null,
        zip_code: companySettings?.zip_code ?? null,
        header_bg_color: dossieHeaderBg,
        header_text_color: dossieHeaderText,
        header_logo_size: dossieHeaderLogoSize,
        white_label_enabled: useWhiteLabel,
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
      portal_url: portalUrl,
      portal_qr_png: portalQrPng,
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

    // Onda H+ — partes de `contracts.created_at` pras 3 variáveis novas
    //          usadas na assinatura "Cidade, DD de mês de AAAA." do termo RT.
    const createdParts = extractContractCreatedParts(
      (contract as { created_at?: string | null }).created_at ?? null,
    );

    // Validade pras páginas embutidas (Termo RT + Certificado). O Dossiê é um
    // documento composto: usamos a validade do TRT como referência da linha
    // "Válido até …" — limitação conhecida quando TRT e Certificado têm
    // durações diferentes (a página do Certificado embutida herda a do TRT).
    // O Certificado individual (edge própria) usa a duração correta dele.
    const generatedAt = new Date();
    const termoValidityMonths =
      ((docTemplates as { termo_rt_validity_months?: number | null } | null)
        ?.termo_rt_validity_months) ?? 12;
    const { formatted: validUntilFormatted } = computeValidUntil(
      generatedAt,
      termoValidityMonths,
    );
    const validadeLabel = `${termoValidityMonths} ${termoValidityMonths === 1 ? "mês" : "meses"}`;

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
      "cliente.documento": (customer?.document ?? "").trim(),
      "cliente.endereco": (customer?.address ?? "").trim(),
      "cliente.cidade": (customer?.city ?? "").trim(),
      "contrato.nome": contract.name ?? "",
      "contrato.vigencia_inicio": dateToExtenso(contract.start_date ?? null),
      "contrato.frequencia": frequencyLabelFrom(
        (contract.frequency_value ?? null) as number | null,
        (contract.frequency_type ?? null) as string | null,
      ),
      "contrato.criado_dia": createdParts.dia,
      "contrato.criado_mes": createdParts.mes,
      "contrato.criado_ano": createdParts.ano,
      "data.hoje_extenso": dateToExtenso(generatedAt),
      "documento.validade": validadeLabel,
      "documento.data_vencimento": validUntilFormatted,
      "documento.data_emissao": formatDateBr(generatedAt),
    };

    // ---- 7.6 (Onda L) Cronograma anual — janela de 12 meses a partir do mês
    //          atual. COPIA a lógica de generate-pmoc-cronograma-pdf pra incluir
    //          as 12 páginas de calendário ao final do Dossiê.
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

    const cronogramaOrders: CronogramaServiceOrder[] = (orders ?? []).map((o) => ({
      id: o.id,
      order_number: o.order_number ?? null,
      scheduled_date: o.scheduled_date ?? null,
      status: o.status,
    }));

    // ---- 7.7 (Planilha PMOC — Fase 4) Equipamentos + plano de manutenção +
    //          resumo de execução. A Planilha vira páginas finais do Dossiê.
    const [
      { data: environments },
      { data: contractItems },
      { data: planActivities },
      { data: allOrders },
    ] = await Promise.all([
      // Ambientes climatizados do contrato (1→N). Ordem do cadastro.
      supabase
        .from("contract_environments")
        .select(
          "id, identificacao, tipo_atividade, area_climatizada_m2, ocupantes_fixos, ocupantes_flutuantes, carga_termica_tr, sort_order",
        )
        .eq("contract_id", contract.id)
        .order("sort_order", { ascending: true }),
        supabase
          .from("contract_items")
          .select(
            "id, environment_id, equipment_id, item_name, sort_order, equipment:equipment(name, brand, model, capacity, location, serial_number)",
          )
          .eq("contract_id", contract.id)
          .order("sort_order", { ascending: true }),
        supabase
          .from("contract_plan_activities")
          .select("section, component, description, freq_code, freq_months, is_active, sort_order")
          .eq("contract_id", contract.id)
          .eq("company_id", contract.company_id)
          .order("sort_order", { ascending: true }),
        supabase
          .from("service_orders")
          .select("id, status")
          .eq("contract_id", contract.id)
          .eq("company_id", contract.company_id),
      ]);

    type ContractItemRow = {
      environment_id: string | null;
      item_name: string | null;
      equipment:
        | {
            name: string | null;
            brand: string | null;
            model: string | null;
            capacity: string | null;
            location: string | null;
            serial_number: string | null;
          }
        | null;
    };
    const planilhaItemRows = (contractItems ?? []) as ContractItemRow[];
    const toPlanilhaEquip = (ci: ContractItemRow): PlanilhaEquipment => ({
      name: ci.equipment?.name ?? ci.item_name ?? null,
      brand: ci.equipment?.brand ?? null,
      model: ci.equipment?.model ?? null,
      capacity: ci.equipment?.capacity ?? null,
      location: ci.equipment?.location ?? null,
      serial_number: ci.equipment?.serial_number ?? null,
    });

    type PlanRow = {
      section: string | null;
      component: string | null;
      description: string | null;
      freq_code: string | null;
      freq_months: number | null;
      is_active: boolean | null;
    };
    const planSeen = new Set<string>();
    const planilhaActivities: PlanilhaActivity[] = [];
    for (const a of (planActivities ?? []) as PlanRow[]) {
      if (a.is_active === false) continue;
      const key = `${a.section ?? ""}|${a.component ?? ""}|${a.description ?? ""}|${a.freq_code ?? ""}|${a.freq_months ?? ""}`;
      if (planSeen.has(key)) continue;
      planSeen.add(key);
      planilhaActivities.push({
        section: a.section,
        component: a.component,
        description: a.description,
        freq_code: a.freq_code,
        freq_months: a.freq_months,
      });
    }

    const planilhaTotalVisitas = (allOrders ?? []).length;
    const planilhaConcluidas = (allOrders ?? []).filter((o) => o.status === "concluida").length;
    let planilhaConformes = 0;
    let planilhaNaoConformes = 0;
    if (planilhaTotalVisitas > 0) {
      const { data: soaRows } = await supabase
        .from("service_order_activities")
        .select("conformity_status")
        .eq("company_id", contract.company_id)
        .in("service_order_id", (allOrders ?? []).map((o) => o.id));
      for (const a of soaRows ?? []) {
        if (a.conformity_status === "conforme") planilhaConformes++;
        else if (a.conformity_status === "nao_conforme") planilhaNaoConformes++;
      }
    }

    // ---- Seção 4 da Planilha: ambientes climatizados (1→N), cada um com seus
    //      equipamentos (via environment_id). Fallback legado = um ambiente das
    //      colunas pmoc_* do contrato. Campo ausente → null (→ "—" no PDF).
    const ambNum = (v: unknown): number | null => {
      if (v === null || v === undefined || v === "") return null;
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    };
    const ambStr = (v: unknown): string | null => {
      const s = (v ?? "").toString().trim();
      return s.length > 0 ? s : null;
    };
    type PlanilhaEnvRow = {
      id: string;
      identificacao: string | null;
      tipo_atividade: string | null;
      area_climatizada_m2: number | null;
      ocupantes_fixos: number | null;
      ocupantes_flutuantes: number | null;
      carga_termica_tr: number | null;
    };
    const planilhaEnvRows = (environments ?? []) as PlanilhaEnvRow[];
    const planilhaAmbientes: PlanilhaAmbienteBlock[] = [];
    if (planilhaEnvRows.length > 0) {
      for (const env of planilhaEnvRows) {
        const amb: PlanilhaAmbiente = {
          tipo_atividade: ambStr(env.tipo_atividade),
          identificacao: ambStr(env.identificacao),
          area_m2: ambNum(env.area_climatizada_m2),
          ocupantes_fixos: ambNum(env.ocupantes_fixos),
          ocupantes_flutuantes: ambNum(env.ocupantes_flutuantes),
          carga_termica_tr: ambNum(env.carga_termica_tr),
        };
        planilhaAmbientes.push({
          ambiente: amb,
          equipments: planilhaItemRows
            .filter((ci) => ci.environment_id === env.id)
            .map(toPlanilhaEquip),
        });
      }
      const planilhaOrphans = planilhaItemRows.filter((ci) => !ci.environment_id);
      if (planilhaOrphans.length > 0) {
        planilhaAmbientes.push({
          ambiente: {
            tipo_atividade: null,
            identificacao: "Geral",
            area_m2: null,
            ocupantes_fixos: null,
            ocupantes_flutuantes: null,
            carga_termica_tr: null,
          },
          equipments: planilhaOrphans.map(toPlanilhaEquip),
        });
      }
    } else {
      const cRow = contract as Record<string, unknown>;
      planilhaAmbientes.push({
        ambiente: {
          tipo_atividade: ambStr(cRow.pmoc_tipo_atividade),
          identificacao: ambStr(cRow.pmoc_identificacao_ambiente),
          area_m2: ambNum(cRow.pmoc_area_climatizada_m2),
          ocupantes_fixos: ambNum(cRow.pmoc_ocupantes_fixos),
          ocupantes_flutuantes: ambNum(cRow.pmoc_ocupantes_flutuantes),
          carga_termica_tr: ambNum(cRow.pmoc_carga_termica_tr),
        },
        equipments: planilhaItemRows.map(toPlanilhaEquip),
      });
    }

    // ---- Seção 1 da Planilha: identificação da UNIDADE (1 contrato = 1 loja).
    //      Usa os campos `unidade_*` do contrato; sem endereço próprio da
    //      unidade, cai pro endereço do cliente (proprietário).
    const cUni = contract as Record<string, unknown>;
    const uniNome = ambStr(cUni.unidade_nome);
    const uniEndereco = ambStr(cUni.unidade_endereco);
    const uniNumero = ambStr(cUni.unidade_numero);
    const uniComplemento = ambStr(cUni.unidade_complemento);
    const uniBairro = ambStr(cUni.unidade_bairro);
    const uniCidade = ambStr(cUni.unidade_cidade);
    const uniUf = ambStr(cUni.unidade_uf);
    const uniCep = ambStr(cUni.unidade_cep);
    const temEnderecoUnidade = !!(
      uniEndereco || uniNumero || uniComplemento ||
      uniBairro || uniCidade || uniUf || uniCep
    );
    const planilhaUnidade = temEnderecoUnidade
      ? {
          nome: uniNome,
          endereco: uniEndereco,
          numero: uniNumero,
          complemento: uniComplemento,
          bairro: uniBairro,
          cidade: uniCidade,
          uf: uniUf,
          cep: uniCep,
        }
      : {
          nome: uniNome ?? ambStr(customer?.name),
          endereco: ambStr(customer?.address),
          numero: null,
          complemento: null,
          bairro: null,
          cidade: ambStr(customer?.city),
          uf: ambStr(customer?.state),
          cep: null,
        };

    // ---- 8. content_hash dos campos dinâmicos
    //    Onda E: bump pra dossie_v2 (signature_image_url entra no hash).
    //    Onda H: bump pra dossie_v3 (variableContext entra — campos novos do
    //    company_settings/RT invalidam cache certinho).
    //    Onda H+ (v1.9.x): bump pra dossie_v4 — 3 chaves novas
    //    `contrato.criado_{dia,mes,ano}` entraram no variableContext.
    //    Onda I (v1.9.x): bump pra dossie_v5 — cabeçalho identidade tenant
    //    no Termo RT (logo + endereço + cores), rodapé Dominex novo
    //    (substitui "Powered by Dominex" antigo, oculto em white-label) e
    //    espaçamento das linhas de assinatura mudaram o output visual.
    //    Onda J (v1.9.x): bump pra dossie_v6 — novo template do Termo RT e
    //    do Certificado (só o RT assina, bloco de dados cliente/empresa
    //    reformulado, var `cliente.documento` no corpo e remoção da barra
    //    preta). Cobre também o Certificado, gerado nesta mesma função.
    //    Mudança é só de TEXTO/layout — sem bump, PDFs cacheados não
    //    regenerariam com o template novo.
    //    Onda K (v1.9.x): bump pra dossie_v7 — mais respiro vertical entre
    //    seções dos templates do Termo RT e do Certificado (só espaçamento/
    //    layout, dados de entrada idênticos — sem bump não regeneraria).
    //    Onda L (v1.9.x): bump pra dossie_v8 — o Cronograma Anual (12 páginas)
    //    passou a viver DENTRO do Dossiê. A janela de meses + as OSs
    //    (números/datas/status ordenados) entram no hash pra o cache invalidar
    //    quando o cronograma mudar.
    //    Onda M (v1.11.x): bump pra dossie_v10 — a capa passou a desenhar o
    //    link + QR Code do Portal PMOC no canto inferior direito. O portal_url
    //    (derivado do token) entra no hash pra invalidar PDFs cacheados sem o
    //    QR e regenerar quando o token mudar.
    //    Onda Validade (2026-06): bump pra dossie_v11 — linha "Validade deste
    //    documento" entrou nas páginas embutidas do Termo RT e do Certificado +
    //    3 chaves `documento.*` no variableContext. Emissão/vencimento mudam por
    //    dia → o cache do Dossiê passa a girar diariamente (esperado).
    //    Fase 4 Planilha PMOC (2026-06): bump pra dossie_v12 — a Planilha PMOC
    //    (identificação + RT + relação de equipamentos + plano M/T/S/A + matriz
    //    12 meses + registro de execução) passou a viver no fim do Dossiê. Os
    //    equipamentos, o plano (atividades+freq) e o resumo de execução entram
    //    no hash pra o cache invalidar quando qualquer um mudar.
    //    Rodapé Dominex Planilha (2026-06): bump pra dossie_v13 — as páginas da
    //    Planilha embutida ganharam o rodapé Dominex (linha + logo +
    //    dominex.app) em toda página, oculto em white-label. O white_label já
    //    está no hash (tenant.white_label), mas o bump força regen dos PDFs
    //    cacheados sem o rodapé novo.
    //    Multi-ambiente (2026-06): bump pra dossie_v15 — a Seção 4 da Planilha
    //    embutida passou a renderizar UM bloco por ambiente
    //    (contract_environments), cada um com seus equipamentos via
    //    environment_id. Os ambientes entram no hash pra invalidar o cache.
    //    Ambiente climatizado (2026-06): bump pra dossie_v14 — a Seção 4 da
    //    Planilha embutida ganhou a caracterização do ambiente (tipo de
    //    atividade, identificação, área, ocupantes fixos/flutuantes e carga
    //    térmica TR), vinda das colunas pmoc_* do contrato. Entram no hash pra
    //    o cache invalidar quando o gestor preencher/editar esses campos.
    //    Unidade (2026-06): bump pra dossie_v16 — a Seção 1 da Planilha embutida
    //    passou a usar a identificação da UNIDADE (`unidade_*` do contrato), com
    //    fallback pro cliente. Os campos da unidade entram no hash.
    const hashInput = JSON.stringify({
      v: "dossie_v16",
      tenant: {
        name: tenantName,
        cnpj,
        city: cidade,
        logo: !!logoBytes,
        phone: companySettings?.phone ?? null,
        email: companySettings?.email ?? null,
        address: companySettings?.address ?? null,
        address_number: companySettings?.address_number ?? null,
        neighborhood: companySettings?.neighborhood ?? null,
        state: companySettings?.state ?? null,
        zip_code: companySettings?.zip_code ?? null,
        header_bg: dossieHeaderBg,
        header_text: dossieHeaderText,
        header_logo_size: dossieHeaderLogoSize,
        white_label: useWhiteLabel,
      },
      rt: {
        nome: ctx.rt.nome,
        modalidade: ctx.rt.modalidade,
        cft_crea: ctx.rt.cft_crea,
        signature_image_url: ctx.rt.signature_image_url ?? null,
      },
      customer: ctx.customer,
      contract: ctx.contract,
      // Onda M — link/QR do Portal PMOC na capa.
      portal_url: portalUrl,
      termo: customDocs?.termo_rt_content ?? null,
      cert: customDocs?.certificado_content ?? null,
      vars: variableContext,
      // Onda L — cronograma embutido: janela + OSs ordenadas invalidam o cache.
      cronograma: {
        window: { start: startIso, end: endIso },
        orders: cronogramaOrders
          .map((o) => ({ n: o.order_number, d: o.scheduled_date, s: o.status }))
          .sort((a, b) => (a.d ?? "").localeCompare(b.d ?? "")),
      },
      // Fase 4 — Planilha PMOC embutida: ambientes + plano + execução.
      planilha: {
        unidade: planilhaUnidade,
        ambientes: planilhaAmbientes,
        activities: planilhaActivities,
        execution: {
          total: planilhaTotalVisitas,
          concluidas: planilhaConcluidas,
          conformes: planilhaConformes,
          nao_conformes: planilhaNaoConformes,
        },
      },
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

    // ---- Onda L: Cronograma Anual (12 páginas, 1 mês por página) ao final.
    //      Usa o MESMO TemplateContext do dossiê (tenant + customer + contract).
    //      Onda Memória (2026-06): o logo do tenant é embedado UMA vez aqui e
    //      reusado nas 12 páginas. Antes cada página chamava embedPng, o que
    //      decodificava o raster 12x; com logos grandes (ex.: 1898x1898 ≈ 13 MB
    //      descomprimidos por decode) isso estourava a memória do worker e a
    //      geração morria com WORKER_RESOURCE_LIMIT (sem cair no catch). Embedar
    //      uma vez derruba de ~14 decodes pra ~3.
    let cronogramaLogo: Awaited<ReturnType<typeof pdf.embedPng>> | null = null;
    if (logoBytes && logoMime) {
      try {
        cronogramaLogo =
          logoMime === "image/png"
            ? await pdf.embedPng(logoBytes)
            : await pdf.embedJpg(logoBytes);
      } catch {
        // sem logo no cronograma é ok — segue sem ele
        cronogramaLogo = null;
      }
    }

    for (let i = 0; i < 12; i++) {
      const month = new Date(
        Date.UTC(startMonth.getUTCFullYear(), startMonth.getUTCMonth() + i, 1),
      );
      await drawCronogramaMesPage({
        pdf,
        ctx,
        month,
        serviceOrders: cronogramaOrders,
        logoImage: cronogramaLogo,
      });
    }

    // ---- Fase 4: Planilha PMOC ao final do Dossiê. Reusa o logo pré-embedado
    //      (cronogramaLogo) pra não re-decodificar o raster.
    const planilhaData: PlanilhaData = {
      tenant: { name: tenantName, cnpj, logoImage: cronogramaLogo },
      customer: {
        name: customer?.name ?? "Unidade",
        document: customer?.document ?? null,
        address: customer?.address ?? null,
        city: customer?.city ?? null,
        state: customer?.state ?? null,
      },
      unidade: planilhaUnidade,
      rt: {
        nome: rt.full_name ?? "",
        modalidade: rt.modality ?? "Técnico em Refrigeração",
        cft_crea: rt.cft_crea ?? null,
      },
      contract: {
        name: contract.name ?? null,
        start_date_extenso: dateToExtenso(contract.start_date ?? null),
        frequency_label: frequencyLabelFrom(
          (contract.frequency_value ?? null) as number | null,
          (contract.frequency_type ?? null) as string | null,
        ),
      },
      ambientes: planilhaAmbientes,
      activities: planilhaActivities,
      execution:
        planilhaTotalVisitas > 0
          ? {
              total: planilhaTotalVisitas,
              concluidas: planilhaConcluidas,
              conformes: planilhaConformes,
              nao_conformes: planilhaNaoConformes,
            }
          : null,
      generated_at_extenso: dateToExtenso(new Date()),
      // Rodapé Dominex por página da Planilha embutida — oculto em white-label
      // (mesmo `useWhiteLabel` do resto do Dossiê).
      whiteLabel: useWhiteLabel,
    };
    await drawPlanilha(pdf, planilhaData);

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
      cronograma_orders: cronogramaOrders.length,
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
