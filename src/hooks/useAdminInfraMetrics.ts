import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Métricas de infraestrutura do motor fiscal (`dominex-fiscal`, na VPS).
 *
 * Fronteira única do Supabase pra a edge function `admin-infra-metrics`, que é
 * um proxy autenticado: o `FISCAL_SERVICE_TOKEN` é segredo de SERVIÇO e não
 * pode ir pro browser. O guard de `super_admin` é server-side, na edge.
 *
 * ⚠️ A VPS é COMPARTILHADA com o EcoSistema. O bloco `box` mede a MÁQUINA
 * INTEIRA (Evolution API do Dominex E do EcoSistema, ecosistema-dfe, Caddy); só
 * o bloco `servico` é o motor fiscal. A própria resposta traz `box.aviso` e
 * `box.ocupantes` em PT-BR — a tela usa esses campos em vez de reescrever o
 * texto, pra não haver duas verdades sobre o que está sendo medido.
 *
 * ⚠️ `stacks.disponivel: false` e `fumaca.disponivel: false` são estados
 * LEGÍTIMOS (o coletor do host ainda não foi instalado), com `motivo` escrito.
 * Renderizar isso como erro vermelho treina o operador a ignorar a tela.
 */

export type InfraErroCodigo =
  | 'nao_configurado'
  | 'rota_indisponivel'
  | 'nao_autorizado_no_motor'
  | 'tempo_esgotado'
  | 'rede'
  | 'resposta_invalida'
  | 'erro_do_motor'
  | 'nao_autenticado'
  | 'nao_autorizado'
  | 'erro_interno';

export interface InfraErro {
  codigo: InfraErroCodigo | string;
  mensagem: string;
}

export interface InfraMemoriaServico {
  fonte: string;
  usadoMb: number | null;
  limiteMb: number | null;
  picoMb?: number | null;
  usoPct: number | null;
}

export interface InfraCpuServico {
  fonte: string;
  usoSegundos?: number | null;
  mediaPctDesdeQueSubiu?: number | null;
  vezesEstrangulado?: number | null;
  estranguladoSegundos?: number | null;
}

export interface InfraOom {
  mortesDesdeQueSubiu: number | null;
  aconteceu: boolean | null;
  vezesQueBateuNoTeto: number | null;
}

export interface InfraTmpfs {
  ok: boolean;
  emRam: boolean | null;
  noexec: boolean | null;
  nosuid: boolean | null;
  modoPrivado: boolean;
  gravavel: boolean | null;
  tamanhoMb?: number | null;
  usadoMb?: number | null;
}

export interface InfraServico {
  nome: string;
  papel: string;
  versaoApp: string;
  imagem: string;
  revisao: string | null;
  python: string;
  iniciadoEm: string;
  uptimeSegundos: number;
  memoria: InfraMemoriaServico;
  cpu: InfraCpuServico;
  processos: { atual: number | null; limite: number | null };
  oom: InfraOom;
  tmpfsCustodia: InfraTmpfs;
}

export interface InfraBox {
  /** Sempre true. Antídoto contra a tela mentir: estes números incluem o EcoSistema. */
  compartilhada: boolean;
  aviso: string;
  ocupantes: string[];
  uptimeSegundos: number | null;
  memoria: {
    totalMb: number | null;
    usadoMb: number | null;
    disponivelMb: number | null;
    usoPct: number | null;
  };
  swap: { totalMb: number | null; usadoMb: number | null };
  cpu: {
    nucleos: number | null;
    carga1: number | null;
    carga5: number | null;
    carga15: number | null;
    cargaPorNucleo1: number | null;
  };
  disco: {
    totalGb: number | null;
    livreGb: number | null;
    usadoPct: number | null;
    fonte: string;
  };
}

export interface InfraStackItem {
  stack?: string | null;
  container?: string | null;
  estado?: string | null;
  saude?: string | null;
  reinicios?: number | null;
  memMb?: number | null;
  memLimiteMb?: number | null;
  cpuPct?: number | null;
  oomUltimaParada?: boolean | null;
  criadoEm?: string | null;
}

export interface InfraStacks {
  disponivel: boolean;
  /** Preenchido quando `disponivel` é false. É explicação, não erro. */
  motivo?: string | null;
  coletadoEm?: string | null;
  idadeSegundos?: number | null;
  atualizado?: boolean;
  itens: InfraStackItem[];
}

export interface InfraFumaca {
  disponivel: boolean;
  motivo?: string | null;
  executadoEm?: string | null;
  idadeSegundos?: number | null;
  atualizado?: boolean;
  modo?: string | null;
  resultado?: string | null;
  falhas?: string[];
  detalhes?: string[];
  /** false = o smoke não emite nota de verdade em homologação (cobertura rasa). */
  coberturaEmissao: boolean;
}

export interface InfraCustodia {
  ok: boolean;
  kekAbreOQueFecha: boolean;
  keksConfiguradas: number;
  kekAtualId: string | null;
  tmpfsConforme: boolean;
  acervoNestaVps: boolean;
}

export interface InfraGoverno {
  versoesBibliotecas: Record<string, unknown>;
  producaoBloqueada: boolean | null;
}

export interface InfraMetricas {
  ok: boolean;
  status: string;
  geradoEm: string;
  avisos: string[];
  servico: InfraServico;
  box: InfraBox;
  stacks: InfraStacks;
  custodia: InfraCustodia;
  fumaca: InfraFumaca;
  governo: InfraGoverno;
}

export type InfraResposta =
  | { ok: true; consultadoEm: string; fonte: string; metricas: InfraMetricas }
  | { ok: false; erro: InfraErro };

/**
 * A edge devolve falha do MOTOR em HTTP 200 (veredito no corpo). Só auth falha
 * com status de erro, e aí o `supabase-js` esconde o corpo em `error.context`
 * (que é uma Response) — desempacotamos pra não mostrar
 * "Edge Function returned a non-2xx status code" pro operador.
 */
async function desempacotarErro(error: unknown): Promise<InfraErro> {
  const ctx = (error as { context?: unknown })?.context;
  if (ctx instanceof Response) {
    try {
      const corpo = await ctx.clone().json();
      if (corpo?.erro?.mensagem) return corpo.erro as InfraErro;
    } catch {
      /* corpo não-JSON: cai no genérico */
    }
  }
  return {
    codigo: 'erro_interno',
    mensagem:
      (error as Error)?.message ??
      'Não foi possível consultar a infraestrutura do motor fiscal.',
  };
}

export function useAdminInfraMetrics(enabled = true) {
  return useQuery<InfraResposta>({
    queryKey: ['admin-infra-metrics'],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('admin-infra-metrics', {
        method: 'GET',
      });
      if (error) return { ok: false, erro: await desempacotarErro(error) };
      return data as InfraResposta;
    },
    // Barato do lado do motor (lê /proc), mas não é tela de tempo real.
    staleTime: 30 * 1000,
    refetchOnWindowFocus: false,
    retry: false,
  });
}

/** Segundos → "3d 4h", "4h 12min", "12min". Vazio vira traço. */
export function formatarDuracao(segundos: number | null | undefined): string {
  if (segundos == null || !Number.isFinite(segundos)) return '-';
  const s = Math.max(0, Math.floor(segundos));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}min`;
  if (m > 0) return `${m}min`;
  return `${s}s`;
}

export function formatarMb(mb: number | null | undefined): string {
  if (mb == null || !Number.isFinite(mb)) return '-';
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
  return `${Math.round(mb)} MB`;
}

export function formatarPct(pct: number | null | undefined): string {
  if (pct == null || !Number.isFinite(pct)) return '-';
  return `${pct.toFixed(1)}%`;
}
