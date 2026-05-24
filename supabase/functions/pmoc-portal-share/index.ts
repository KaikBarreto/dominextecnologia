// =============================================================================
// pmoc-portal-share — Edge function PÚBLICA do Portal PMOC (Onda B, v1.9.1).
// =============================================================================
// Recebe GET ?token=<32 hex chars>, devolve JSON com payload MÍNIMO da unidade.
//
// Regras vinculantes:
//   - docs/planos/2026-05-23-pmoc-portal-rls-rules.md (§3)
//   - docs/planos/2026-05-23-pmoc-onda-B-portal-publico.md (§3.2)
//
// Princípios:
//   1. NUNCA retorna 401/403. Oracle blindado: tudo "inválido" vira 404 unificado.
//   2. Roda como service_role mas a defesa é projeção campo-a-campo (não policy).
//   3. Token validado por regex ^[0-9a-f]{32}$ ANTES de tocar o banco.
//   4. Logs NÃO contêm o token completo — sempre mascarar.
//   5. NÃO aceita Authorization header (ignora se vier).
// =============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, apikey, authorization, x-client-info",
};

const TOKEN_REGEX = /^[0-9a-f]{32}$/;
const HISTORY_LIMIT = 20;
const SCHEDULE_LIMIT = 50;
const DESCRIPTION_MAX = 200;

// Status públicos do HISTÓRICO (concluídas).
const HISTORY_OS_STATUS = ["concluida"];

// Status públicos do CRONOGRAMA (futuras + ativas — ainda não concluídas).
// Onda redesign 2026-05-24: passou a ser uma query separada do `history`.
const SCHEDULE_OS_STATUS = [
  "pendente",
  "agendada",
  "a_caminho",
  "em_andamento",
  "pausada",
];

// Status públicos das OSs (tudo exceto 'cancelada'). Mantido pra
// compatibilidade de leitura semântica — não usado nas queries novas.
const PUBLIC_OS_STATUS = [
  ...SCHEDULE_OS_STATUS,
  ...HISTORY_OS_STATUS,
];

// -----------------------------------------------------------------------------
// Rate limit in-memory por IP (LRU simples). Não persiste entre cold starts.
// 60 req/min por IP. Cenário 5 da §6 das RLS rules.
// -----------------------------------------------------------------------------
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 60;
const rateBucket = new Map<string, number[]>();

function rateLimitOk(ip: string): boolean {
  const now = Date.now();
  const arr = rateBucket.get(ip) ?? [];
  // Remove entradas fora da janela
  const fresh = arr.filter((t) => now - t < RATE_WINDOW_MS);
  if (fresh.length >= RATE_MAX) {
    rateBucket.set(ip, fresh);
    return false;
  }
  fresh.push(now);
  rateBucket.set(ip, fresh);
  // Poda quando o mapa fica grande (cap 5000 IPs)
  if (rateBucket.size > 5000) {
    const oldest = Array.from(rateBucket.entries())
      .sort(([, a], [, b]) => (a[a.length - 1] ?? 0) - (b[b.length - 1] ?? 0))
      .slice(0, 1000);
    for (const [k] of oldest) rateBucket.delete(k);
  }
  return true;
}

function maskToken(t: string | null | undefined): string {
  if (!t) return "<none>";
  if (t.length < 8) return "tk_***";
  return `tk_${t.slice(0, 4)}...`;
}

// -----------------------------------------------------------------------------
// Labels PT-BR (não expor enum bruto).
// -----------------------------------------------------------------------------
const STATUS_OS_LABEL: Record<string, string> = {
  pendente: "Pendente",
  agendada: "Agendada",
  a_caminho: "A caminho",
  em_andamento: "Em andamento",
  pausada: "Pausada",
  concluida: "Concluída",
};

const STATUS_CONTRACT_LABEL: Record<string, string> = {
  active: "Ativo",
  paused: "Pausado",
  inactive: "Inativo",
  cancelled: "Cancelado",
};

function frequencyLabel(value: number | null, type: string | null): string {
  if (!value || !type) return "—";
  const v = Math.max(1, Math.round(value));
  if (type === "months") {
    if (v === 1) return "Mensal";
    if (v === 2) return "Bimestral";
    if (v === 3) return "Trimestral";
    if (v === 6) return "Semestral";
    if (v === 12) return "Anual";
    return `A cada ${v} meses`;
  }
  if (type === "days") return v === 1 ? "Diária" : `A cada ${v} dias`;
  if (type === "weeks") return v === 1 ? "Semanal" : `A cada ${v} semanas`;
  if (type === "years") return v === 1 ? "Anual" : `A cada ${v} anos`;
  return `A cada ${v} ${type}`;
}

function truncate(s: string | null, max: number): string {
  if (!s) return "";
  const trimmed = s.trim();
  if (trimmed.length <= max) return trimmed;
  return trimmed.slice(0, max) + "…";
}

// -----------------------------------------------------------------------------
// Padronização de respostas (NUNCA 401/403; sempre 200/400/404/429/500).
// -----------------------------------------------------------------------------
function jsonResponse(body: unknown, status: number, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, max-age=60, s-maxage=300",
      "X-Robots-Tag": "index, follow",
      ...extraHeaders,
    },
  });
}

function notFound() {
  return jsonResponse({ error: "not_found" }, 404);
}

// =============================================================================
// Handler principal
// =============================================================================

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "GET") {
    return jsonResponse({ error: "method_not_allowed" }, 405);
  }

  const ip =
    req.headers.get("cf-connecting-ip") ??
    req.headers.get("x-real-ip") ??
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown";

  if (!rateLimitOk(ip)) {
    return jsonResponse({ error: "rate_limited" }, 429, { "Retry-After": "60" });
  }

  try {
    const url = new URL(req.url);
    const token = url.searchParams.get("token");

    if (!token) {
      return jsonResponse({ error: "token_required" }, 400);
    }

    if (!TOKEN_REGEX.test(token)) {
      return jsonResponse({ error: "invalid_token_format" }, 400);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // -------------------------------------------------------------------------
    // 1) Lookup do contrato pelo token. Projeção mínima.
    //    is_pmoc=false / status='cancelled' / 'inactive' → 404.
    // -------------------------------------------------------------------------
    const { data: contract, error: contractErr } = await supabase
      .from("contracts")
      .select(
        [
          "id",
          "company_id",
          "name",
          "customer_id",
          "responsible_technician_id",
          "start_date",
          "frequency_type",
          "frequency_value",
          "next_pmoc_generation_date",
          "pmoc_legal_compliance_text",
          "is_pmoc",
          "status",
        ].join(","),
      )
      .eq("public_pmoc_token", token)
      .maybeSingle();

    if (contractErr) {
      console.error("[pmoc-portal-share] contract lookup error", {
        token: maskToken(token),
        message: contractErr.message,
      });
      return jsonResponse({ error: "internal_error" }, 500);
    }

    if (!contract) {
      return notFound();
    }

    // Defesa-em-profundidade: ainda que o token só seja preenchido via trigger
    // quando is_pmoc=true, blindamos explicitamente.
    if (contract.is_pmoc !== true) {
      return notFound();
    }

    if (contract.status === "cancelled" || contract.status === "inactive") {
      return notFound();
    }

    // -------------------------------------------------------------------------
    // 2) Joins explícitos (projeção campo-a-campo). NÃO usar select * em
    //    nenhuma tabela. Cada campo retornado está autorizado em §3.2 da
    //    portal-rls-rules.
    // -------------------------------------------------------------------------
    const [
      { data: customer },
      { data: rt },
      { data: companySettings },
      { data: health },
    ] = await Promise.all([
      supabase
        .from("customers")
        .select("name, address, city, state")
        .eq("id", contract.customer_id)
        .maybeSingle(),
      contract.responsible_technician_id
        ? supabase
            .from("responsible_technicians")
            .select("full_name, cft_crea, modality, registry_number")
            .eq("id", contract.responsible_technician_id)
            .maybeSingle()
        : Promise.resolve({ data: null } as { data: null }),
      supabase
        .from("company_settings")
        .select(
          "name, logo_url, white_label_enabled, white_label_logo_url, white_label_primary_color, address, city, state",
        )
        .eq("company_id", contract.company_id)
        .maybeSingle(),
      supabase
        .from("contract_health_status")
        .select("health_status, overdue_count")
        .eq("contract_id", contract.id)
        .maybeSingle(),
    ]);

    // Tenant name fallback (company_settings.name pode ser '' por default).
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
    const primaryColor = useWhiteLabel
      ? companySettings?.white_label_primary_color ?? null
      : null;

    // -------------------------------------------------------------------------
    // 3) History + Schedule — OSs do contrato, em duas queries separadas.
    //    NÃO expor: diagnosis, solution, notes, parts_used, labor_value,
    //    parts_value, total_value, client_signature, check_in/out_location,
    //    snapshot_data.
    //
    //    - HISTORY: concluídas, ordem completed_at DESC, limit 20.
    //    - SCHEDULE: futuras + em andamento (incluindo 7 dias atrasadas),
    //      ordem scheduled_date ASC, limit 50.
    // -------------------------------------------------------------------------
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setUTCDate(sevenDaysAgo.getUTCDate() - 7);
    const scheduleFloorDate = sevenDaysAgo.toISOString().slice(0, 10); // YYYY-MM-DD

    const osSelectCols = [
      "id",
      "order_number",
      "scheduled_date",
      "completed_at",
      "status",
      "description",
      "service_type_id",
      "technician_id",
    ].join(",");

    const [{ data: historyOrders }, { data: scheduleOrders }] = await Promise.all([
      supabase
        .from("service_orders")
        .select(osSelectCols)
        .eq("contract_id", contract.id)
        .in("status", HISTORY_OS_STATUS)
        .order("completed_at", { ascending: false, nullsFirst: false })
        .limit(HISTORY_LIMIT),
      supabase
        .from("service_orders")
        .select(osSelectCols)
        .eq("contract_id", contract.id)
        .in("status", SCHEDULE_OS_STATUS)
        .gte("scheduled_date", scheduleFloorDate)
        .order("scheduled_date", { ascending: true, nullsFirst: false })
        .limit(SCHEDULE_LIMIT),
    ]);

    type OsRow = {
      id: string;
      order_number: number | null;
      scheduled_date: string | null;
      completed_at: string | null;
      status: string;
      description: string | null;
      service_type_id: string | null;
      technician_id: string | null;
    };

    const historyList = (historyOrders ?? []) as OsRow[];
    const scheduleList = (scheduleOrders ?? []) as OsRow[];

    // Mantém um array combinado pros lookups subsequentes (service_types,
    // assignees, photos, ratings) — depois separamos de volta na projeção.
    const osList: OsRow[] = [...historyList, ...scheduleList];

    // ---- Lookup adicionais (service_types, technician name, photos, ratings) --
    const serviceTypeIds = Array.from(
      new Set(osList.map((o) => o.service_type_id).filter(Boolean)),
    ) as string[];
    const technicianUserIds = Array.from(
      new Set(osList.map((o) => o.technician_id).filter(Boolean)),
    ) as string[];
    const osIds = osList.map((o) => o.id);

    const [
      { data: serviceTypes },
      { data: technicianProfiles },
      { data: assigneesRows },
      { data: photos },
      { data: ratings },
    ] = await Promise.all([
      serviceTypeIds.length
        ? supabase.from("service_types").select("id, name").in("id", serviceTypeIds)
        : Promise.resolve({ data: [] as Array<{ id: string; name: string }> }),
      technicianUserIds.length
        ? supabase
            .from("profiles")
            .select("user_id, full_name")
            .in("user_id", technicianUserIds)
        : Promise.resolve({
            data: [] as Array<{ user_id: string; full_name: string | null }>,
          }),
      osIds.length
        ? supabase
            .from("service_order_assignees")
            .select("service_order_id, user_id")
            .in("service_order_id", osIds)
        : Promise.resolve({
            data: [] as Array<{ service_order_id: string; user_id: string }>,
          }),
      osIds.length
        ? supabase
            .from("os_photos")
            .select("service_order_id, photo_url")
            .in("service_order_id", osIds)
        : Promise.resolve({
            data: [] as Array<{ service_order_id: string; photo_url: string }>,
          }),
      osIds.length
        ? supabase
            .from("service_ratings")
            .select("service_order_id, quality_rating, comment, rated_at")
            .in("service_order_id", osIds)
            .not("rated_at", "is", null)
        : Promise.resolve({
            data: [] as Array<{
              service_order_id: string;
              quality_rating: number | null;
              comment: string | null;
              rated_at: string | null;
            }>,
          }),
    ]);

    // Resolver nomes de assignees em segundo passo (precisa de profiles).
    const allAssigneeUserIds = Array.from(
      new Set((assigneesRows ?? []).map((a) => a.user_id)),
    );
    const missingProfileIds = allAssigneeUserIds.filter(
      (uid) => !(technicianProfiles ?? []).some((p) => p.user_id === uid),
    );
    const { data: extraProfiles } = missingProfileIds.length
      ? await supabase
          .from("profiles")
          .select("user_id, full_name")
          .in("user_id", missingProfileIds)
      : { data: [] as Array<{ user_id: string; full_name: string | null }> };

    const profileMap = new Map<string, string>();
    for (const p of (technicianProfiles ?? []).concat(extraProfiles ?? [])) {
      if (p.full_name) profileMap.set(p.user_id, p.full_name);
    }
    const serviceTypeMap = new Map<string, string>();
    for (const st of serviceTypes ?? []) serviceTypeMap.set(st.id, st.name);

    const assigneesByOs = new Map<string, string[]>();
    for (const a of assigneesRows ?? []) {
      const arr = assigneesByOs.get(a.service_order_id) ?? [];
      arr.push(a.user_id);
      assigneesByOs.set(a.service_order_id, arr);
    }
    const photosByOs = new Map<string, string[]>();
    for (const p of photos ?? []) {
      const arr = photosByOs.get(p.service_order_id) ?? [];
      if (p.photo_url) arr.push(p.photo_url);
      photosByOs.set(p.service_order_id, arr);
    }
    const ratingByOs = new Map<
      string,
      { rating: number | null; comment: string | null }
    >();
    for (const r of ratings ?? []) {
      ratingByOs.set(r.service_order_id, {
        rating: r.quality_rating ?? null,
        comment: r.comment ?? null,
      });
    }

    const firstName = (full: string | null | undefined): string | null => {
      if (!full) return null;
      const t = full.trim();
      if (!t) return null;
      return t.split(/\s+/)[0];
    };

    const projectOs = (os: OsRow) => {
      // Prioridade pra "primeiro técnico": assignee principal, fallback technician_id.
      const assigneeIds = assigneesByOs.get(os.id) ?? [];
      const primaryUserId = assigneeIds[0] ?? os.technician_id ?? null;
      const techName = primaryUserId ? profileMap.get(primaryUserId) ?? null : null;
      const r = ratingByOs.get(os.id);
      return {
        number: os.order_number,
        scheduled_date: os.scheduled_date,
        completed_at: os.completed_at,
        // `status` (raw) é usado pela UI pra mapear cor do badge.
        // `status_label` continua sendo o texto exibível (PT-BR).
        status: os.status,
        status_label: STATUS_OS_LABEL[os.status] ?? "—",
        service_type_label: os.service_type_id
          ? serviceTypeMap.get(os.service_type_id) ?? null
          : null,
        public_description: truncate(os.description, DESCRIPTION_MAX),
        technician_first_name: firstName(techName),
        public_photos: (photosByOs.get(os.id) ?? []).map((u) => ({
          url: u,
          alt: "Foto da manutenção",
        })),
        rating: r?.rating ?? null,
        rating_comment: r?.comment ?? null,
      };
    };

    const history = historyList.map(projectOs);
    const schedule = scheduleList.map(projectOs);

    // -------------------------------------------------------------------------
    // 3.5) Documents reais (Onda C + Onda E) — última versão por doc_type,
    //      signed URL TTL 24h. Filtro defensivo por company_id (§6.4 RLS
    //      rules Onda C). Versões antigas NUNCA aparecem no payload público.
    //
    //      Onda E: 'termo_rt' adicionado como terceiro doc_type e exposto com
    //      signature_status ('signed' | 'pending') derivado de notes.
    // -------------------------------------------------------------------------
    const DOC_TYPES = ["dossie_pmoc", "cronograma_anual", "termo_rt"] as const;
    const DOC_LABELS: Record<typeof DOC_TYPES[number], string> = {
      dossie_pmoc: "Dossiê PMOC (Capa + Termo + Certificado)",
      cronograma_anual: "Cronograma 12 meses",
      termo_rt: "Termo de Responsabilidade Técnica (TRT)",
    };

    const { data: docRows } = await supabase
      .from("pmoc_documents")
      .select("doc_type, version, generated_at, pdf_storage_path, notes")
      .eq("contract_id", contract.id)
      .eq("company_id", contract.company_id) // defesa em camada
      .in("doc_type", DOC_TYPES as unknown as string[])
      .order("version", { ascending: false });

    // Agrupa por doc_type pegando só a maior version
    const latestByType = new Map<
      string,
      { version: number; generated_at: string; pdf_storage_path: string; notes: string | null }
    >();
    for (const row of docRows ?? []) {
      if (!latestByType.has(row.doc_type)) {
        latestByType.set(row.doc_type, {
          version: row.version,
          generated_at: row.generated_at,
          pdf_storage_path: row.pdf_storage_path,
          notes: row.notes ?? null,
        });
      }
    }

    // Onda E: signature_status só é relevante pra docs que carregam o bloco
    // de assinatura do RT (termo_rt e dossie_pmoc; cronograma_anual não tem).
    const SIG_RELEVANT = new Set<string>(["termo_rt", "dossie_pmoc"]);
    const deriveSigStatus = (
      type: string,
      notes: string | null,
    ): "signed" | "pending" | null => {
      if (!SIG_RELEVANT.has(type)) return null;
      if (notes && notes.startsWith("signature:")) {
        return notes.split(":")[1] === "pending" ? "pending" : "signed";
      }
      // Fallback histórico: docs gerados antes da Onda E não têm notes.
      return null;
    };

    // Gera signed URL TTL 24h pra cada doc disponível
    const documents = await Promise.all(
      DOC_TYPES.map(async (type) => {
        const latest = latestByType.get(type);
        if (!latest) {
          return {
            type,
            label: DOC_LABELS[type],
            available: false,
            version: null as number | null,
            generated_at: null as string | null,
            pdf_url: null as string | null,
            signature_status: SIG_RELEVANT.has(type)
              ? ("pending" as "signed" | "pending")
              : null,
          };
        }
        const { data: signed } = await supabase.storage
          .from("pmoc-documents")
          .createSignedUrl(latest.pdf_storage_path, 86400); // TTL 24h
        return {
          type,
          label: DOC_LABELS[type],
          available: !!signed?.signedUrl,
          version: latest.version,
          generated_at: latest.generated_at,
          pdf_url: signed?.signedUrl ?? null,
          signature_status: deriveSigStatus(type, latest.notes),
          // NOTA: pdf_storage_path INTENCIONALMENTE não exposto (§6.3.5 RLS).
        };
      }),
    );

    // -------------------------------------------------------------------------
    // 4) Payload final — TODO campo retornado tem que estar autorizado em §3.2
    //    do portal-rls-rules. Nenhum UUID interno, nenhum campo bruto.
    // -------------------------------------------------------------------------
    const payload = {
      generated_at: new Date().toISOString(),
      payload_version: "1.3.0", // 1.3.0 — Redesign portal: schedule + white_label_enabled + status raw
      unit: {
        name: customer?.name ?? null,
        address: customer?.address ?? null,
        city: customer?.city ?? null,
        state: customer?.state ?? null,
      },
      contract: {
        name: contract.name ?? null,
        start_date: contract.start_date ?? null,
        frequency_label: frequencyLabel(
          (contract.frequency_value ?? null) as number | null,
          (contract.frequency_type ?? null) as string | null,
        ),
        next_pmoc_generation_date: contract.next_pmoc_generation_date ?? null,
        next_maintenance_date: contract.next_pmoc_generation_date ?? null,
        compliance_text:
          contract.pmoc_legal_compliance_text ?? "Conforme Lei Federal 13.589/2018",
        status_label: STATUS_CONTRACT_LABEL[contract.status] ?? "—",
        health_status: health?.health_status ?? "em_dia",
        overdue_count: health?.overdue_count ?? 0,
      },
      health: {
        status: health?.health_status ?? "em_dia",
        overdue_count: health?.overdue_count ?? 0,
      },
      responsible_technician: rt
        ? {
            full_name: rt.full_name ?? null,
            cft_crea: rt.cft_crea ?? null,
            modality: rt.modality ?? null,
            registry_number: rt.registry_number ?? null,
          }
        : null,
      tenant: {
        name: tenantName,
        logo_url: logoUrl,
        primary_color: primaryColor,
        address: companySettings?.address ?? null,
        city: companySettings?.city ?? null,
        state: companySettings?.state ?? null,
        // Onda redesign 2026-05-24: o portal usa esse flag pra decidir se mostra
        // o rodapé "Powered by Dominex". White-label ativo → esconde a marca.
        white_label_enabled: useWhiteLabel,
        // NOTA: telefone/email do tenant intencionalmente NÃO expostos (decisão CEO).
      },
      schedule,
      history,
      documents,
    };

    return jsonResponse(payload, 200);
  } catch (err) {
    console.error("[pmoc-portal-share] unexpected error", {
      message: (err as Error)?.message ?? String(err),
    });
    return jsonResponse({ error: "internal_error" }, 500);
  }
});
