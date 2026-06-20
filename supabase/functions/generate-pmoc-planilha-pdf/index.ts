// =============================================================================
// generate-pmoc-planilha-pdf — Gera a "Planilha PMOC" (espelha o modelo do
//                              cliente: identificação + proprietário + RT +
//                              relação de equipamentos + plano de manutenção
//                              M/T/S/A + matriz 12 meses + registro de execução).
// =============================================================================
// AUTENTICADA (Authorization obrigatório). Roles admin/gestor/super_admin via
// can_manage_contracts. Espelha a estrutura de generate-pmoc-dossie-pdf:
//   1. CORS + Authorization.
//   2. Resolver auth.uid() + company_id + permissão.
//   3. Resolver contrato (404 unificado cross-tenant) + is_pmoc.
//   4. Carregar customer, company_settings, RT, equipamentos (contract_items),
//      plano (contract_plan_activities) e resumo de execução.
//   5. content_hash (plano + equipamentos + RT + cliente + datas).
//   6. Cache hit? → signed URL antiga.
//   7. Compor PDF (template planilha).
//   8. Upload bucket pmoc-documents + INSERT pmoc_documents doc_type='planilha'.
//   9. Retorna { pdf_url, version, cached }.
//
// Fase 4 do plano docs/planos/2026-06-17-pmoc-frequencias-por-servico.md.
// =============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { PDFDocument } from "https://esm.sh/pdf-lib@1.17.1";
import {
  drawPlanilha,
  PlanilhaActivity,
  PlanilhaAmbiente,
  PlanilhaAmbienteBlock,
  PlanilhaData,
  PlanilhaEquipment,
} from "../_shared/pmoc-templates/planilha.ts";
import {
  dateToExtenso,
  frequencyLabelFrom,
} from "../_shared/pmoc-templates/context.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type ErrorAction = { label: string; href: string };
interface StandardError {
  error: string;
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

// Reduz um PNG p/ no máx. `maxSide` px (régua de memória do worker — logos
// gigantes estouram o embed). Best-effort: falha devolve os bytes originais.
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

    // ---- 3. Resolver tenant + role + permissão de contratos
    const [{ data: profileRow }, { data: rolesRows }, { data: canManage }] = await Promise.all([
      supabase.from("profiles").select("company_id").eq("user_id", userId).maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", userId),
      supabase.rpc("can_manage_contracts", { _user_id: userId }),
    ]);
    const userCompany = profileRow?.company_id ?? null;
    const roles = new Set((rolesRows ?? []).map((r) => r.role));
    const isSuperAdmin = roles.has("super_admin");

    // ---- 4. Resolver contrato — 404 unificado cross-tenant
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
          // Seção 1 — identificação da UNIDADE/local (1 contrato = 1 unidade).
          // Pode ter endereço próprio (≠ do cliente/proprietário). Vazio → a
          // Seção 1 cai pro endereço/nome do cliente (fallback abaixo).
          "unidade_nome",
          "unidade_endereco",
          "unidade_numero",
          "unidade_complemento",
          "unidade_bairro",
          "unidade_cidade",
          "unidade_uf",
          "unidade_cep",
          // Seção 4 — caracterização do ambiente climatizado (modelo do cliente).
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
          "Este contrato não está marcado como PMOC. Edite o contrato e ative a opção 'Contrato PMOC' para gerar a planilha.",
          {
            field: "contract.is_pmoc",
            action: { label: "Editar contrato", href: `/contratos/${contractId}/editar` },
          },
        ),
        400,
      );
    }

    // ---- 5. Dependências: customer, company_settings, RT, ambientes,
    //      equipamentos, plano
    const [
      { data: customer },
      { data: companySettings },
      { data: rt },
      { data: environments },
      { data: contractItems },
      { data: planActivities },
    ] = await Promise.all([
      supabase
        .from("customers")
        .select("name, document, address, city, state")
        .eq("id", contract.customer_id)
        .maybeSingle(),
      supabase
        .from("company_settings")
        .select("name, document, logo_url, white_label_enabled, white_label_logo_url, city")
        .eq("company_id", contract.company_id)
        .maybeSingle(),
      contract.responsible_technician_id
        ? supabase
            .from("responsible_technicians")
            .select("full_name, cft_crea, modality")
            .eq("id", contract.responsible_technician_id)
            .maybeSingle()
        : Promise.resolve({ data: null } as { data: null }),
      // Ambientes climatizados do contrato (1→N). Ordem do cadastro.
      supabase
        .from("contract_environments")
        .select(
          "id, identificacao, tipo_atividade, area_climatizada_m2, ocupantes_fixos, ocupantes_flutuantes, carga_termica_tr, sort_order",
        )
        .eq("contract_id", contract.id)
        .order("sort_order", { ascending: true }),
      // Equipamentos do contrato (relação climatizada). Join no equipment.
      // environment_id liga cada equipamento ao seu ambiente.
      supabase
        .from("contract_items")
        .select(
          "id, environment_id, equipment_id, item_name, sort_order, pmoc_scope, pmoc_start_visit, equipment:equipment(name, brand, model, capacity, location, serial_number)",
        )
        .eq("contract_id", contract.id)
        .order("sort_order", { ascending: true }),
      // Plano de manutenção (atividades × frequência). `contract_item_id` aponta a
      // máquina dona (Fase 4); `applies_per_equipment` distingue local de legado.
      supabase
        .from("contract_plan_activities")
        .select(
          "section, component, description, freq_code, freq_months, is_active, sort_order, contract_item_id, applies_per_equipment",
        )
        .eq("contract_id", contract.id)
        .eq("company_id", contract.company_id)
        .order("sort_order", { ascending: true }),
    ]);

    // Tenant name (fallback companies.name)
    let tenantName = (companySettings?.name ?? "").trim();
    if (!tenantName) {
      const { data: companyRow } = await supabase
        .from("companies")
        .select("name")
        .eq("id", contract.company_id)
        .maybeSingle();
      tenantName = (companyRow?.name ?? "").trim() || "Empresa";
    }

    const cnpj = (companySettings?.document ?? "").trim();
    if (!cnpj) {
      return jsonResponse(
        errorBody(
          "cnpj_missing",
          "CNPJ da empresa não cadastrado em Configurações > Empresa. A planilha PMOC exige CNPJ pela Lei 13.589/2018.",
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
          "Contrato sem Responsável Técnico vinculado. Edite o contrato e atribua um RT antes de gerar a planilha.",
          {
            field: "contract.responsible_technician_id",
            action: { label: "Editar contrato", href: `/contratos/${contractId}/editar` },
          },
        ),
        400,
      );
    }

    // ---- Logo bytes (best-effort) + downscale ≤512px
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
        // sem logo é ok
      }
    }
    if (logoBytes && logoMime === "image/png") {
      logoBytes = await downscalePngIfLarge(logoBytes, 512);
    }

    // ---- Equipamentos (relação climatizada). item_name é fallback do nome.
    //      environment_id liga cada equipamento ao seu ambiente.
    type ContractItemRow = {
      id: string;
      environment_id: string | null;
      equipment_id: string | null;
      item_name: string | null;
      sort_order: number | null;
      pmoc_scope: string | null;
      pmoc_start_visit: number | null;
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
    const itemRows = (contractItems ?? []) as ContractItemRow[];
    const toEquip = (ci: ContractItemRow): PlanilhaEquipment => ({
      name: ci.equipment?.name ?? ci.item_name ?? null,
      brand: ci.equipment?.brand ?? null,
      model: ci.equipment?.model ?? null,
      capacity: ci.equipment?.capacity ?? null,
      location: ci.equipment?.location ?? null,
      serial_number: ci.equipment?.serial_number ?? null,
    });

    // ---- Plano (atividades ativas).
    type PlanRow = {
      section: string | null;
      component: string | null;
      description: string | null;
      freq_code: string | null;
      freq_months: number | null;
      is_active: boolean | null;
      contract_item_id: string | null;
      applies_per_equipment: boolean | null;
      sort_order: number | null;
    };
    const allPlanRows = ((planActivities ?? []) as PlanRow[]).filter(
      (a) => a.is_active !== false,
    );
    const toActivity = (a: PlanRow): PlanilhaActivity => ({
      section: a.section,
      component: a.component,
      description: a.description,
      freq_code: a.freq_code,
      freq_months: a.freq_months,
    });

    // Fallback LEGADO (`activities`): lista única do contrato, com dedup por
    // (section|component|description|freq) — usada SÓ quando NENHUMA atividade
    // tem `contract_item_id` (contrato no formato antigo). Mantém o PDF idêntico
    // ao planilha_v8 pra esses contratos.
    const seen = new Set<string>();
    const activities: PlanilhaActivity[] = [];
    for (const a of allPlanRows) {
      const key = `${a.section ?? ""}|${a.component ?? ""}|${a.description ?? ""}|${a.freq_code ?? ""}|${a.freq_months ?? ""}`;
      if (seen.has(key)) continue;
      seen.add(key);
      activities.push(toActivity(a));
    }

    // ---- Plano POR EQUIPAMENTO (Fase 4) -------------------------------------
    // Decisão de caminho: se QUALQUER atividade aponta uma máquina
    // (`contract_item_id`), renderiza por equipamento; senão fica no legado.
    const hasPerMachine = allPlanRows.some((a) => a.contract_item_id != null);

    // Bucket de escopo: 'full' primeiro, depois 'ac' (default), depois local.
    const normScope = (s: string | null): "ac" | "full" =>
      s === "full" ? "full" : "ac";
    const normStart = (n: number | null): number =>
      Number.isFinite(n) && (n as number) >= 1 ? (n as number) : 12;

    type MachineBlock = {
      title: string;
      scope: "ac" | "full" | null;
      startVisit: number;
      activities: PlanilhaActivity[];
    };
    let planMachines: MachineBlock[] = [];

    if (hasPerMachine) {
      // Mapa contract_item_id → máquina (nome/escopo/fase/ordem).
      const itemById = new Map<string, ContractItemRow>();
      for (const ci of itemRows) itemById.set(ci.id, ci);

      // Atividades agrupadas pela máquina dona.
      const byMachine = new Map<string, PlanRow[]>();
      const localRows: PlanRow[] = []; // contract_item_id null + per_eq=false
      const contratoRows: PlanRow[] = []; // contract_item_id null + per_eq=true (legado misto)
      for (const a of allPlanRows) {
        if (a.contract_item_id) {
          const arr = byMachine.get(a.contract_item_id) ?? [];
          arr.push(a);
          byMachine.set(a.contract_item_id, arr);
        } else if (a.applies_per_equipment === false) {
          localRows.push(a);
        } else {
          contratoRows.push(a);
        }
      }

      // Blocos de máquina ordenados: 'full' primeiro, depois 'ac'; dentro do
      // bucket, mantém a ordem dos itens (sort_order). Igual o motor/checklist.
      const machineEntries = Array.from(byMachine.entries())
        .map(([itemId, rows]) => {
          const ci = itemById.get(itemId);
          const scope = normScope(ci?.pmoc_scope ?? null);
          const startVisit = normStart(ci?.pmoc_start_visit ?? null);
          const title =
            ci?.equipment?.name ?? ci?.item_name ?? "Equipamento";
          const sort = ci?.sort_order ?? 0;
          return { itemId, rows, scope, startVisit, title, sort };
        })
        .sort((a, b) => {
          const ba = a.scope === "full" ? 0 : 1;
          const bb = b.scope === "full" ? 0 : 1;
          return ba - bb || a.sort - b.sort;
        });

      planMachines = machineEntries.map((e) => ({
        title: e.title,
        scope: e.scope,
        startVisit: e.startVisit,
        activities: e.rows
          .slice()
          .sort((x, y) => (x.sort_order ?? 0) - (y.sort_order ?? 0))
          .map(toActivity),
      }));

      // Bloco "Geral / Local": atividades de local (sem máquina, per_eq=false).
      // Só aparece quando há ≥1 máquina 'full' (mesma regra do motor — locais
      // entram ancorados na fase do grande porte de menor start_visit).
      const fullStarts = machineEntries
        .filter((e) => e.scope === "full")
        .map((e) => e.startVisit);
      const hasFull = fullStarts.length > 0;
      const localActs = [...localRows, ...contratoRows]
        .sort((x, y) => (x.sort_order ?? 0) - (y.sort_order ?? 0))
        .map(toActivity);
      if (hasFull && localActs.length > 0) {
        const anchor = Math.min(...fullStarts);
        planMachines.push({
          title: "Geral / Local (torres, bombas, casa de máquinas)",
          scope: null,
          startVisit: anchor,
          activities: localActs,
        });
      } else if (!hasFull && contratoRows.length > 0) {
        // Sem máquina 'full' mas há atividades não amarradas (per_eq=true) →
        // bloco "Contrato (geral)" com fase âncora = menor start entre TODAS as
        // máquinas (ou 12). Locais puros (per_eq=false) sem 'full' não entram,
        // espelhando o motor.
        const allStarts = machineEntries.map((e) => e.startVisit);
        const anchor = allStarts.length > 0 ? Math.min(...allStarts) : 12;
        planMachines.push({
          title: "Contrato (atividades gerais)",
          scope: null,
          startVisit: anchor,
          activities: contratoRows
            .sort((x, y) => (x.sort_order ?? 0) - (y.sort_order ?? 0))
            .map(toActivity),
        });
      }
    }

    // Seção "Registro de Execução" removida (2026-06): dado dinâmico (visitas/
    // conformidade) congelava no PDF baixado e ficava desatualizado. A planilha
    // termina na legenda do plano + "Documento gerado em …".

    // ---- Seção 4: ambientes climatizados (1→N), cada um com seus equipamentos.
    //      Modelo do cliente repete a relação por unidade.
    const numOrNull = (v: unknown): number | null => {
      if (v === null || v === undefined || v === "") return null;
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    };
    const strOrNull = (v: unknown): string | null => {
      const s = (v ?? "").toString().trim();
      return s.length > 0 ? s : null;
    };

    type EnvRow = {
      id: string;
      identificacao: string | null;
      tipo_atividade: string | null;
      area_climatizada_m2: number | null;
      ocupantes_fixos: number | null;
      ocupantes_flutuantes: number | null;
      carga_termica_tr: number | null;
    };
    const envRows = (environments ?? []) as EnvRow[];

    const ambientes: PlanilhaAmbienteBlock[] = [];
    if (envRows.length > 0) {
      // Caminho novo: 1 bloco por contract_environments, com seus equipamentos
      // (via environment_id). Equipamentos órfãos (sem environment_id) entram
      // num bloco "Geral" no fim, pra não sumirem da planilha.
      for (const env of envRows) {
        const amb: PlanilhaAmbiente = {
          tipo_atividade: strOrNull(env.tipo_atividade),
          identificacao: strOrNull(env.identificacao),
          area_m2: numOrNull(env.area_climatizada_m2),
          ocupantes_fixos: numOrNull(env.ocupantes_fixos),
          ocupantes_flutuantes: numOrNull(env.ocupantes_flutuantes),
          carga_termica_tr: numOrNull(env.carga_termica_tr),
        };
        ambientes.push({
          ambiente: amb,
          equipments: itemRows
            .filter((ci) => ci.environment_id === env.id)
            .map(toEquip),
        });
      }
      const orphans = itemRows.filter((ci) => !ci.environment_id);
      if (orphans.length > 0) {
        ambientes.push({
          ambiente: {
            tipo_atividade: null,
            identificacao: "Geral",
            area_m2: null,
            ocupantes_fixos: null,
            ocupantes_flutuantes: null,
            carga_termica_tr: null,
          },
          equipments: orphans.map(toEquip),
        });
      }
    } else {
      // Fallback legado: um único ambiente vindo das colunas pmoc_* do
      // contrato, com TODOS os equipamentos (incl. sem environment_id).
      const c = contract as Record<string, unknown>;
      ambientes.push({
        ambiente: {
          tipo_atividade: strOrNull(c.pmoc_tipo_atividade),
          identificacao: strOrNull(c.pmoc_identificacao_ambiente),
          area_m2: numOrNull(c.pmoc_area_climatizada_m2),
          ocupantes_fixos: numOrNull(c.pmoc_ocupantes_fixos),
          ocupantes_flutuantes: numOrNull(c.pmoc_ocupantes_flutuantes),
          carga_termica_tr: numOrNull(c.pmoc_carga_termica_tr),
        },
        equipments: itemRows.map(toEquip),
      });
    }

    // ---- Seção 1: identificação da UNIDADE (1 contrato = 1 unidade/loja).
    //      Usa os campos `unidade_*` do contrato; quando NENHUM campo de
    //      endereço da unidade foi preenchido, cai pro endereço do cliente
    //      (proprietário) — caso "1 cliente = 1 loja" funciona sem digitar nada.
    const c2 = contract as Record<string, unknown>;
    const unidadeNome = strOrNull(c2.unidade_nome);
    const unidadeEndereco = strOrNull(c2.unidade_endereco);
    const unidadeNumero = strOrNull(c2.unidade_numero);
    const unidadeComplemento = strOrNull(c2.unidade_complemento);
    const unidadeBairro = strOrNull(c2.unidade_bairro);
    const unidadeCidade = strOrNull(c2.unidade_cidade);
    const unidadeUf = strOrNull(c2.unidade_uf);
    const unidadeCep = strOrNull(c2.unidade_cep);
    const temEnderecoUnidade = !!(
      unidadeEndereco || unidadeNumero || unidadeComplemento ||
      unidadeBairro || unidadeCidade || unidadeUf || unidadeCep
    );
    const unidade = temEnderecoUnidade
      ? {
          nome: unidadeNome,
          endereco: unidadeEndereco,
          numero: unidadeNumero,
          complemento: unidadeComplemento,
          bairro: unidadeBairro,
          cidade: unidadeCidade,
          uf: unidadeUf,
          cep: unidadeCep,
        }
      : {
          // Fallback: endereço do cliente (proprietário) quando a unidade não
          // tem endereço próprio cadastrado.
          nome: unidadeNome ?? strOrNull(customer.name),
          endereco: strOrNull(customer.address),
          numero: null,
          complemento: null,
          bairro: null,
          cidade: strOrNull(customer.city),
          uf: strOrNull(customer.state),
          cep: null,
        };

    const planilhaData: PlanilhaData = {
      tenant: { name: tenantName, cnpj, logoImage: null },
      customer: {
        name: customer.name ?? "Unidade",
        document: customer.document ?? null,
        address: customer.address ?? null,
        city: customer.city ?? null,
        state: customer.state ?? null,
      },
      unidade,
      ambientes,
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
      // Plano por equipamento (Fase 4); vazio → template usa `activities` (legado).
      planMachines,
      activities,
      generated_at_extenso: dateToExtenso(new Date()),
      // Rodapé Dominex (linha + logo + dominex.app) em toda página — oculto em
      // white-label (mesmo critério do Dossiê).
      whiteLabel: useWhiteLabel,
    };

    // ---- 5. content_hash
    //   planilha_v2: rodapé Dominex por página (linha + logo + dominex.app),
    //   oculto em white-label. O flag `white_label` entra no hash pra o cache
    //   invalidar e regenerar com/sem rodapé conforme o tenant.
    const hashInput = JSON.stringify({
      // planilha_v4: Seção 4 agora é multi-ambiente — UM bloco por
      // contract_environments, cada um com seus equipamentos (via
      // environment_id). Fallback legado = um ambiente das colunas pmoc_*.
      // planilha_v5: Seção 1 passa a usar a identificação da UNIDADE
      // (`unidade_*` do contrato), com fallback pro cliente quando vazia.
      // planilha_v6: layout fiel ao modelo do cliente (título centralizado
      // preto-no-branco, seções 1–4 em tabelas com borda, seção 5 com larguras
      // fixas/quebra de linha, componentes humanizados, sem selo no PDF).
      // planilha_v7: títulos das seções e do cabeçalho agora COM acento PT-BR
      // (Identificação, Manutenção, Operação, Responsável Técnico etc.).
      // planilha_v8: removida a Seção 6 "Registro de Execução" (dado dinâmico
      // que congelava no PDF) e removida a linha separadora do rodapé Dominex.
      // planilha_v9: Seção 5 agora é POR EQUIPAMENTO — um bloco por máquina
      // ('full' primeiro, depois 'ac', depois "Geral / Local"), com a matriz de
      // 12 meses FASEADA pela `pmoc_start_visit` de cada máquina (espelha o
      // motor de visitas). Contrato legado (atividades sem contract_item_id)
      // mantém a lista única, idêntica ao v8.
      // planilha_v10: rodapé Dominex (sem white-label) garantido SEM linha
      // separadora cruzando o logo + "dominex.app" — força regeração dos PDFs
      // que ainda traziam a linha do bundle antigo.
      v: "planilha_v10",
      tenant: { name: tenantName, cnpj, logo: !!logoBytes },
      white_label: useWhiteLabel,
      customer: planilhaData.customer,
      unidade: planilhaData.unidade,
      rt: planilhaData.rt,
      contract: planilhaData.contract,
      ambientes,
      planMachines,
      activities,
    });
    const contentHash = await sha256Hex(hashInput);

    // ---- 6. Cache hit?
    const { data: existingDoc } = await supabase
      .from("pmoc_documents")
      .select("id, version, pdf_storage_path, generated_at")
      .eq("contract_id", contract.id)
      .eq("company_id", contract.company_id)
      .eq("doc_type", "planilha")
      .eq("content_hash", contentHash)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingDoc) {
      const { data: signed, error: signedErr } = await supabase.storage
        .from("pmoc-documents")
        .createSignedUrl(existingDoc.pdf_storage_path, 3600);
      if (!signedErr && signed) {
        console.log("[generate-pmoc-planilha-pdf] cache hit", {
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

    // ---- 7. Compor PDF
    const pdf = await PDFDocument.create();
    pdf.setTitle(`PMOC — Planilha — ${planilhaData.customer.name}`);
    pdf.setSubject("Plano de Manutenção, Operação e Controle — Lei 13.589/2018");
    pdf.setProducer("Dominex");

    // Embeda o logo UMA vez e passa o PDFImage pro template (régua de memória).
    if (logoBytes && logoMime) {
      try {
        planilhaData.tenant.logoImage =
          logoMime === "image/png"
            ? await pdf.embedPng(logoBytes)
            : await pdf.embedJpg(logoBytes);
      } catch {
        planilhaData.tenant.logoImage = null;
      }
    }

    await drawPlanilha(pdf, planilhaData);

    const pdfBytes = await pdf.save();

    // ---- 8. Próxima versão + upload + insert
    const { data: maxRow } = await supabase
      .from("pmoc_documents")
      .select("version")
      .eq("contract_id", contract.id)
      .eq("company_id", contract.company_id)
      .eq("doc_type", "planilha")
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();

    const nextVersion = (maxRow?.version ?? 0) + 1;
    const storagePath = `${contract.company_id}/${contract.id}/planilha-v${nextVersion}.pdf`;

    const { error: uploadErr } = await supabase.storage
      .from("pmoc-documents")
      .upload(storagePath, pdfBytes, {
        contentType: "application/pdf",
        upsert: false,
      });
    if (uploadErr) {
      console.error("[generate-pmoc-planilha-pdf] upload error", {
        contract_id: maskUuid(contract.id),
        message: uploadErr.message,
      });
      return jsonResponse(
        errorBody(
          "pdf_generation_failed",
          "Falha ao salvar o PDF. Tente novamente em alguns segundos.",
        ),
        500,
      );
    }

    const { error: insertErr } = await supabase.from("pmoc_documents").insert({
      company_id: contract.company_id,
      contract_id: contract.id,
      doc_type: "planilha",
      version: nextVersion,
      content_hash: contentHash,
      pdf_storage_path: storagePath,
      generated_by: userId,
    });
    if (insertErr) {
      await supabase.storage.from("pmoc-documents").remove([storagePath]);
      console.error("[generate-pmoc-planilha-pdf] insert error", {
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

    console.log("[generate-pmoc-planilha-pdf] generated", {
      contract_id: maskUuid(contract.id),
      version: nextVersion,
      ambientes: ambientes.length,
      equipments: itemRows.length,
      activities: activities.length,
      plan_machines: planMachines.length,
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
    console.error("[generate-pmoc-planilha-pdf] unexpected error", {
      message: (err as Error)?.message ?? String(err),
    });
    return jsonResponse(
      errorBody(
        "pdf_generation_failed",
        "Falha inesperada ao gerar o documento. Tente novamente em alguns segundos.",
      ),
      500,
    );
  }
});
