import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { todayInTz, DEFAULT_TIME_ZONE } from '@/lib/timezone';

/**
 * Estatísticas de USO agregado de toda a base (painel master Auctus).
 *
 * Fronteira única do Supabase pra a RPC `get_admin_usage_statistics`, que é
 * SECURITY DEFINER e cruza TODAS as empresas. O guard é server-side e é
 * `super_admin` estrito (aborta 42501 pra qualquer outro) — vendedor-admin NÃO
 * vê, decisão do CEO em 2026-09-24. Por isso a RPC não usa `is_admin_user`,
 * que inclui vendedor-admin. Este hook não é a segurança; é só a UX.
 *
 * ⚠️ O período ANTERIOR vem pronto no campo `anterior`. Nunca recalcular o
 * delta no client com uma segunda chamada: a janela anterior da RPC é "mesmo
 * número de dias imediatamente antes", e duas definições divergindo é o começo
 * de um número que ninguém confia.
 *
 * ⚠️ A classificação de saúde (saudável/atenção/em risco/inativo) NÃO está
 * aqui. Ela continua sendo de `get_company_health_scores`
 * (`useCompanyHealthScores`), fonte única. Aqui só saem `ultima_atividade` e
 * `dias_sem_atividade` crus.
 */

export type UsageBucket = 'day' | 'week' | 'month';

/** Métricas de criação no período. Mesmas chaves em `totais`, `anterior`, cada ponto da série e cada linha do ranking. */
export interface UsageMetrics {
  ordens_servico: number;
  tarefas: number;
  clientes: number;
  equipamentos: number;
  orcamentos: number;
  /** Total de contratos. `contratos_pmoc` é SUBCONJUNTO deste — nunca somar os dois. */
  contratos: number;
  contratos_pmoc: number;
  pmoc_documentos: number;
  nfse_emitidas: number;
  nfse_rejeitadas: number;
  eventos_uso: number;
}

export type UsageMetricKey = keyof UsageMetrics;

export interface UsageTotals extends UsageMetrics {
  /** Só existe em `totais` (a RPC não devolve o equivalente em `anterior`). */
  usuarios_ativos: number;
}

export interface UsageSeriePoint extends UsageMetrics {
  /** Início do bucket, `YYYY-MM-DD`. Gaps já vêm preenchidos com 0 pela RPC. */
  bucket: string;
}

export interface UsageRankingRow extends UsageMetrics {
  company_id: string;
  company_name: string;
  subscription_status: string | null;
  subscription_plan: string | null;
  is_internal: boolean;
  /** Soma de criação no período. Exclui eventos_uso, contratos_pmoc e nfse_rejeitadas. */
  total_uso: number;
  ultima_atividade: string | null;
  /** null = nunca registrou atividade. */
  dias_sem_atividade: number | null;
}

export interface AdminUsageStatistics {
  periodo: {
    de: string;
    ate: string;
    dias: number;
    bucket: UsageBucket;
    timezone: string;
    anterior_de: string;
    anterior_ate: string;
    inclui_internas: boolean;
    contas_internas_existentes: number;
  };
  empresas: {
    total: number;
    ativas: number;
    testando: number;
    inativas: number;
    novas_no_periodo: number;
    com_uso_no_periodo: number;
  };
  totais: UsageTotals;
  anterior: UsageMetrics;
  serie: UsageSeriePoint[];
  /** Já ordenado por `total_uso` DESC pela RPC. */
  ranking: UsageRankingRow[];
}

/** Rótulos PT-BR das métricas (painel Auctus não entra no i18n de 4 idiomas). */
export const USAGE_METRIC_LABELS: Record<UsageMetricKey | 'usuarios_ativos', string> = {
  ordens_servico: 'Ordens de serviço',
  tarefas: 'Tarefas',
  clientes: 'Clientes',
  equipamentos: 'Equipamentos',
  orcamentos: 'Orçamentos',
  contratos: 'Contratos',
  contratos_pmoc: 'Contratos PMOC',
  pmoc_documentos: 'Documentos PMOC',
  nfse_emitidas: 'NFS-e emitidas',
  nfse_rejeitadas: 'NFS-e rejeitadas',
  eventos_uso: 'Eventos de uso',
  usuarios_ativos: 'Usuários ativos',
};

/** Ordem de exibição das métricas. `contratos_pmoc` sai logo depois de `contratos` pra deixar óbvio que é recorte. */
export const USAGE_METRIC_ORDER: UsageMetricKey[] = [
  'ordens_servico',
  'tarefas',
  'clientes',
  'equipamentos',
  'orcamentos',
  'contratos',
  'contratos_pmoc',
  'pmoc_documentos',
  'nfse_emitidas',
  'nfse_rejeitadas',
];

export type UsagePeriodPreset =
  | 'this_month'
  | 'last_month'
  | 'last7'
  | 'last30'
  | 'last90'
  | 'this_year';

export const USAGE_PERIOD_LABELS: Record<UsagePeriodPreset, string> = {
  this_month: 'Este mês',
  last_month: 'Mês passado',
  last7: 'Últimos 7 dias',
  last30: 'Últimos 30 dias',
  last90: 'Últimos 90 dias',
  this_year: 'Este ano',
};

export const USAGE_BUCKET_LABELS: Record<UsageBucket, string> = {
  day: 'Por dia',
  week: 'Por semana',
  month: 'Por mês',
};

const iso = (d: Date) => {
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mes}-${dia}`;
};

/**
 * Converte o preset em `{from, to}` no fuso da Auctus (Brasília), que é o mesmo
 * eixo que a RPC usa. Mês é SEMPRE mês calendário, nunca "últimos 30 dias" —
 * "Últimos 30 dias" é outro preset, explícito.
 */
export function usagePeriodRange(preset: UsagePeriodPreset): { from: string; to: string } {
  // Meio-dia local evita qualquer sombra de fuso ao converter a string em Date.
  const hoje = new Date(`${todayInTz(DEFAULT_TIME_ZONE)}T12:00:00`);
  const to = iso(hoje);

  switch (preset) {
    case 'this_month':
      return { from: iso(new Date(hoje.getFullYear(), hoje.getMonth(), 1)), to };
    case 'last_month': {
      const inicio = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1);
      // Dia 0 do mês corrente = último dia do mês anterior (clamp automático).
      const fim = new Date(hoje.getFullYear(), hoje.getMonth(), 0);
      return { from: iso(inicio), to: iso(fim) };
    }
    case 'last7': {
      const inicio = new Date(hoje);
      inicio.setDate(inicio.getDate() - 6);
      return { from: iso(inicio), to };
    }
    case 'last30': {
      const inicio = new Date(hoje);
      inicio.setDate(inicio.getDate() - 29);
      return { from: iso(inicio), to };
    }
    case 'last90': {
      const inicio = new Date(hoje);
      inicio.setDate(inicio.getDate() - 89);
      return { from: iso(inicio), to };
    }
    case 'this_year':
      return { from: iso(new Date(hoje.getFullYear(), 0, 1)), to };
  }
}

/** Bucket que faz sentido pro tamanho da janela (evita série de 365 pontos por dia). */
export function bucketSugerido(preset: UsagePeriodPreset): UsageBucket {
  if (preset === 'this_year') return 'month';
  if (preset === 'last90') return 'week';
  return 'day';
}

export interface UseAdminUsageStatisticsParams {
  from: string;
  to: string;
  bucket: UsageBucket;
  /** Inclui Demo Dominex / Minha Empresa (Tutorial). Padrão: false. */
  includeInternal?: boolean;
  enabled?: boolean;
}

export function useAdminUsageStatistics({
  from,
  to,
  bucket,
  includeInternal = false,
  enabled = true,
}: UseAdminUsageStatisticsParams) {
  return useQuery<AdminUsageStatistics>({
    queryKey: ['admin-usage-statistics', from, to, bucket, includeInternal],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_admin_usage_statistics', {
        p_from: from,
        p_to: to,
        p_bucket: bucket,
        p_include_internal: includeInternal,
        p_timezone: DEFAULT_TIME_ZONE,
      });
      if (error) throw error;
      return data as unknown as AdminUsageStatistics;
    },
    // Varredura cross-tenant: cara. 5 min de frescor é mais do que suficiente
    // pra uma tela de leitura de tendência.
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: (count, err) => !isPermissionError(err) && count < 1,
  });
}

/** 42501 = a RPC recusou por não ser super_admin. Não adianta tentar de novo. */
export function isPermissionError(err: unknown): boolean {
  const e = err as { code?: string; message?: string } | null;
  return e?.code === '42501' || /permission denied|não autorizado/i.test(e?.message ?? '');
}

/** Variação percentual contra o período anterior. `null` quando não há base de comparação. */
export function variacaoPct(atual: number, anterior: number): number | null {
  if (!anterior) return atual > 0 ? null : 0;
  return ((atual - anterior) / anterior) * 100;
}
