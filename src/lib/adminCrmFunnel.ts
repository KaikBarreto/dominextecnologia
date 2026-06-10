// Lógica pura do "Funil de Leads por Origem" do dashboard admin (Auctus/Dominex).
//
// Funil de CONVERSÃO CUMULATIVO: para cada etapa S (ordenada por position asc,
// excluindo as is_lost), conta os leads cuja stage atual tem position >= S.position,
// entre os não-perdidos. Resultado é monotônico decrescente.
//
// Por etapa, o count é quebrado por ORIGEM (source do lead), casando com
// company_origins por nome (case-insensitive) pra pegar a cor. source nulo/vazio
// vira "Não informado" (cinza). Origem não cadastrada usa fallback de paleta
// determinístico.
//
// Portado de EcoSistemaSaaS/src/lib/crmFunnel.ts. Adaptado aos tipos do Dominex:
// leads vêm de `admin_leads` (stage_id pode ser null), etapas de `admin_crm_stages`
// e cores de `company_origins` (color pode ser null).

export interface FunnelLead {
  stage_id: string | null;
  source?: string | null;
  created_at: string;
}

export interface FunnelStage {
  id: string;
  name: string;
  color: string;
  position: number;
  is_won: boolean;
  is_lost: boolean;
}

export interface FunnelOrigin {
  name: string;
  color: string | null;
}

export interface FunnelSegment {
  originName: string;
  color: string;
  count: number;
}

export interface FunnelStageData {
  id: string;
  name: string;
  count: number;
  pct: number; // count / firstStageCount (0..1), guard div/0
  segments: FunnelSegment[];
}

export interface FunnelData {
  stages: FunnelStageData[];
  origins: { name: string; color: string }[];
}

export interface BuildFunnelOpts {
  startDate: Date;
  endDate: Date;
  allTime: boolean;
}

export const UNINFORMED_ORIGIN = 'Não informado';
export const UNINFORMED_COLOR = '#9CA3AF';

// Paleta determinística pra origens que vierem nos leads mas não estiverem
// cadastradas em company_origins. Escolhida por hash estável do nome.
const FALLBACK_PALETTE = [
  '#6366F1',
  '#0EA5E9',
  '#10B981',
  '#F59E0B',
  '#EF4444',
  '#8B5CF6',
  '#EC4899',
  '#14B8A6',
  '#F97316',
  '#84CC16',
];

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function fallbackColor(name: string): string {
  return FALLBACK_PALETTE[hashString(name) % FALLBACK_PALETTE.length];
}

export function buildFunnelData(
  leads: FunnelLead[],
  stages: FunnelStage[],
  origins: FunnelOrigin[],
  opts: BuildFunnelOpts,
): FunnelData {
  const { startDate, endDate, allTime } = opts;

  // Etapas válidas: não-perdidas, ordenadas por position asc.
  const validStages = stages
    .filter((s) => !s.is_lost)
    .slice()
    .sort((a, b) => a.position - b.position);

  // Set de stageIds perdidos pra excluir leads que estão neles.
  const lostStageIds = new Set(stages.filter((s) => s.is_lost).map((s) => s.id));

  // Mapa stageId -> position (só das válidas).
  const stagePositionById = new Map<string, number>();
  validStages.forEach((s) => stagePositionById.set(s.id, s.position));

  // Mapa nome de origem (lowercase) -> cor cadastrada.
  const originColorByName = new Map<string, string>();
  origins.forEach((o) => {
    if (o?.name) originColorByName.set(o.name.toLowerCase(), o.color || UNINFORMED_COLOR);
  });

  // Filtra leads: remove perdidos; se !allTime, mantém só created_at no intervalo.
  // Também descarta leads cuja stage_id não está nas válidas (defensivo: stage
  // inexistente/órfã/null não deve aparecer no funil cumulativo).
  const startMs = startDate.getTime();
  const endMs = endDate.getTime();
  const filteredLeads = leads.filter((l) => {
    if (!l.stage_id) return false;
    if (lostStageIds.has(l.stage_id)) return false;
    if (!stagePositionById.has(l.stage_id)) return false;
    if (!allTime) {
      const t = new Date(l.created_at).getTime();
      if (Number.isNaN(t) || t < startMs || t > endMs) return false;
    }
    return true;
  });

  // Normaliza source -> { originName exibido, key lowercase }.
  // Casa com origins cadastradas pelo nome (case-insensitive) pra manter a
  // capitalização canônica da origem cadastrada; null/'' vira "Não informado".
  const canonicalOriginName = new Map<string, string>(); // lowercaseKey -> displayName
  origins.forEach((o) => {
    if (o?.name) canonicalOriginName.set(o.name.toLowerCase(), o.name);
  });

  const resolveOrigin = (source?: string | null): { name: string; color: string } => {
    const raw = (source ?? '').trim();
    if (!raw) {
      return { name: UNINFORMED_ORIGIN, color: UNINFORMED_COLOR };
    }
    const key = raw.toLowerCase();
    const display = canonicalOriginName.get(key) ?? raw;
    const color = originColorByName.get(key) ?? fallbackColor(display);
    return { name: display, color };
  };

  // Ordem estável de origens pra empilhamento consistente entre etapas:
  // 1) na ordem em que aparecem em `origins` (cadastradas), depois
  // 2) origens não cadastradas (ordem por hash estável), depois
  // 3) "Não informado" sempre por último.
  const originOrder = new Map<string, number>();
  let orderIdx = 0;
  origins.forEach((o) => {
    if (o?.name && !originOrder.has(o.name)) originOrder.set(o.name, orderIdx++);
  });
  const UNCATEGORIZED_BASE = 1_000_000; // não cadastradas vêm depois das cadastradas
  const LAST = 2_000_000; // "Não informado" por último

  const originRank = (name: string): number => {
    if (name === UNINFORMED_ORIGIN) return LAST;
    if (originOrder.has(name)) return originOrder.get(name)!;
    // não cadastrada: rank por hash estável dentro da faixa intermediária
    return UNCATEGORIZED_BASE + (hashString(name) % 100000);
  };

  // Pré-calcula posição de cada lead filtrado (sabemos que existe).
  const leadPos = filteredLeads.map((l) => ({
    pos: stagePositionById.get(l.stage_id!)!,
    origin: resolveOrigin(l.source),
  }));

  // firstStageCount = count da 1ª stage válida (top do funil).
  // Como é cumulativo (pos >= primeira.position), inclui todos os leads filtrados.
  const firstStage = validStages[0];
  const firstStageCount = firstStage
    ? leadPos.filter((lp) => lp.pos >= firstStage.position).length
    : 0;

  const stagesData: FunnelStageData[] = validStages.map((s) => {
    // Leads cuja stage atual tem position >= s.position (cumulativo).
    const inStage = leadPos.filter((lp) => lp.pos >= s.position);
    const count = inStage.length;

    // Quebra por origem.
    const segMap = new Map<string, FunnelSegment>();
    inStage.forEach((lp) => {
      const existing = segMap.get(lp.origin.name);
      if (existing) {
        existing.count += 1;
      } else {
        segMap.set(lp.origin.name, {
          originName: lp.origin.name,
          color: lp.origin.color,
          count: 1,
        });
      }
    });

    const segments = Array.from(segMap.values()).sort(
      (a, b) => originRank(a.originName) - originRank(b.originName),
    );

    const pct = firstStageCount > 0 ? count / firstStageCount : 0;

    return { id: s.id, name: s.name, count, pct, segments };
  });

  // Lista de origens efetivamente presentes no funil (pra legenda), na mesma
  // ordem estável usada no empilhamento.
  const presentOrigins = new Map<string, string>(); // name -> color
  stagesData.forEach((sd) => {
    sd.segments.forEach((seg) => {
      if (!presentOrigins.has(seg.originName)) {
        presentOrigins.set(seg.originName, seg.color);
      }
    });
  });
  const outOrigins: { name: string; color: string }[] = Array.from(presentOrigins.entries())
    .map(([name, color]) => ({ name, color }))
    .sort((a, b) => originRank(a.name) - originRank(b.name));

  return { stages: stagesData, origins: outOrigins };
}
