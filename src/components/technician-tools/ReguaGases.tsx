import { useCallback, useMemo, useRef, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Label } from '@/components/ui/label';
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
      <div className="flex w-[8.5rem] items-center justify-between px-1.5 lg:w-[9.5rem]">
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

      {/* Trilho da régua — o container externo só desenha a moldura; a área útil
          (medição do arrasto + ticks + cursor) vive na camada recuada abaixo,
          pra que marcas e toque fiquem perfeitamente alinhados e nada vaze.
          Mais alta no desktop pra dar respiro. */}
      <div className="relative h-[60vh] max-h-[460px] min-h-[320px] w-[8.5rem] rounded-2xl border border-border bg-muted/40 lg:h-[68vh] lg:max-h-[600px] lg:min-h-[440px] lg:w-[9.5rem]">
        {/* Camada recuada (12px topo/base) — referência do arrasto e dos ticks */}
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
          className="absolute inset-x-0 top-3 bottom-3 cursor-grab touch-none active:cursor-grabbing"
        >
          {/* Trilho central */}
          <div className="absolute left-1/2 top-0 bottom-0 w-1.5 -translate-x-1/2 rounded-full bg-border" />

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
      </div>

      <div className="text-[10px] text-muted-foreground">arraste ↑ ↓</div>
    </div>
  );
}

/**
 * Régua unificada (mobile E desktop): régua de escala dupla (P × °C) +
 * toggles de Fórmula e Unidade + select de Gás (com label) + leituras ao vivo.
 * Cobre os dois sentidos (a régua mostra P e T juntas), então não há toggle
 * "por temperatura / por pressão". No desktop ganha mais respiro (régua mais
 * alta, painel lateral maior e leituras maiores).
 */
function ReguaUnificada({
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
    <div className="mx-auto flex max-w-2xl items-center justify-center gap-3 lg:gap-6">
      <ReguaDupla
        tempClamped={tempClamped}
        setTemp={setTemp}
        refrigId={refrigId}
        curva={curva}
        unidade={unidade}
      />

      <div className="flex w-40 flex-col items-stretch gap-3 lg:w-56 lg:gap-4">
        {/* Fórmula — alavanca centralizada abaixo do label */}
        <div className="flex flex-col items-center gap-1.5">
          <Label className="text-xs font-semibold text-muted-foreground">Fórmula</Label>
          <LabeledSwitch
            value={formula}
            onChange={setFormula}
            off={{ value: 'dew', label: 'Dew' }}
            on={{ value: 'bubble', label: 'Bubble' }}
            aria-label="Fórmula da curva"
          />
        </div>

        {/* Gás */}
        <div className="space-y-1">
          <Label className="text-xs font-semibold text-muted-foreground">Gás</Label>
          <Select value={refrigId} onValueChange={setRefrigId}>
            <SelectTrigger className="h-11 text-sm font-semibold lg:h-12 lg:text-base">
              <SelectValue placeholder="Gás" />
            </SelectTrigger>
            <SelectContent>
              {REFRIGERANTES.map((r) => (
                <SelectItem key={r.id} value={r.id}>
                  <span className="flex items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full border border-black/20 dark:border-white/25"
                      style={{ backgroundColor: r.cor }}
                    />
                    {r.nome}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Unidade — alavanca centralizada abaixo do label */}
        <div className="flex flex-col items-center gap-1.5">
          <Label className="text-xs font-semibold text-muted-foreground">Unidade</Label>
          <LabeledSwitch
            value={unidade}
            onChange={setUnidade}
            off={{ value: 'psi', label: 'psi' }}
            on={{ value: 'bar', label: 'bar' }}
            aria-label="Unidade de pressão"
          />
        </div>

        {/* Leituras ao vivo */}
        <div className="rounded-xl border border-border bg-card p-3 text-center lg:p-4">
          <div className="leading-tight">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground lg:text-xs">
              {rotuloUnidade(unidade)}
            </p>
            {pressao !== null ? (
              <p className="text-3xl font-bold tabular-nums text-primary lg:text-4xl">
                {formatarPressao(pressao, unidade)}
              </p>
            ) : (
              <p className="py-1 text-sm text-muted-foreground">fora da faixa</p>
            )}
          </div>
          <div className="mt-2 border-t border-border pt-2 leading-tight">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground lg:text-xs">
              °C
            </p>
            <p className="text-3xl font-bold tabular-nums text-primary lg:text-4xl">{tempClamped}</p>
          </div>
          {refrig?.temGlide && (
            <span className="mt-2 inline-block text-[11px] font-medium text-amber-600 dark:text-amber-400 lg:text-xs">
              {formula === 'dew' ? 'vapor (dew)' : 'líquido (bubble)'}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export function ReguaGases() {
  const [unidade, setUnidade] = useState<UnidadePressao>('psi');

  return (
    <div className="space-y-4 pb-4">
      <div>
        <h2 className="text-base font-semibold tracking-tight md:text-xl">Régua de Gases</h2>
        <p className="text-sm text-muted-foreground md:text-base">
          Pressão de saturação dos refrigerantes por temperatura.
        </p>
      </div>

      {/* Régua de escala dupla unificada (mobile + desktop) */}
      <ReguaUnificada unidade={unidade} setUnidade={setUnidade} />

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
