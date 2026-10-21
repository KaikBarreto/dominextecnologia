/**
 * Fluxo de caixa previsto, dia a dia.
 *
 * Espelha o painel que o BPO financeiro monta no Power BI: indicadores em
 * cima, matriz de rubricas × dias embaixo, com a coluna de DÍVIDA antes dos
 * dias, e a evolução do saldo no rodapé.
 *
 * A dívida aparece numa coluna própria e NÃO é descontada do saldo — ver a
 * explicação em `src/lib/cash-flow-forecast.ts`.
 */

import { useMemo, useState } from 'react';
import { AlertTriangle, ArrowDownCircle, ArrowUpCircle, Wallet, Info, type LucideIcon } from 'lucide-react';
import {
  AreaChart, Area, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';
import { useLocaleFormatters } from '@/lib/format/hooks';
import { useCashFlowForecast } from '@/hooks/useCashFlowForecast';
import { useFinancialCategories } from '@/hooks/useFinancialCategories';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { UNASSIGNED_ACCOUNT_ID } from '@/lib/cash-flow-forecast';
import { getCategoryIcon } from './categoryIcons';

const HORIZONTES = [15, 30] as const;

/** `2026-10-18` → `18/10`. Nunca `new Date(iso)`: o fuso voltaria um dia. */
function diaCurto(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${m[3]}/${m[2]}` : iso;
}

interface LinhaRubrica {
  chave: string;
  rotulo: string;
  /** Soma por dia, na ordem de `days`. */
  porDia: number[];
  /** Valor da coluna Dívida. `null` = rubrica sem dívida. */
  divida: number | null;
  tipo: 'saldo' | 'entrada' | 'saidaTotal' | 'categoria';
  cor?: string | null;
  Icone?: LucideIcon;
}

export function CashFlowForecast() {
  const { money } = useLocaleFormatters();
  const isMobile = useIsMobile();
  const [horizonDays, setHorizonDays] = useState<number>(15);
  /**
   * Célula aberta no painel de detalhe. É o quadro "Descrição | Valor" do
   * painel do BPO: ele perguntou "existe um mundo no qual eu clico na despesa
   * e consigo ter o visual do que é? no dia 22 lancei 2 alimentação, um lanche
   * de 25 e um almoço de 100, seria interessante enxergar isso separado".
   * Os lançamentos já viajam em `day.events`, então é só desenhar.
   */
  const [celula, setCelula] = useState<{ data: string; categoria: string | null } | null>(null);

  const { forecast, isLoading } = useCashFlowForecast({ horizonDays });
  const { categories } = useFinancialCategories();

  const categoriaPorNome = useMemo(
    () => new Map(categories.map((categoria) => [categoria.name, categoria])),
    [categories],
  );

  const fmt = (v: number) => money(v);

  /**
   * Monta as linhas da matriz. As saídas são quebradas por CATEGORIA, que é o
   * que o BPO pediu: "na parte da esquerda quais são as categorias".
   */
  const linhas = useMemo<LinhaRubrica[]>(() => {
    if (!forecast) return [];
    const dias = forecast.days;

    const saldoInicial: LinhaRubrica = {
      chave: 'saldo-inicial',
      rotulo: 'Saldo inicial',
      porDia: dias.map((d) => d.opening),
      divida: null,
      tipo: 'saldo',
    };

    const recebimentos: LinhaRubrica = {
      chave: 'recebimentos',
      rotulo: 'Recebimentos',
      porDia: dias.map((d) => d.inflow),
      divida: forecast.openingDebt.receivable || null,
      tipo: 'entrada',
    };

    const totalSaidas: LinhaRubrica = {
      chave: 'total-saidas',
      rotulo: 'Total de saídas',
      porDia: dias.map((d) => d.outflow),
      divida: forecast.openingDebt.payable || null,
      tipo: 'saidaTotal',
    };

    // Categorias de saída, uma linha cada.
    const porCategoria = new Map<string, number[]>();
    dias.forEach((dia, i) => {
      for (const ev of dia.events) {
        if (ev.direction !== 'out') continue;
        const nome = ev.categoryName || 'Sem categoria';
        let serie = porCategoria.get(nome);
        if (!serie) {
          serie = new Array(dias.length).fill(0);
          porCategoria.set(nome, serie);
        }
        serie[i] += ev.amountCents / 100;
      }
    });

    const categorias: LinhaRubrica[] = [...porCategoria.entries()]
      .sort((a, b) => b[1].reduce((x, y) => x + y, 0) - a[1].reduce((x, y) => x + y, 0))
      .map(([nome, serie]) => ({
        chave: `cat:${nome}`,
        rotulo: nome,
        porDia: serie,
        divida: null,
        tipo: 'categoria' as const,
        cor: categoriaPorNome.get(nome)?.color ?? '#64748b',
        Icone: getCategoryIcon(categoriaPorNome.get(nome)?.icon),
      }));

    const saldoFinal: LinhaRubrica = {
      chave: 'saldo-final',
      rotulo: 'Saldo final',
      porDia: dias.map((d) => d.closing),
      divida: null,
      tipo: 'saldo',
    };

    return [saldoInicial, recebimentos, totalSaidas, ...categorias, saldoFinal];
  }, [categoriaPorNome, forecast]);

  /** Lançamentos por trás da célula aberta. */
  const detalhe = useMemo(() => {
    if (!forecast || !celula) return null;
    const dia = forecast.days.find((d) => d.date === celula.data);
    if (!dia) return null;
    const itens = dia.events.filter((ev) => {
      if (celula.categoria === null) return true;
      return (ev.categoryName || 'Sem categoria') === celula.categoria;
    });
    const total = itens.reduce((a, ev) => a + (ev.direction === 'in' ? ev.amountCents : -ev.amountCents), 0) / 100;
    return { dia, itens, total };
  }, [forecast, celula]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
        <Skeleton className="h-80" />
      </div>
    );
  }

  if (!forecast) return null;

  const kpis = [
    { rotulo: 'Saldo atual', valor: forecast.startingBalance, Icone: Wallet, fundo: 'bg-primary' },
    { rotulo: `A receber · ${horizonDays} dias`, valor: forecast.days.reduce((a, d) => a + d.inflow, 0), Icone: ArrowDownCircle, fundo: 'bg-success' },
    { rotulo: `A pagar · ${horizonDays} dias`, valor: forecast.days.reduce((a, d) => a + d.outflow, 0), Icone: ArrowUpCircle, fundo: 'bg-destructive' },
    { rotulo: 'Dívidas a receber', valor: forecast.openingDebt.receivable, Icone: AlertTriangle, fundo: 'bg-warning' },
    { rotulo: 'Dívidas a pagar', valor: forecast.openingDebt.payable, Icone: AlertTriangle, fundo: 'bg-warning' },
  ];

  return (
    <div className="space-y-4">
      {/* Indicadores */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {kpis.map(({ rotulo, valor, Icone, fundo }) => (
          <div key={rotulo} className={cn('rounded-lg border border-transparent p-3 text-white shadow-sm sm:p-4', fundo)}>
            <div className="flex items-center gap-2 mb-1">
              <Icone className="h-4 w-4 shrink-0 text-white" />
              <span className="text-[11px] uppercase tracking-wide text-white truncate">{rotulo}</span>
            </div>
            <p className="whitespace-nowrap text-lg sm:text-xl font-bold tabular-nums text-white">{fmt(valor)}</p>
          </div>
        ))}
      </div>

      {/* Alerta de conta negativa — o motivo de a feature existir */}
      {forecast.firstNegativeDay && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive bg-destructive p-3 text-destructive-foreground shadow-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-white" />
          <div className="text-sm">
            <p className="font-semibold text-white">
              A conta {forecast.days[0].byAccount.find((c) => c.accountId === forecast.firstNegativeDay!.accountId)?.name}
              {' '}fica negativa em {diaCurto(forecast.firstNegativeDay.date)}.
            </p>
            <p className="text-white/85">
              O saldo somado pode parecer saudável, mas o dinheiro não está na conta que vai ser debitada.
            </p>
          </div>
        </div>
      )}

      {/* Honestidade: dinheiro sem conta enfraquece o alerta acima */}
      {(forecast.unassignedTotal.inflow > 0 || forecast.unassignedTotal.outflow > 0) && (
        <div className="rounded-lg border bg-muted/30 p-3 flex items-start gap-2">
          <Info className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
          <p className="text-sm text-muted-foreground">
            {fmt(forecast.unassignedTotal.outflow)} a pagar e {fmt(forecast.unassignedTotal.inflow)} a receber
            {' '}não dizem de qual conta saem ou entram. Esses valores já alteram o saldo total no vencimento e aparecem em &quot;Sem conta definida&quot;; nenhuma conta real muda até você informar de onde sai ou onde entra o dinheiro.
          </p>
        </div>
      )}

      {/* Horizonte */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">Próximos</span>
        {HORIZONTES.map((h) => (
          <Button
            key={h}
            size="sm"
            variant={horizonDays === h ? 'default' : 'outline'}
            onClick={() => setHorizonDays(h)}
          >
            {h} dias
          </Button>
        ))}
      </div>

      {/* Matriz rubricas × dias */}
      <div className="rounded-lg border overflow-hidden">
        <div className="max-h-[70vh] overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-30 bg-card shadow-[0_1px_0_hsl(var(--border))]">
              <tr className="bg-muted/40">
                <th className="text-left font-medium px-3 py-2 sticky left-0 z-20 min-w-[180px] bg-card border-r">
                  Fluxo de caixa
                </th>
                <th className="text-right font-medium px-3 py-2 min-w-[110px] border-l">Dívida</th>
                {forecast.days.map((d) => (
                  <th
                    key={d.date}
                    className={cn(
                      'text-right font-medium px-3 py-2 min-w-[110px] whitespace-nowrap',
                      d.isToday && 'text-primary',
                      d.negativeAccountIds.length > 0 && 'text-destructive',
                    )}
                  >
                    {diaCurto(d.date)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {linhas.map((linha) => (
                <tr
                  key={linha.chave}
                  className={cn(
                    'border-t',
                    linha.tipo === 'saldo' && 'bg-muted/20 font-semibold',
                    (linha.tipo === 'entrada' || linha.tipo === 'saidaTotal') && 'font-semibold',
                    linha.tipo === 'categoria' && 'text-muted-foreground',
                  )}
                >
                  <td
                    className={cn(
                      // ⚠️ Fundo OPACO obrigatório numa coluna fixa. Com
                      // `bg-muted/20` (20% de opacidade) o conteúdo que rola
                      // passava POR BAIXO e aparecia sobreposto ao rótulo —
                      // "0Saldo inicial2,00". A distinção das linhas de saldo
                      // fica no peso da fonte e na borda da coluna congelada.
                      'px-3 py-2 sticky left-0 z-20 whitespace-nowrap bg-card border-r',
                      linha.tipo === 'saldo' && 'font-semibold',
                      linha.tipo === 'categoria' && 'pl-6 text-xs',
                    )}
                  >
                    <span className="flex items-center gap-2">
                      {linha.tipo === 'categoria' && linha.Icone && (
                        <span
                          className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full"
                          style={{ backgroundColor: linha.cor || '#64748b' }}
                        >
                          <linha.Icone className="h-3 w-3 text-white" />
                        </span>
                      )}
                      <span>{linha.rotulo}</span>
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums border-l">
                    {linha.divida
                      ? <span className={linha.tipo === 'entrada' ? 'text-warning' : 'text-destructive'}>{fmt(linha.divida)}</span>
                      : <span className="text-muted-foreground/40">—</span>}
                  </td>
                  {linha.porDia.map((valor, i) => {
                    const dia = forecast.days[i];
                    // Saldo é cálculo, não lançamento: não há o que abrir.
                    const abrivel = valor !== 0 && linha.tipo !== 'saldo';
                    return (
                      <td
                        key={dia.date}
                        className={cn(
                          'whitespace-nowrap px-3 py-2 text-right tabular-nums',
                          linha.tipo === 'entrada' && valor > 0 && 'text-success',
                          linha.tipo === 'saidaTotal' && valor > 0 && 'text-destructive',
                          linha.tipo === 'saldo' && valor < 0 && 'text-destructive',
                          abrivel && 'cursor-pointer hover:bg-muted/40 transition-colors',
                        )}
                        onClick={abrivel
                          ? () => setCelula({
                              data: dia.date,
                              categoria: linha.tipo === 'categoria' ? linha.rotulo : null,
                            })
                          : undefined}
                        role={abrivel ? 'button' : undefined}
                        tabIndex={abrivel ? 0 : undefined}
                        onKeyDown={abrivel
                          ? (e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                setCelula({
                                  data: dia.date,
                                  categoria: linha.tipo === 'categoria' ? linha.rotulo : null,
                                });
                              }
                            }
                          : undefined}
                      >
                        {valor === 0 ? <span className="text-muted-foreground/30">—</span> : fmt(valor)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Quebra por conta — obrigatória: é ela que mostra a conta que estoura */}
      <div className="rounded-lg border overflow-hidden">
        <div className="px-3 py-2 bg-muted/40 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Saldo por conta
        </div>
        <div className="max-h-[70vh] overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-30 bg-card shadow-[0_1px_0_hsl(var(--border))]">
              <tr className="bg-muted/20">
                <th className="text-left font-medium px-3 py-2 sticky left-0 z-20 min-w-[180px] bg-card border-r">Conta</th>
                {forecast.days.map((d) => (
                  <th key={d.date} className="text-right font-medium px-3 py-2 min-w-[110px] whitespace-nowrap">
                    {diaCurto(d.date)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {forecast.startingBalanceByAccount.map((conta) => (
                <tr key={conta.accountId} className="border-t">
                  <td className="px-3 py-2 sticky left-0 z-20 whitespace-nowrap bg-card border-r">
                    {conta.name}
                    {conta.accountId === UNASSIGNED_ACCOUNT_ID && (
                      <span className="ml-1 text-[11px] text-muted-foreground">(sem conta)</span>
                    )}
                  </td>
                  {forecast.days.map((dia) => {
                    const linha = dia.byAccount.find((c) => c.accountId === conta.accountId);
                    const valor = linha?.closing ?? 0;
                    return (
                      <td
                        key={dia.date}
                        className={cn(
                          'whitespace-nowrap px-3 py-2 text-right tabular-nums',
                          valor < 0 && conta.accountId !== UNASSIGNED_ACCOUNT_ID && 'text-destructive font-semibold',
                        )}
                      >
                        {fmt(valor)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Dinheiro guardado fora do caixa. Precisa aparecer: a tela de cadastro
          promete que "o saldo continua guardado e aparece separado". */}
      {forecast.outOfPerimeter.length > 0 && (
        <div className="rounded-lg border overflow-hidden">
          <div className="px-3 py-2 bg-muted/40 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Guardado fora do caixa
          </div>
          <div className="divide-y">
            {forecast.outOfPerimeter.map((c) => (
              <div key={c.accountId} className="px-3 py-2 flex items-center justify-between text-sm">
                <span>{c.name}</span>
                <span className="tabular-nums font-medium">{fmt(c.balance)}</span>
              </div>
            ))}
          </div>
          <p className="px-3 py-2 text-xs text-muted-foreground border-t">
            Este dinheiro é da empresa, mas não entra na conta dos próximos dias. Para usá-lo, transfira
            para uma conta do caixa.
          </p>
        </div>
      )}

      {/* Evolução do saldo — o gráfico do painel do BPO. A linha do zero fica
          marcada: é ela que diz, de relance, se o caixa fura no horizonte. */}
      <div className="rounded-lg border p-3">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-2">
          Evolução do saldo
        </p>
        <ResponsiveContainer width="100%" height={isMobile ? 180 : 240}>
          <AreaChart data={forecast.days.map((d) => ({ dia: diaCurto(d.date), saldo: d.closing }))}>
            <defs>
              <linearGradient id="fluxo-saldo-gradiente" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.6} />
                <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.04} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="dia" tick={{ fontSize: isMobile ? 10 : 11 }} />
            <YAxis width={isMobile ? 56 : 80} tick={{ fontSize: isMobile ? 10 : 11 }} tickFormatter={(v: number) => fmt(v)} />
            <Tooltip formatter={(v: number) => fmt(v)} labelFormatter={(l) => `Dia ${l}`} />
            <ReferenceLine y={0} stroke="hsl(var(--destructive))" strokeDasharray="4 4" />
            <Area type="monotone" dataKey="saldo" name="Saldo" stroke="hsl(var(--primary))" strokeWidth={2} fill="url(#fluxo-saldo-gradiente)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Detalhe da dívida, com há quantos dias arrasta */}
      {forecast.openingDebt.events.length > 0 && (
        <div className="rounded-lg border overflow-hidden">
          <div className="px-3 py-2 bg-muted/40 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            O que já venceu e não foi baixado
          </div>
          <div className="divide-y max-h-64 overflow-y-auto">
            {forecast.openingDebt.events.map((ev) => (
              <div key={ev.id} className="px-3 py-2 flex items-center justify-between gap-3 text-sm">
                <div className="min-w-0">
                  <p className="truncate">{ev.label}</p>
                  <p className="text-xs text-muted-foreground">
                    Venceu em {diaCurto(ev.dueDate)} · {ev.daysLate} {ev.daysLate === 1 ? 'dia' : 'dias'} em atraso
                  </p>
                </div>
                <span className={cn('tabular-nums font-medium shrink-0', ev.direction === 'in' ? 'text-warning' : 'text-destructive')}>
                  {fmt(ev.amountCents / 100)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {forecast.warnings.length > 0 && (
        <div className="space-y-1">
          {forecast.warnings.map((w, i) => (
            <p key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
              <Info className="h-3 w-3 shrink-0 mt-0.5" />
              {w}
            </p>
          ))}
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Previsão otimista: considera que tudo será pago e recebido no vencimento. O que já venceu e não foi
        baixado aparece na coluna Dívida e não é descontado do saldo.
      </p>

      <ResponsiveModal
        open={!!celula}
        onOpenChange={(aberto) => { if (!aberto) setCelula(null); }}
        title={celula ? `${celula.categoria ?? 'Movimentações'} · ${diaCurto(celula.data)}` : ''}
        description={detalhe ? `${detalhe.itens.length} ${detalhe.itens.length === 1 ? 'lançamento' : 'lançamentos'}` : undefined}
      >
        {detalhe && (
          <div className="space-y-2">
            <div className="divide-y rounded-md border max-h-80 overflow-y-auto">
              {detalhe.itens.map((ev) => (
                <div key={ev.id} className="px-3 py-2 flex items-start justify-between gap-3 text-sm">
                  <div className="min-w-0">
                    <p className="truncate">{ev.label}</p>
                    <p className="text-xs text-muted-foreground">
                      {ev.categoryName ?? 'Sem categoria'}
                      {ev.isEstimate && ' · valor estimado'}
                    </p>
                  </div>
                  <span className={cn(
                    'tabular-nums font-medium shrink-0',
                    ev.direction === 'in' ? 'text-success' : 'text-destructive',
                  )}>
                    {ev.direction === 'in' ? '+' : '-'} {fmt(ev.amountCents / 100)}
                  </span>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between px-1 text-sm font-semibold">
              <span>Total do dia</span>
              <span className="tabular-nums">{fmt(Math.abs(detalhe.total))}</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Para editar ou dar baixa, abra o lançamento em Contas a Pagar/Receber.
            </p>
          </div>
        )}
      </ResponsiveModal>
    </div>
  );
}
