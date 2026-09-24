import { formatDistanceToNow, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  AlertTriangle,
  Boxes,
  CheckCircle2,
  Cpu,
  HardDrive,
  Info,
  KeyRound,
  MemoryStick,
  RefreshCw,
  Server,
  ShieldAlert,
  Siren,
  Users,
  XCircle,
} from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { typography } from '@/lib/typography';
import {
  useAdminInfraMetrics,
  formatarDuracao,
  formatarMb,
  formatarPct,
  type InfraMetricas,
  type InfraStacks,
  type InfraFumaca,
} from '@/hooks/useAdminInfraMetrics';

/**
 * Aba "Infra" de /admin/estatisticas — saúde do motor fiscal e da VPS.
 *
 * ⚠️ REGRA CENTRAL DESTA TELA: a VPS é COMPARTILHADA com o EcoSistema. Os
 * blocos `servico` (só o motor fiscal) e `box` (a máquina inteira) NUNCA são
 * misturados e vão em seções separadas, com o aviso e a lista de ocupantes que
 * a própria resposta traz. Somar os dois faria a tela mentir sobre quem está
 * gastando a RAM.
 *
 * ⚠️ Coletor ausente (`stacks.disponivel: false`, `fumaca.disponivel: false`) é
 * estado LEGÍTIMO, com `motivo` escrito pelo serviço. Renderizar como erro
 * vermelho treina o operador a ignorar a tela.
 *
 * PT-BR chumbado: painel Auctus não entra no i18n de 4 idiomas.
 */

const desde = (iso: string | null | undefined) => {
  if (!iso) return null;
  try {
    return formatDistanceToNow(parseISO(iso), { addSuffix: true, locale: ptBR });
  } catch {
    return null;
  }
};

/** Célula de número com barra opcional. */
function Metrica({
  icon: Icon,
  label,
  valor,
  hint,
  pct,
  tom = 'default',
}: {
  icon: React.ElementType;
  label: string;
  valor: React.ReactNode;
  hint?: React.ReactNode;
  pct?: number | null;
  tom?: 'default' | 'warning' | 'danger';
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-2">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon className="h-4 w-4" />
        <span className="text-xs font-medium min-w-0">{label}</span>
      </div>
      <p
        className={cn(
          'text-xl font-bold tabular-nums leading-none',
          tom === 'danger' && 'text-red-600 dark:text-red-400',
          tom === 'warning' && 'text-amber-600 dark:text-amber-400',
        )}
      >
        {valor}
      </p>
      {pct != null && Number.isFinite(pct) && (
        <Progress
          value={Math.min(100, pct)}
          className={cn(
            'h-1.5',
            tom === 'danger' && '[&>div]:bg-red-500',
            tom === 'warning' && '[&>div]:bg-amber-500',
          )}
        />
      )}
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

const tomPorPct = (pct: number | null | undefined, alerta = 75, perigo = 90) => {
  if (pct == null) return 'default' as const;
  if (pct >= perigo) return 'danger' as const;
  if (pct >= alerta) return 'warning' as const;
  return 'default' as const;
};

/** Bloco de "retrato não disponível": informação, nunca vermelho. */
function RetratoAusente({ titulo, motivo }: { titulo: string; motivo?: string | null }) {
  return (
    <Alert>
      <Info className="h-4 w-4" />
      <AlertTitle>{titulo}</AlertTitle>
      <AlertDescription className="text-sm">
        {motivo ?? 'O coletor do host ainda não foi instalado nesta VPS.'}
      </AlertDescription>
    </Alert>
  );
}

export function EstatisticasInfraTab() {
  const { data, isLoading, isFetching, refetch } = useAdminInfraMetrics();

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full rounded-xl" />
        <Skeleton className="h-48 w-full rounded-xl" />
        <Skeleton className="h-48 w-full rounded-xl" />
      </div>
    );
  }

  // ── Falha ao falar com o motor fiscal ────────────────────────────────────
  // A rota `/v1/infra/metricas` pode ainda não ter sido publicada na VPS. Isso
  // é um fato a comunicar, não uma tela quebrada.
  if (!data || data.ok === false) {
    const erro = data && data.ok === false ? data.erro : null;
    const restrito = erro?.codigo === 'nao_autorizado' || erro?.codigo === 'nao_autenticado';
    return (
      <div className="space-y-4">
        <Alert variant={restrito ? 'destructive' : undefined}>
          {restrito ? <ShieldAlert className="h-4 w-4" /> : <Info className="h-4 w-4" />}
          <AlertTitle>
            {restrito ? 'Acesso restrito' : 'Métricas de infraestrutura indisponíveis'}
          </AlertTitle>
          <AlertDescription className="space-y-3">
            <p>
              {erro?.mensagem ??
                'Não foi possível consultar o motor fiscal. Tente novamente em instantes.'}
            </p>
            {!restrito && (
              <p className="text-xs text-muted-foreground">
                O painel não guarda cópia dessas métricas: elas são lidas do motor fiscal na hora
                da consulta. Enquanto ele não responder, não há o que mostrar aqui.
              </p>
            )}
            {!restrito && (
              <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
                <RefreshCw className={cn('h-4 w-4 mr-2', isFetching && 'animate-spin')} />
                Tentar de novo
              </Button>
            )}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const m: InfraMetricas = data.metricas;
  const servico = m.servico;
  const box = m.box;

  return (
    <div className="space-y-6">
      {/* ── Veredito ─────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Badge
            className={cn(
              'border-0 text-white font-medium gap-1.5 px-3 py-1',
              m.ok ? 'bg-emerald-500 hover:bg-emerald-500' : 'bg-amber-500 hover:bg-amber-500',
            )}
          >
            {m.ok ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
            {m.ok ? 'Motor fiscal saudável' : 'Motor fiscal degradado'}
          </Badge>
          <span className="text-xs text-muted-foreground">
            lido {desde(m.geradoEm) ?? 'agora'}
          </span>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={cn('h-4 w-4 mr-2', isFetching && 'animate-spin')} />
          Atualizar
        </Button>
      </div>

      {m.avisos.length > 0 && (
        <Alert>
          <Siren className="h-4 w-4" />
          <AlertTitle>
            {m.avisos.length === 1 ? '1 aviso do motor fiscal' : `${m.avisos.length} avisos do motor fiscal`}
          </AlertTitle>
          <AlertDescription>
            <ul className="mt-1 space-y-1.5 text-sm list-disc pl-4">
              {m.avisos.map((aviso, i) => (
                <li key={i}>{aviso}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {/* ── Serviço (SÓ o motor fiscal) ──────────────────────────────────── */}
      <section className="space-y-3">
        <div>
          <h2 className={typography.sectionTitle}>Motor fiscal (só este serviço)</h2>
          <p className="text-xs text-muted-foreground mt-1">
            {servico.papel}. Versão {servico.versaoApp} · no ar há{' '}
            {formatarDuracao(servico.uptimeSegundos)}
            {servico.revisao ? ` · revisão ${servico.revisao}` : ''}
          </p>
        </div>
        {/* Caixas independentes em vez de `divide-*` num grid (borda torta na
            quebra de linha). */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Metrica
          icon={MemoryStick}
          label="Memória do container"
          valor={formatarMb(servico.memoria.usadoMb)}
          pct={servico.memoria.usoPct}
          tom={tomPorPct(servico.memoria.usoPct, 80, 90)}
          hint={
            servico.memoria.limiteMb
              ? `limite ${formatarMb(servico.memoria.limiteMb)} · ${formatarPct(servico.memoria.usoPct)}`
              : 'sem limite declarado'
          }
        />
        <Metrica
          icon={Cpu}
          label="CPU média desde que subiu"
          valor={formatarPct(servico.cpu.mediaPctDesdeQueSubiu)}
          hint={
            servico.cpu.vezesEstrangulado
              ? `estrangulado ${servico.cpu.vezesEstrangulado}x`
              : 'sem estrangulamento'
          }
        />
        <Metrica
          icon={AlertTriangle}
          label="OOM desde que subiu"
          valor={servico.oom.mortesDesdeQueSubiu ?? '-'}
          tom={servico.oom.aconteceu ? 'danger' : 'default'}
          hint={
            servico.oom.vezesQueBateuNoTeto != null
              ? `bateu no teto ${servico.oom.vezesQueBateuNoTeto}x`
              : undefined
          }
        />
        <Metrica
          icon={KeyRound}
          label="Custódia (tmpfs em RAM)"
          valor={m.custodia.ok ? 'Conforme' : 'Não conforme'}
          tom={m.custodia.ok ? 'default' : 'danger'}
          hint={
            servico.tmpfsCustodia.tamanhoMb
              ? `${formatarMb(servico.tmpfsCustodia.usadoMb)} de ${formatarMb(servico.tmpfsCustodia.tamanhoMb)}`
              : 'chave privada nunca toca disco'
          }
        />
        </div>
      </section>

      {/* ── Box COMPARTILHADA ────────────────────────────────────────────── */}
      <section className="space-y-3">
        <h2 className={typography.sectionTitle}>VPS inteira (compartilhada)</h2>

        {/* Aviso vem DA RESPOSTA, não reescrito aqui: uma verdade só sobre o
            que está sendo medido. */}
        <Alert className="border-amber-500/60 bg-amber-500/10">
          <Users className="h-4 w-4" />
          <AlertTitle>Estes números não são só do Dominex</AlertTitle>
          <AlertDescription className="space-y-2">
            <p className="text-sm">{box.aviso}</p>
            {box.ocupantes?.length > 0 && (
              <ul className="text-sm list-disc pl-4 space-y-0.5">
                {box.ocupantes.map((o, i) => (
                  <li key={i}>{o}</li>
                ))}
              </ul>
            )}
          </AlertDescription>
        </Alert>

        {/* Caixas independentes em vez de `divide-*` num grid (borda torta na
            quebra de linha). */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Metrica
          icon={MemoryStick}
          label="RAM da VPS"
          valor={formatarPct(box.memoria.usoPct)}
          pct={box.memoria.usoPct}
          tom={tomPorPct(box.memoria.usoPct, 80, 90)}
          hint={`${formatarMb(box.memoria.usadoMb)} de ${formatarMb(box.memoria.totalMb)}`}
        />
        <Metrica
          icon={HardDrive}
          label="Disco da VPS"
          valor={formatarPct(box.disco.usadoPct)}
          pct={box.disco.usadoPct}
          tom={tomPorPct(box.disco.usadoPct, 80, 90)}
          hint={`${box.disco.livreGb ?? '-'} GB livres de ${box.disco.totalGb ?? '-'} GB · fonte: ${box.disco.fonte}`}
        />
        <Metrica
          icon={Cpu}
          label="Carga por núcleo (1 min)"
          valor={box.cpu.cargaPorNucleo1 ?? '-'}
          hint={`${box.cpu.nucleos ?? '-'} núcleo(s) · carga ${box.cpu.carga1 ?? '-'} / ${box.cpu.carga5 ?? '-'} / ${box.cpu.carga15 ?? '-'}`}
        />
        <Metrica
          icon={Server}
          label="VPS no ar há"
          valor={formatarDuracao(box.uptimeSegundos)}
          hint={
            box.swap.totalMb
              ? `swap ${formatarMb(box.swap.usadoMb)} de ${formatarMb(box.swap.totalMb)}`
              : 'sem swap configurado'
          }
        />
        </div>

        <BlocoStacks stacks={m.stacks} />
      </section>

      {/* ── Teste de fumaça ──────────────────────────────────────────────── */}
      <section className="space-y-3">
        <div>
          <h2 className={typography.sectionTitle}>Vigilância do lado do governo</h2>
          <p className="text-xs text-muted-foreground mt-1">
            O teste de fumaça é o que avisa quando a prefeitura ou a SEFAZ muda o layout sem
            avisar.
          </p>
        </div>
        <BlocoFumaca fumaca={m.fumaca} producaoBloqueada={m.governo.producaoBloqueada} />
      </section>
    </div>
  );
}

/** Containers vizinhos na mesma VPS, do retrato deixado pelo coletor do host. */
function BlocoStacks({ stacks }: { stacks: InfraStacks }) {
  if (!stacks.disponivel) {
    return (
      <RetratoAusente
        titulo="Lista de containers da VPS ainda não disponível"
        motivo={stacks.motivo}
      />
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className={cn(typography.cardTitle, 'flex items-center gap-2')}>
          <Boxes className="h-4 w-4" />
          Containers na VPS
          {stacks.atualizado === false && (
            <Badge className="border-0 bg-amber-500 text-white hover:bg-amber-500 font-medium">
              retrato velho
            </Badge>
          )}
        </CardTitle>
        {stacks.coletadoEm && (
          <p className="text-xs text-muted-foreground">
            coletado {desde(stacks.coletadoEm) ?? stacks.coletadoEm}
          </p>
        )}
      </CardHeader>
      <CardContent className="p-0 overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Container</TableHead>
              <TableHead>Stack</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="text-right">Memória</TableHead>
              <TableHead className="text-right">CPU</TableHead>
              <TableHead className="text-right">Reinícios</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {stacks.itens.map((item, i) => (
              <TableRow key={`${item.container ?? 'item'}-${i}`}>
                <TableCell className="font-medium">{item.container ?? '-'}</TableCell>
                <TableCell className="text-muted-foreground">{item.stack ?? '-'}</TableCell>
                <TableCell>
                  <Badge
                    className={cn(
                      'border-0 text-white font-medium',
                      item.estado === 'running'
                        ? 'bg-emerald-500 hover:bg-emerald-500'
                        : 'bg-red-500 hover:bg-red-500',
                    )}
                  >
                    {item.estado ?? 'desconhecido'}
                  </Badge>
                  {item.oomUltimaParada && (
                    <Badge className="ml-1 border-0 bg-red-500 text-white hover:bg-red-500 font-medium">
                      OOM
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatarMb(item.memMb)}
                  {item.memLimiteMb ? (
                    <span className="text-muted-foreground"> / {formatarMb(item.memLimiteMb)}</span>
                  ) : null}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatarPct(item.cpuPct)}
                </TableCell>
                <TableCell className="text-right tabular-nums">{item.reinicios ?? '-'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function BlocoFumaca({
  fumaca,
  producaoBloqueada,
}: {
  fumaca: InfraFumaca;
  producaoBloqueada: boolean | null;
}) {
  if (!fumaca.disponivel) {
    return (
      <RetratoAusente titulo="Nenhum teste de fumaça registrado" motivo={fumaca.motivo} />
    );
  }

  const falhou = fumaca.resultado === 'falha';

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge
            className={cn(
              'border-0 text-white font-medium gap-1.5',
              falhou ? 'bg-red-500 hover:bg-red-500' : 'bg-emerald-500 hover:bg-emerald-500',
            )}
          >
            {falhou ? <XCircle className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
            {falhou ? 'Último teste falhou' : 'Último teste passou'}
          </Badge>
          {fumaca.atualizado === false && (
            <Badge className="border-0 bg-amber-500 text-white hover:bg-amber-500 font-medium">
              retrato velho
            </Badge>
          )}
          {!fumaca.coberturaEmissao && (
            <Badge className="border-0 bg-amber-500 text-white hover:bg-amber-500 font-medium">
              cobertura rasa
            </Badge>
          )}
          {producaoBloqueada === true && (
            <Badge className="border-0 bg-slate-600 text-white hover:bg-slate-600 font-medium">
              produção bloqueada
            </Badge>
          )}
          {fumaca.executadoEm && (
            <span className="text-xs text-muted-foreground">
              executado {desde(fumaca.executadoEm) ?? fumaca.executadoEm}
            </span>
          )}
        </div>

        {!fumaca.coberturaEmissao && (
          <p className="text-xs text-muted-foreground">
            O teste ainda não emite uma nota de verdade em homologação. Uma mudança de layout do
            governo só apareceria numa nota de cliente.
          </p>
        )}

        {fumaca.falhas && fumaca.falhas.length > 0 && (
          <ul className="text-sm list-disc pl-4 space-y-1">
            {fumaca.falhas.map((f, i) => (
              <li key={i} className="text-red-600 dark:text-red-400">
                {f}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
