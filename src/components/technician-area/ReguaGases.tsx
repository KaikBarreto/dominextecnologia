import { useCallback, useMemo, useRef } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { usePersistedState } from '@/hooks/usePersistedState';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectSectionLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { LabeledSwitch } from '@/components/ui/labeled-switch';
import { RefrigeranteOption } from '@/components/technician-area/RefrigeranteOption';
import { ToolDisclaimer } from './ToolDisclaimer';
import { cn } from '@/lib/utils';
import {
  REFRIGERANTES,
  tempParaPressao,
  pressaoParaTempSat,
  sugerirOutraUnidade,
  formatarPressao,
  getRefrigerante,
  type Refrigerante,
  type UnidadePressao,
  type Curva,
} from '@/lib/refrigerantes';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';

type TPtChart = (typeof MESSAGES)['pt-br']['app']['technicianTools']['ptChart'];

/** Converte string crua de input numérico em number, com default seguro. */
function num(str: string, def = NaN): number {
  if (str.trim() === '') return def;
  const parsed = Number(str.replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : def;
}

const TEMP_MIN = -40;
const TEMP_MAX = 60;

/** Blends com glide (curvas bubble/dew diferentes), derivados da fonte única. */
const GASES_COM_GLIDE = REFRIGERANTES.filter((r) => r.temGlide)
  .map((r) => r.nome)
  .join(', ');

/** Fórmula escolhida na UI → curva da tabela. */
type Formula = 'bubble' | 'dew';

/**
 * Um gás é MISTURA (blend) se o número for da série 400 ou 500 (id começa por
 * "R-4" ou "R-5"); senão é PURO (uma molécula só, inclui isômeros R-134a/R-600a).
 * Regra por série é a fonte primária e cobre todo o catálogo.
 */
function ehMistura(r: Refrigerante): boolean {
  return /^R-?[45]/i.test(r.id);
}

/** Seções rotuladas da listagem de gases: Puros primeiro, depois Misturas. */
function secoesPurosEMisturas(
  sections: TPtChart['sections'],
): { label: string; refrigerantes: Refrigerante[] }[] {
  const puros = REFRIGERANTES.filter((r) => !ehMistura(r));
  const misturas = REFRIGERANTES.filter((r) => ehMistura(r));
  return [
    { label: sections.pure, refrigerantes: puros },
    { label: sections.blends, refrigerantes: misturas },
  ].filter((s) => s.refrigerantes.length > 0);
}

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
  dragHint,
  ariaSlider,
}: {
  tempClamped: number;
  setTemp: (t: number) => void;
  refrigId: string;
  curva: Curva;
  unidade: UnidadePressao;
  dragHint: string;
  ariaSlider: string;
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
          aria-label={ariaSlider}
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

      <div className="text-[10px] text-muted-foreground">{dragHint}</div>
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
  t,
}: {
  unidade: UnidadePressao;
  setUnidade: (u: UnidadePressao) => void;
  t: TPtChart;
}) {
  const [tempStr, setTempStr] = usePersistedState('tt:state:regua-gases:tempStr', '5');
  const [pressaoStr, setPressaoStr] = usePersistedState('tt:state:regua-gases:pressaoStr', '');
  const [refrigId, setRefrigId] = usePersistedState<string>(
    'tt:state:regua-gases:refrigId',
    'R-410A',
  );
  const [formula, setFormula] = usePersistedState<Formula>('tt:state:regua-gases:formula', 'dew');
  // Qual lado o técnico mexeu por último — é a fonte de verdade do instante.
  // O outro lado é sempre derivado. Evita loop de recálculo.
  const [ultimoEditado, setUltimoEditado] = usePersistedState<'temp' | 'pressao'>(
    'tt:state:regua-gases:ultimoEditado',
    'temp',
  );

  const refrig = getRefrigerante(refrigId);

  // Fórmula efetiva: só gases com glide têm curvas bubble/dew distintas.
  // Pros demais, travamos em 'dew' (sem poluir o estado persistido, que volta
  // ao escolher um gás com glide de novo).
  const formulaEfetiva: Formula = refrig?.temGlide ? formula : 'dew';

  // A fórmula define a curva; gases sem glide caem na curva única no helper.
  const curva: Curva = formulaEfetiva;

  // Temperatura RESOLVIDA: posiciona a régua e alimenta o cálculo da pressão.
  // Quando a fonte é a pressão, derivamos a temperatura pela inversa.
  const pressaoDigitada = num(pressaoStr, NaN);
  const tempDaPressao = useMemo(
    () =>
      ultimoEditado === 'pressao'
        ? pressaoParaTempSat(refrigId, pressaoDigitada, unidade, curva)
        : null,
    [ultimoEditado, refrigId, pressaoDigitada, unidade, curva],
  );

  // Temperatura "crua" conforme a fonte ativa.
  const tempResolvida =
    ultimoEditado === 'pressao'
      ? tempDaPressao // pode ser null se pressão fora da faixa
      : num(tempStr, 5);

  // Posição da régua: temperatura resolvida, com clamp. Se a fonte é pressão
  // e ela está fora da faixa (tempResolvida === null), mantém a régua no último
  // valor numérico válido conhecido (a temperatura digitada como fallback visual).
  const tempParaRegua = tempResolvida ?? num(tempStr, 5);
  const tempClamped = Math.min(
    TEMP_MAX,
    Math.max(TEMP_MIN, Number.isFinite(tempParaRegua) ? tempParaRegua : 5),
  );

  // Editar a temperatura (input OU arrasto/teclado da régua) torna a TEMP a fonte.
  const setTemp = useCallback(
    (t: number) => {
      setUltimoEditado('temp');
      setTempStr(String(t));
    },
    [setTempStr, setUltimoEditado],
  );

  // PRESSÃO exibida: ecoa o que foi digitado quando a fonte é a pressão;
  // senão, é derivada da temperatura resolvida.
  const pressao = useMemo(
    () =>
      ultimoEditado === 'pressao'
        ? Number.isFinite(pressaoDigitada)
          ? pressaoDigitada
          : null
        : tempParaPressao(refrigId, tempClamped, unidade, curva),
    [ultimoEditado, pressaoDigitada, refrigId, tempClamped, unidade, curva],
  );

  // °C exibida nas leituras: temperatura resolvida (inteira), ou null fora de faixa.
  const tempExibida =
    ultimoEditado === 'pressao'
      ? tempDaPressao !== null
        ? Math.round(tempDaPressao)
        : null
      : tempClamped;

  // Aviso de fora-de-faixa quando a fonte é a pressão e a inversa falhou.
  const pressaoForaFaixa =
    ultimoEditado === 'pressao' && Number.isFinite(pressaoDigitada) && tempDaPressao === null;
  const sugestao = pressaoForaFaixa
    ? sugerirOutraUnidade(refrigId, pressaoDigitada, unidade, curva)
    : null;

  // Valor mostrado no input de pressão: o que o técnico digitou tem prioridade
  // (fonte = pressão); quando a fonte é a temperatura, mostra a pressão derivada.
  const pressaoInputValue =
    ultimoEditado === 'pressao'
      ? pressaoStr
      : pressao !== null
        ? formatarPressao(pressao, unidade)
        : '';

  // Gases agrupados pro select em 2 seções rotuladas: Puros / Misturas (blends).
  const secoes = useMemo(() => secoesPurosEMisturas(t.sections), [t.sections]);

  return (
    <div className="mx-auto flex max-w-2xl items-center justify-center gap-3 lg:gap-6">
      <ReguaDupla
        tempClamped={tempClamped}
        setTemp={setTemp}
        refrigId={refrigId}
        curva={curva}
        unidade={unidade}
        dragHint={t.dragHint}
        ariaSlider={t.ariaSlider}
      />

      <div className="flex w-40 flex-col items-stretch gap-3 lg:w-56 lg:gap-4">
        {/* Fórmula — alavanca centralizada abaixo do label */}
        <div className="flex flex-col items-center gap-1.5">
          <Label className="text-xs font-semibold text-muted-foreground">{t.formulaLabel}</Label>
          <LabeledSwitch
            value={formulaEfetiva}
            onChange={setFormula}
            off={{ value: 'dew', label: 'Dew' }}
            on={{ value: 'bubble', label: 'Bubble' }}
            disabled={!refrig?.temGlide}
            aria-label={t.formulaLabel}
          />
          {!refrig?.temGlide && (
            <span className="text-[10px] font-medium text-muted-foreground">
              {t.singleCurve}
            </span>
          )}
        </div>

        {/* Gás */}
        <div className="space-y-1">
          <Label className="text-xs font-semibold text-muted-foreground">{t.gasLabel}</Label>
          <Select value={refrigId} onValueChange={setRefrigId}>
            <SelectTrigger className="h-11 text-sm font-semibold lg:h-12 lg:text-base">
              <SelectValue placeholder={t.gasLabel} />
            </SelectTrigger>
            <SelectContent>
              {secoes.map((sec) => (
                <SelectGroup key={sec.label}>
                  <SelectSectionLabel>{sec.label}</SelectSectionLabel>
                  {sec.refrigerantes.map((r) => (
                    <RefrigeranteOption key={r.id} refrig={r} />
                  ))}
                </SelectGroup>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Unidade — alavanca centralizada abaixo do label */}
        <div className="flex flex-col items-center gap-1.5">
          <Label className="text-xs font-semibold text-muted-foreground">{t.unitLabel}</Label>
          <LabeledSwitch
            value={unidade}
            onChange={setUnidade}
            off={{ value: 'psi', label: 'psi' }}
            on={{ value: 'bar', label: 'bar' }}
            aria-label={t.unitLabel}
          />
        </div>

        {/* Leituras ao vivo — ambos editáveis (bidirecional) */}
        <div className="rounded-xl border border-border bg-card p-3 lg:p-4">
          {/* PRESSÃO — editável */}
          <div className="leading-tight">
            <p className="text-center text-[10px] font-semibold uppercase tracking-wide text-muted-foreground lg:text-xs">
              {rotuloUnidade(unidade)}
            </p>
            <Input
              type="text"
              inputMode="decimal"
              value={pressaoInputValue}
              placeholder="—"
              aria-label={`Pressão em ${rotuloUnidade(unidade)}`}
              onChange={(e) => {
                setUltimoEditado('pressao');
                setPressaoStr(e.target.value);
              }}
              className="mt-0.5 h-auto border-0 bg-transparent p-0 text-center text-3xl font-bold tabular-nums text-primary shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 lg:text-4xl"
            />
          </div>
          {/* TEMPERATURA — editável */}
          <div className="mt-2 border-t border-border pt-2 leading-tight">
            <p className="text-center text-[10px] font-semibold uppercase tracking-wide text-muted-foreground lg:text-xs">
              °C
            </p>
            <Input
              type="text"
              inputMode="numeric"
              value={ultimoEditado === 'temp' ? tempStr : tempExibida !== null ? String(tempExibida) : ''}
              placeholder="—"
              aria-label="Temperatura em graus Celsius"
              onChange={(e) => {
                setUltimoEditado('temp');
                setTempStr(e.target.value);
              }}
              className="mt-0.5 h-auto border-0 bg-transparent p-0 text-center text-3xl font-bold tabular-nums text-primary shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 lg:text-4xl"
            />
          </div>
          {refrig?.temGlide && (
            <span className="mt-2 block text-center text-[11px] font-medium text-amber-600 dark:text-amber-400 lg:text-xs">
              {formula === 'dew' ? t.vapour : t.liquid}
            </span>
          )}
          {/* Aviso de pressão fora da faixa (fonte = pressão) */}
          {pressaoForaFaixa && (
            <div className="mt-2 rounded-md border border-border bg-muted px-2 py-1.5 text-[11px] leading-snug text-muted-foreground">
              {t.outsideRange}{' '}
              <span className="font-semibold">{unidade === 'bar' ? 'bar' : 'psi'}</span>.
              {sugestao && (
                <>
                  {' '}{t.seemsIn}{' '}
                  <button
                    type="button"
                    onClick={() => setUnidade(sugestao.unidadeSugerida)}
                    className="font-semibold underline underline-offset-2"
                  >
                    {sugestao.unidadeSugerida === 'bar' ? 'bar' : 'psi'}
                  </button>{' '}
                  {t.givesTemp.replace('{temp}', String(Math.round(sugestao.tempSat)))}
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function ReguaGases() {
  const { locale } = useAppLocaleContext();
  const t = MESSAGES[locale].app.technicianTools.ptChart;

  const [unidade, setUnidade] = usePersistedState<UnidadePressao>(
    'tt:state:regua-gases:unidade',
    'psi',
  );

  return (
    <div className="space-y-4 pb-4">
      <div>
        <h2 className="text-base font-semibold tracking-tight md:text-xl">{t.title}</h2>
        <p className="text-sm text-muted-foreground md:text-base">
          {t.subtitle}
        </p>
      </div>

      {/* Régua de escala dupla unificada (mobile + desktop) */}
      <ReguaUnificada unidade={unidade} setUnidade={setUnidade} t={t} />

      <ToolDisclaimer texto={t.disclaimer.replace('{blends}', GASES_COM_GLIDE)} />
    </div>
  );
}
