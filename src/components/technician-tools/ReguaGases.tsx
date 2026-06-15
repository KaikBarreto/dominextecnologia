import { useCallback, useMemo, useRef, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { LabeledSwitch } from '@/components/ui/labeled-switch';
import { cn } from '@/lib/utils';
import {
  REFRIGERANTES,
  tempParaPressao,
  pressaoParaTempSat,
  formatarTemp,
  formatarPressao,
  getRefrigerante,
  type UnidadePressao,
  type Curva,
} from '@/lib/refrigerantes';

/** Converte string crua de input numérico em number, com default seguro. */
function num(str: string, def = NaN): number {
  if (str.trim() === '') return def;
  const parsed = Number(str.replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : def;
}

const TEMP_MIN = -40;
const TEMP_MAX = 60;

/** Fórmula escolhida na UI → curva da tabela. */
type Formula = 'bubble' | 'dew';

/** Curto rótulo da unidade gauge na régua. */
function rotuloUnidade(u: UnidadePressao): string {
  return u === 'bar' ? 'BAR (g)' : 'PSI (g)';
}

/** Marcas (ticks) da régua vertical, de TEMP_MAX (topo) a TEMP_MIN (base). */
const TICKS_REGUA = (() => {
  const arr: number[] = [];
  for (let t = TEMP_MAX; t >= TEMP_MIN; t -= 5) arr.push(t);
  return arr;
})();

/**
 * Régua VERTICAL arrastável de ESCALA DUPLA (mobile): pressão (esquerda) e
 * temperatura (direita) com ticks alinhados. A coluna de pressão é recalculada
 * por gás + fórmula + unidade. Mapeia a posição Y do toque para temperatura:
 * topo = TEMP_MAX (mais quente), base = TEMP_MIN (mais frio).
 */
function ReguaDupla({
  tempClamped,
  setTemp,
  refrigId,
  curva,
  unidade,
}: {
  tempClamped: number;
  setTemp: (t: number) => void;
  refrigId: string;
  curva: Curva;
  unidade: UnidadePressao;
}) {
  const trilhoRef = useRef<HTMLDivElement>(null);
  const arrastando = useRef(false);

  // Posição do cursor em % a partir do topo (0% = topo = TEMP_MAX).
  const pctTopo = ((TEMP_MAX - tempClamped) / (TEMP_MAX - TEMP_MIN)) * 100;

  const atualizarPorY = useCallback(
    (clientY: number) => {
      const el = trilhoRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const frac = Math.min(1, Math.max(0, (clientY - rect.top) / rect.height));
      // topo (frac 0) = TEMP_MAX; base (frac 1) = TEMP_MIN
      const t = TEMP_MAX - frac * (TEMP_MAX - TEMP_MIN);
      setTemp(Math.round(t));
    },
    [setTemp],
  );

  const onPointerDown = (e: React.PointerEvent) => {
    arrastando.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    atualizarPorY(e.clientY);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!arrastando.current) return;
    atualizarPorY(e.clientY);
  };
  const onPointerUp = (e: React.PointerEvent) => {
    arrastando.current = false;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };

  return (
    <div className="flex flex-col items-center gap-2 select-none">
      {/* Rótulos das escalas (espelha as 3 colunas das linhas de marca) */}
      <div className="flex w-[8.5rem] items-center justify-between px-1.5">
        {/* Cabeçalho da PRESSÃO (esquerda) */}
        <span className="w-12 text-right text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          {rotuloUnidade(unidade)}
        </span>
        {/* Espaçador no lugar da marca central */}
        <span className="w-5" />
        {/* Cabeçalho da TEMPERATURA (direita) */}
        <span className="w-12 text-left text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          °C
        </span>
      </div>

      {/* Trilho da régua */}
      <div
        ref={trilhoRef}
        role="slider"
        aria-label="Selecionar ponto da régua"
        aria-valuemin={TEMP_MIN}
        aria-valuemax={TEMP_MAX}
        aria-valuenow={tempClamped}
        tabIndex={0}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onKeyDown={(e) => {
          if (e.key === 'ArrowUp') {
            e.preventDefault();
            setTemp(Math.min(TEMP_MAX, tempClamped + 1));
          } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            setTemp(Math.max(TEMP_MIN, tempClamped - 1));
          }
        }}
        className="relative h-[60vh] max-h-[460px] min-h-[320px] w-[8.5rem] cursor-grab touch-none rounded-2xl border border-border bg-muted/40 active:cursor-grabbing"
      >
        {/* Trilho central */}
        <div className="absolute left-1/2 top-3 bottom-3 w-1.5 -translate-x-1/2 rounded-full bg-border" />

        {/* Marcas e rótulos das DUAS escalas */}
        {TICKS_REGUA.map((t) => {
          const top = ((TEMP_MAX - t) / (TEMP_MAX - TEMP_MIN)) * 100;
          const rotulado = t % 10 === 0;
          const p = rotulado ? tempParaPressao(refrigId, t, unidade, curva) : null;
          return (
            <div
              key={t}
              className="pointer-events-none absolute left-0 right-0 flex items-center justify-between px-1.5"
              style={{ top: `${top}%`, transform: 'translateY(-50%)' }}
            >
              {/* Escala de PRESSÃO (esquerda) */}
              <span className="w-12 text-right text-[10px] font-medium tabular-nums text-muted-foreground">
                {rotulado && p !== null ? formatarPressao(p, unidade) : ''}
              </span>
              {/* Marca central */}
              <span
                className={cn(
                  'rounded-full bg-border',
                  rotulado ? 'h-0.5 w-5' : 'h-0.5 w-3',
                )}
              />
              {/* Escala de TEMPERATURA (direita) */}
              <span className="w-12 text-left text-[10px] font-medium tabular-nums text-muted-foreground">
                {rotulado ? t : ''}
              </span>
            </div>
          );
        })}

        {/* Cursor / indicador arrastável */}
        <div
          className="pointer-events-none absolute left-2 right-2 z-10 flex h-7 -translate-y-1/2 items-center justify-center rounded-full border-2 border-primary bg-background/90 shadow-md"
          style={{ top: `${pctTopo}%` }}
        >
          <span className="h-1 w-10 rounded-full bg-primary" />
        </div>
      </div>

      <div className="text-[10px] text-muted-foreground">arraste ↑ ↓</div>
    </div>
  );
}

/**
 * MOBILE unificado: régua de escala dupla (P × °C) + selects de Fórmula e Gás
 * (com label) + leituras ao vivo. Cobre os dois sentidos (a régua mostra P e T
 * juntas), então não há toggle "por temperatura / por pressão" no mobile.
 */
function ReguaMobile({
  unidade,
  setUnidade,
}: {
  unidade: UnidadePressao;
  setUnidade: (u: UnidadePressao) => void;
}) {
  const [tempStr, setTempStr] = useState('5');
  const [refrigId, setRefrigId] = useState<string>('R-410A');
  const [formula, setFormula] = useState<Formula>('dew');

  const temp = num(tempStr, 5);
  const tempClamped = Math.min(TEMP_MAX, Math.max(TEMP_MIN, Number.isFinite(temp) ? temp : 5));
  const setTemp = useCallback((t: number) => setTempStr(String(t)), []);

  // A fórmula define a curva; gases sem glide caem na curva única no helper.
  const curva: Curva = formula;

  const pressao = useMemo(
    () => tempParaPressao(refrigId, tempClamped, unidade, curva),
    [refrigId, tempClamped, unidade, curva],
  );

  const refrig = getRefrigerante(refrigId);

  return (
    <div className="flex items-center justify-center gap-3 lg:hidden">
      <ReguaDupla
        tempClamped={tempClamped}
        setTemp={setTemp}
        refrigId={refrigId}
        curva={curva}
        unidade={unidade}
      />

      <div className="flex w-40 flex-col items-stretch gap-3">
        {/* Fórmula */}
        <div className="space-y-1">
          <Label className="text-xs font-semibold text-muted-foreground">Fórmula</Label>
          <Select value={formula} onValueChange={(v) => setFormula(v as Formula)}>
            <SelectTrigger className="h-11 text-sm font-semibold">
              <SelectValue placeholder="Fórmula" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="dew">Dew (vapor)</SelectItem>
              <SelectItem value="bubble">Bubble (líquido)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Gás */}
        <div className="space-y-1">
          <Label className="text-xs font-semibold text-muted-foreground">Gás</Label>
          <Select value={refrigId} onValueChange={setRefrigId}>
            <SelectTrigger className="h-11 text-sm font-semibold">
              <SelectValue placeholder="Gás" />
            </SelectTrigger>
            <SelectContent>
              {REFRIGERANTES.map((r) => (
                <SelectItem key={r.id} value={r.id}>
                  {r.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Unidade */}
        <div className="space-y-1">
          <Label className="text-xs font-semibold text-muted-foreground">Unidade</Label>
          <LabeledSwitch
            value={unidade}
            onChange={setUnidade}
            off={{ value: 'bar', label: 'bar' }}
            on={{ value: 'psi', label: 'psi' }}
            aria-label="Unidade de pressão"
          />
        </div>

        {/* Leituras ao vivo */}
        <div className="rounded-xl border border-border bg-card p-3 text-center">
          <div className="leading-tight">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              {rotuloUnidade(unidade)}
            </p>
            {pressao !== null ? (
              <p className="text-3xl font-bold tabular-nums text-primary">
                {formatarPressao(pressao, unidade)}
              </p>
            ) : (
              <p className="py-1 text-sm text-muted-foreground">fora da faixa</p>
            )}
          </div>
          <div className="mt-2 border-t border-border pt-2 leading-tight">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              °C
            </p>
            <p className="text-3xl font-bold tabular-nums text-primary">{tempClamped}</p>
          </div>
          {refrig?.temGlide && (
            <span className="mt-2 inline-block text-[11px] font-medium text-amber-600 dark:text-amber-400">
              {formula === 'dew' ? 'vapor (dew)' : 'líquido (bubble)'}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

/** DESKTOP — modo principal: escolhe temperatura, vê a pressão de saturação de todos os gases. */
function ModoTemperaturaDesktop({ unidade, curva }: { unidade: UnidadePressao; curva: Curva }) {
  const [tempStr, setTempStr] = useState('5');
  const temp = num(tempStr, 5);
  const tempClamped = Math.min(TEMP_MAX, Math.max(TEMP_MIN, Number.isFinite(temp) ? temp : 5));

  const linhas = useMemo(
    () =>
      REFRIGERANTES.map((r) => {
        const p = tempParaPressao(r.id, tempClamped, unidade, curva);
        return { id: r.id, nome: r.nome, pressao: p, temGlide: r.temGlide };
      }),
    [tempClamped, unidade, curva],
  );

  return (
    <div className="space-y-4">
      {/* Controle de temperatura: slider (régua) + input numérico */}
      <div className="rounded-lg border border-border bg-card p-4 space-y-4">
        <div className="flex items-end justify-between gap-3">
          <Label className="text-base text-muted-foreground md:text-lg">Temperatura</Label>
          <div className="flex items-center gap-2">
            <Input
              type="text"
              inputMode="numeric"
              value={tempStr}
              onChange={(e) => setTempStr(e.target.value)}
              className="h-12 w-20 text-center text-lg font-semibold"
              aria-label="Temperatura em graus Celsius"
            />
            <span className="text-lg font-semibold text-muted-foreground">°C</span>
          </div>
        </div>

        <Slider
          min={TEMP_MIN}
          max={TEMP_MAX}
          step={1}
          value={[tempClamped]}
          onValueChange={(v) => setTempStr(String(v[0]))}
          aria-label="Selecionar temperatura"
        />
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>{TEMP_MIN} °C</span>
          <span>{TEMP_MAX} °C</span>
        </div>
      </div>

      {/* Tabela multi-gás ao vivo */}
      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border bg-muted/40 px-4 py-2.5">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Refrigerante
          </span>
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Pressão ({unidade})
          </span>
        </div>
        <ul className="divide-y divide-border">
          {linhas.map((l) => (
            <li key={l.id} className="flex items-center justify-between gap-3 px-4 py-3.5">
              <div className="min-w-0">
                <span className="text-base font-medium text-foreground">{l.nome}</span>
                {l.temGlide && (
                  <span className="ml-2 text-[11px] font-medium text-amber-600 dark:text-amber-400">
                    glide
                  </span>
                )}
              </div>
              {l.pressao !== null ? (
                <span className="shrink-0 text-2xl font-bold leading-none text-primary tabular-nums sm:text-3xl">
                  {formatarPressao(l.pressao, unidade)}
                  <span className="ml-1 text-sm font-semibold text-muted-foreground sm:text-base">
                    {unidade}
                  </span>
                </span>
              ) : (
                <span className="shrink-0 text-sm text-muted-foreground">fora da faixa</span>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/** DESKTOP — modo inverso: escolhe refrigerante + digita pressão, vê a temperatura de saturação. */
function ModoPressaoDesktop({ unidade, curva }: { unidade: UnidadePressao; curva: Curva }) {
  const [refrigId, setRefrigId] = useState<string>('R-410A');
  const [pStr, setPStr] = useState('');

  const refrig = getRefrigerante(refrigId);

  const temp = useMemo(() => {
    const p = num(pStr);
    if (!Number.isFinite(p) || !refrig) return null;
    return pressaoParaTempSat(refrigId, p, unidade, curva);
  }, [refrigId, pStr, unidade, refrig, curva]);

  const foraDaFaixa = Number.isFinite(num(pStr)) && temp === null;

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-4">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label className="text-base text-muted-foreground md:text-lg">Refrigerante</Label>
          <Select value={refrigId} onValueChange={setRefrigId}>
            <SelectTrigger className="h-14 text-lg">
              <SelectValue placeholder="Refrigerante" />
            </SelectTrigger>
            <SelectContent>
              {REFRIGERANTES.map((r) => (
                <SelectItem key={r.id} value={r.id}>
                  {r.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-base text-muted-foreground md:text-lg">Pressão ({unidade})</Label>
          <Input
            type="text"
            inputMode="decimal"
            placeholder={unidade === 'bar' ? 'Ex: 8,3' : 'Ex: 120'}
            value={pStr}
            onChange={(e) => setPStr(e.target.value)}
            className="h-14 text-lg"
          />
        </div>
      </div>

      <div className="rounded-lg border border-border bg-background p-4 text-center">
        {temp !== null ? (
          <p className="text-5xl font-bold leading-none text-primary sm:text-6xl">
            {formatarTemp(temp)}
            <span className="ml-1.5 text-2xl font-semibold sm:text-3xl">°C</span>
          </p>
        ) : foraDaFaixa ? (
          <p className="text-sm text-amber-600 dark:text-amber-400">
            Pressão fora da faixa da tabela para este refrigerante. Confira a leitura.
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            Informe a pressão para ver a temperatura de saturação.
          </p>
        )}
      </div>
    </div>
  );
}

type ModoDesktop = 'temperatura' | 'pressao';

export function ReguaGases() {
  const [unidade, setUnidade] = useState<UnidadePressao>('bar');
  const [formula, setFormula] = useState<Formula>('dew');
  const [modoDesktop, setModoDesktop] = useState<ModoDesktop>('temperatura');

  const curva: Curva = formula;

  return (
    <div className="space-y-4 pb-4">
      <div>
        <h2 className="text-base font-semibold tracking-tight md:text-xl">Régua de Gases</h2>
        <p className="text-sm text-muted-foreground md:text-base">
          Pressão de saturação dos refrigerantes por temperatura.
        </p>
      </div>

      {/* ===== MOBILE: régua de escala dupla unificada ===== */}
      <ReguaMobile unidade={unidade} setUnidade={setUnidade} />

      {/* ===== DESKTOP: controles + slider/tabela ===== */}
      <div className="hidden space-y-4 lg:block">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            {/* Toggle de modo */}
            <div className="inline-flex rounded-lg border border-border bg-muted/40 p-1">
              {(
                [
                  { v: 'temperatura', l: 'Por temperatura' },
                  { v: 'pressao', l: 'Por pressão' },
                ] as const
              ).map((m) => (
                <button
                  key={m.v}
                  type="button"
                  onClick={() => setModoDesktop(m.v)}
                  className={cn(
                    'rounded-md px-4 py-2 text-sm font-semibold transition-colors',
                    modoDesktop === m.v
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {m.l}
                </button>
              ))}
            </div>

            {/* Fórmula (consistência com o mobile) */}
            <div className="flex items-center gap-2">
              <Label className="text-sm font-semibold text-muted-foreground">Fórmula</Label>
              <Select value={formula} onValueChange={(v) => setFormula(v as Formula)}>
                <SelectTrigger className="h-10 w-40 text-sm font-semibold">
                  <SelectValue placeholder="Fórmula" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="dew">Dew (vapor)</SelectItem>
                  <SelectItem value="bubble">Bubble (líquido)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <LabeledSwitch
            value={unidade}
            onChange={setUnidade}
            off={{ value: 'bar', label: 'bar' }}
            on={{ value: 'psi', label: 'psi' }}
            aria-label="Unidade de pressão"
          />
        </div>

        {modoDesktop === 'temperatura' ? (
          <ModoTemperaturaDesktop unidade={unidade} curva={curva} />
        ) : (
          <ModoPressaoDesktop unidade={unidade} curva={curva} />
        )}
      </div>

      {/* Alerta sutil */}
      <div className="flex gap-2.5 rounded-lg border border-border bg-muted/40 p-3 text-muted-foreground">
        <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-amber-500" />
        <p className="text-xs leading-relaxed">
          <span className="font-semibold text-foreground">Atenção: </span>
          estes valores são sempre uma estimativa de referência e não devem ser usados
          isoladamente. Sempre confira o manual do fabricante do equipamento antes de tomar
          decisões de carga ou diagnóstico. Só o R-404A tem glide (curvas bubble/dew diferentes);
          nos demais a curva é única.
        </p>
      </div>
    </div>
  );
}
