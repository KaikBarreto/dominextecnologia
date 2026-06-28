import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Enriquecimento das visitas (OSs) de UM contrato pra o documento "Relatório de
 * Visitas" (consolidado retrospectivo do contrato COMUM). Hook é a fronteira do
 * Supabase — o componente nunca chama `supabase.from(...)` direto.
 *
 * O contrato já embute `service_orders` na forma mínima (id, order_number,
 * status, scheduled_date). Aqui buscamos SÓ o que falta pro comprovante, e SÓ
 * quando o documento está aberto (`enabled`), em queries enxutas e AGREGADAS
 * (não N por OS), escopadas pelos ids das OSs do contrato:
 *
 *  1. `service_orders`: data de execução (check-in / conclusão) + técnico.
 *  2. `profiles`: nome do técnico responsável (keyed por user_id).
 *  3. `service_order_equipment` + `equipment`: equipamentos atendidos por OS.
 *  4. `service_order_activities`: contagem de conformidade por OS (respondidos /
 *     conformes / não-conformes) — o "indicador de itens respondidos".
 *
 * RLS de cada tabela já filtra por company_id (tenant); o `.in('...', osIds)`
 * fecha o escopo no contrato. Sem service-role, sem edge.
 */

export interface VisitConformity {
  /** Itens do checklist respondidos (conformity_status != null). */
  answered: number;
  /** Total de itens do checklist (atividades da OS). */
  total: number;
  conforme: number;
  naoConforme: number;
  na: number;
}

export interface VisitEquipmentRef {
  id: string;
  name: string;
  meta: string | null;
}

export interface VisitEnrichment {
  /** Data real de execução: conclusão > check-in (ISO) ou null. */
  executedAt: string | null;
  technicianName: string | null;
  equipments: VisitEquipmentRef[];
  conformity: VisitConformity | null;
  /** Código curto pro link público da OS (pretty link). */
  publicShortCode: string | null;
}

export interface ContractVisitsReportData {
  /** osId → enriquecimento. OS sem entrada = só o que o contrato já trazia. */
  byOsId: Map<string, VisitEnrichment>;
  isLoading: boolean;
}

const EMPTY: ContractVisitsReportData = { byOsId: new Map(), isLoading: false };

export function useContractVisitsReport(
  osIds: string[],
  enabled: boolean,
): ContractVisitsReportData {
  // Chave estável (ordenada) pra cache não invalidar por ordem dos ids.
  const ids = [...osIds].filter(Boolean).sort();

  const { data, isLoading } = useQuery({
    queryKey: ['contract-visits-report', ids],
    enabled: enabled && ids.length > 0,
    queryFn: async (): Promise<Map<string, VisitEnrichment>> => {
      const byOsId = new Map<string, VisitEnrichment>();
      for (const id of ids) {
        byOsId.set(id, {
          executedAt: null,
          technicianName: null,
          equipments: [],
          conformity: null,
          publicShortCode: null,
        });
      }

      // 1. Campos extras das OSs (execução + técnico + short code).
      const { data: orders, error: ordersErr } = await supabase
        .from('service_orders')
        .select('id, technician_id, check_in_time, completed_at, public_short_code')
        .in('id', ids);
      if (ordersErr) throw ordersErr;

      const technicianIds = new Set<string>();
      for (const o of orders ?? []) {
        const entry = byOsId.get(o.id);
        if (!entry) continue;
        entry.executedAt = o.completed_at ?? o.check_in_time ?? null;
        entry.publicShortCode = o.public_short_code ?? null;
        if (o.technician_id) technicianIds.add(o.technician_id);
      }

      // 2. Nomes dos técnicos (profiles por user_id) — uma query agregada.
      if (technicianIds.size > 0) {
        const { data: profiles, error: profErr } = await supabase
          .from('profiles')
          .select('user_id, full_name')
          .in('user_id', Array.from(technicianIds));
        if (profErr) throw profErr;
        const nameByUserId = new Map<string, string | null>();
        for (const p of profiles ?? []) nameByUserId.set(p.user_id, p.full_name);
        for (const o of orders ?? []) {
          const entry = byOsId.get(o.id);
          if (entry && o.technician_id) {
            entry.technicianName = nameByUserId.get(o.technician_id) ?? null;
          }
        }
      }

      // 3. Equipamentos atendidos por OS (service_order_equipment + equipment).
      const { data: soe, error: soeErr } = await supabase
        .from('service_order_equipment')
        .select('service_order_id, equipment:equipment_id (id, name, brand, model)')
        .in('service_order_id', ids);
      if (soeErr) throw soeErr;
      for (const row of soe ?? []) {
        const entry = byOsId.get(row.service_order_id);
        const eq = (row as { equipment?: { id: string; name: string; brand: string | null; model: string | null } | null }).equipment;
        if (!entry || !eq) continue;
        const meta = [eq.brand, eq.model].filter(Boolean).join(' · ') || null;
        // Dedup por equipamento (a mesma máquina pode aparecer 2x na OS).
        if (entry.equipments.some((e) => e.id === eq.id)) continue;
        entry.equipments.push({ id: eq.id, name: eq.name, meta });
      }

      // 4. Conformidade por OS — contagem agregada (pagina até esgotar, pois
      //    várias OSs somam fácil mais de 1000 atividades).
      const PAGE = 1000;
      for (let from = 0; ; from += PAGE) {
        const { data: acts, error: actErr } = await supabase
          .from('service_order_activities')
          .select('service_order_id, conformity_status')
          .in('service_order_id', ids)
          .order('id', { ascending: true })
          .range(from, from + PAGE - 1);
        if (actErr) throw actErr;
        const page = acts ?? [];
        for (const a of page) {
          const entry = byOsId.get(a.service_order_id);
          if (!entry) continue;
          if (!entry.conformity) {
            entry.conformity = { answered: 0, total: 0, conforme: 0, naoConforme: 0, na: 0 };
          }
          const c = entry.conformity;
          c.total += 1;
          const st = (a as { conformity_status: string | null }).conformity_status;
          if (st) {
            c.answered += 1;
            if (st === 'conforme') c.conforme += 1;
            else if (st === 'nao_conforme') c.naoConforme += 1;
            else if (st === 'na') c.na += 1;
          }
        }
        if (page.length < PAGE) break;
      }

      return byOsId;
    },
  });

  if (!enabled) return EMPTY;
  return { byOsId: data ?? new Map(), isLoading };
}
