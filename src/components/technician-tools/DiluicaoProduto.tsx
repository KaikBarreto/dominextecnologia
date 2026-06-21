import { useMemo } from 'react';
import { Info } from 'lucide-react';
import { NumericInput } from '@/components/ui/numeric-input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { LabeledSwitch } from '@/components/ui/labeled-switch';
import { usePersistedState } from '@/hooks/usePersistedState';
import { ToolDisclaimer } from './ToolDisclaimer';

/** Modo da calculadora. */
type Modo = 'preparar' | 'tenho';
/** Unidade de volume. */
type Unidade = 'ml' | 'l';

/** Proporções 1:N comuns na estética automotiva (chips de atalho). */
const PRESETS_N = [1, 3, 5, 10, 20, 40, 100];

/** Converte string crua em número (vírgula → ponto), com fallback. */
function num(s: string, fallback = NaN): number {
  if (s.trim() === '') return fallback;
  const n = Number(s.replace(',', '.'));
  return Number.isFinite(n) ? n : fallback;
}

/** Formata um número em pt-BR com até 2 casas (sem zeros à toa). */
function fmt(n: number): string {
  return n.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
}

/** Silhueta oficial do galão (Vector-3, viewBox 0 0 97 123), usada no clip
 *  e no contorno. Inclui bico, alça e recortes — o clip cuida de tudo. */
const GALAO_PATH =
  'M96.197 22.8648V4.78343C96.1969 3.5148 95.6929 2.29814 94.7959 1.40109C93.8988 0.504034 92.6822 5.10249e-05 91.4135 6.37727e-07H38.8724C37.7121 -0.000598355 36.5911 0.420779 35.7185 1.18558C34.8459 1.95038 34.2812 3.00641 34.1297 4.1568L31.9508 20.6285L24.4839 28.0954L19.5569 23.1661L20.4801 22.2429C20.7578 21.9653 20.978 21.6357 21.1283 21.2729C21.2785 20.9101 21.3559 20.5213 21.3559 20.1287C21.3559 19.736 21.2785 19.3472 21.1283 18.9844C20.978 18.6217 20.7578 18.292 20.4801 18.0144C20.2025 17.7368 19.8728 17.5165 19.5101 17.3662C19.1473 17.216 18.7585 17.1386 18.3658 17.1386C17.9732 17.1386 17.5844 17.216 17.2216 17.3662C16.8588 17.5165 16.5292 17.7368 16.2516 18.0144L0.875274 33.3931C0.597779 33.6706 0.377659 34 0.227479 34.3626C0.0772994 34.7252 1.39582e-06 35.1138 0 35.5062C-1.39578e-06 35.8986 0.0772924 36.2872 0.227469 36.6498C0.377646 37.0123 0.597766 37.3418 0.875258 37.6193C1.15275 37.8968 1.48218 38.1169 1.84474 38.2671C2.20731 38.4172 2.5959 38.4945 2.98833 38.4945C3.38077 38.4945 3.76936 38.4172 4.13192 38.2671C4.49449 38.1169 4.82392 37.8968 5.10141 37.6193L6.02703 36.6961L10.9539 41.6254L2.34137 50.238C1.44521 51.1353 0.941978 52.3517 0.942254 53.6198V117.318C0.942078 117.947 1.06568 118.569 1.30601 119.149C1.54634 119.73 1.89868 120.257 2.34289 120.701C2.78711 121.145 3.3145 121.498 3.89493 121.738C4.47537 121.978 5.09747 122.102 5.72568 122.102H91.4135C92.6822 122.102 93.8988 121.598 94.7959 120.701C95.6929 119.804 96.1969 118.587 96.197 117.318V53.6198H96.1946V22.8815L96.197 22.8648ZM86.6301 18.079H41.9386L43.0627 9.56686H86.6301V18.079Z';
/** Bounding box vertical da silhueta (topo..base), para fatiar as bandas de
 *  líquido. O líquido cheio deve atingir exatamente o topo da silhueta. */
const GALAO_TOP = 0.94;
const GALAO_BOTTOM = 122.1;

/**
 * Ilustração de galão (jerrican / bombona de produto de estética automotiva)
 * mostrando a proporção água/produto com as medidas.
 *
 * O líquido preenche 100% da silhueta: as bandas são <rect> de largura cheia
 * recortados por um <clipPath> com o PATH do corpo — assim acompanham os cantos
 * e curvas exatamente. Produto (rosa) embaixo, água (sky) em cima.
 */
function GarrafaDiluicao({
  produto,
  agua,
  unidadeLabel,
  clipId,
  legendaZerada = false,
}: {
  produto: number;
  agua: number;
  unidadeLabel: string;
  /** Id base estável/único por instância (evita colisão entre os dois modos). */
  clipId: string;
  /** Quando true, a legenda e o aria-label mostram 0/0 mesmo com o desenho cheio
   *  (estado vazio: galão cheio de água só para ilustrar). */
  legendaZerada?: boolean;
}) {
  const total = produto + agua;
  const temLiquido = total > 0;

  // Altura útil a partir da bounding box vertical da silhueta.
  const corpoTop = GALAO_TOP;
  const corpoBottom = GALAO_BOTTOM;
  const corpoH = corpoBottom - corpoTop;

  const fracProduto = temLiquido ? produto / total : 0;
  const fracAgua = temLiquido ? agua / total : 0;

  const alturaProduto = fracProduto * corpoH;
  const alturaAgua = fracAgua * corpoH;

  // Produto embaixo, água logo acima — recortados pela silhueta.
  const produtoY = corpoBottom - alturaProduto;
  const aguaY = produtoY - alturaAgua;

  // Largura cheia: cobre todo o viewBox antes do clip.
  const bandaX = 0;
  const bandaW = 97;

  // Produto em rosa (#ec4899) pra contrastar com a água sky (#7dd3fc).
  const produtoCor = '#ec4899';
  const sky = '#7dd3fc';

  const clipBody = `${clipId}-corpo`;

  // Valores exibidos na legenda/aria — zerados no estado vazio, mesmo com o
  // desenho cheio de água apenas ilustrando.
  const legProduto = legendaZerada ? 0 : produto;
  const legAgua = legendaZerada ? 0 : agua;

  return (
    <div className="flex shrink-0 flex-col items-center gap-2">
      <svg
        viewBox="0 0 97 123"
        role="img"
        aria-label={`Galão com ${fmt(legProduto)} ${unidadeLabel} de produto e ${fmt(
          legAgua,
        )} ${unidadeLabel} de água`}
        className="h-56 w-auto max-w-[8.5rem] text-border md:h-64"
      >
        {/* Recorte: líquido só dentro da silhueta do galão. */}
        <defs>
          <clipPath id={clipBody}>
            <path d={GALAO_PATH} />
          </clipPath>
        </defs>

        {/* Bandas de líquido (recortadas pela silhueta — preenchem 100% o formato) */}
        <g clipPath={`url(#${clipBody})`}>
          {alturaAgua > 0 && (
            <rect x={bandaX} y={aguaY} width={bandaW} height={alturaAgua} fill={sky} />
          )}
          {alturaProduto > 0 && (
            <rect
              x={bandaX}
              y={produtoY}
              width={bandaW}
              height={alturaProduto}
              fill={produtoCor}
            />
          )}
        </g>

        {/* Contorno da silhueta (mesma do clip) por cima das bandas */}
        <path
          d={GALAO_PATH}
          fill="none"
          stroke="currentColor"
          strokeWidth={3}
          strokeLinejoin="round"
        />
      </svg>

      {/* Legenda com as medidas */}
      <div className="space-y-1 text-xs">
        <div className="flex items-center gap-1.5">
          <span
            className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: sky }}
          />
          <span className="text-foreground">
            Água {fmt(legAgua)} {unidadeLabel}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <span
            className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: produtoCor }}
          />
          <span className="text-foreground">
            Produto {fmt(legProduto)} {unidadeLabel}
          </span>
        </div>
      </div>
    </div>
  );
}

export function DiluicaoProduto() {
  const [modo, setModo] = usePersistedState<Modo>('tt:state:diluicao:modo', 'preparar');
  const [unidade, setUnidade] = usePersistedState<Unidade>('tt:state:diluicao:unidade', 'ml');

  // Proporção 1:N (campo do N) — compartilhada pelos dois modos.
  const [n, setN] = usePersistedState<string>('tt:state:diluicao:n', '10');

  // Modo "Preparar solução": volume final desejado.
  const [volumeFinal, setVolumeFinal] = usePersistedState<string>(
    'tt:state:diluicao:volumeFinal',
    '',
  );

  // Modo "Tenho X de produto": quantidade de produto disponível.
  const [produtoQtd, setProdutoQtd] = usePersistedState<string>(
    'tt:state:diluicao:produtoQtd',
    '',
  );

  const unidadeLabel = unidade === 'ml' ? 'mL' : 'L';
  const nNum = num(n);
  const nValido = Number.isFinite(nNum) && nNum >= 0;

  // Cálculo: Preparar solução → divide o volume final em produto + água.
  const resultadoPreparar = useMemo(() => {
    const vf = num(volumeFinal);
    if (!nValido || !Number.isFinite(vf) || vf <= 0) return null;
    const produto = vf / (nNum + 1);
    const agua = vf - produto;
    return { produto, agua, volumeFinal: vf };
  }, [volumeFinal, nNum, nValido]);

  // Cálculo: Tenho X de produto → quanto de água adicionar e volume final.
  const resultadoTenho = useMemo(() => {
    const p = num(produtoQtd);
    if (!nValido || !Number.isFinite(p) || p <= 0) return null;
    const agua = p * nNum;
    const total = p * (nNum + 1);
    return { produto: p, agua, volumeFinal: total };
  }, [produtoQtd, nNum, nValido]);

  return (
    <div className="space-y-4 pb-4">
      <div>
        <h2 className="text-base font-semibold tracking-tight md:text-xl">Diluição de Produto</h2>
        <p className="text-sm text-muted-foreground md:text-base">
          {modo === 'preparar'
            ? 'Quanto de produto e de água para chegar no volume desejado.'
            : 'Quanto de água adicionar ao produto que você já tem.'}
        </p>
      </div>

      {/* Card de entrada */}
      <div className="space-y-4 rounded-lg border border-border bg-card p-4">
        {/* Alavanca de modo */}
        <div className="flex flex-col items-center gap-1.5 border-b border-border pb-4">
          <Label className="text-base text-muted-foreground md:text-lg">Modo de Diluição</Label>
          <LabeledSwitch
            value={modo}
            onChange={setModo}
            off={{ value: 'preparar', label: 'Preparar solução' }}
            on={{ value: 'tenho', label: 'Tenho X de produto' }}
            size="lg"
            aria-label="Modo de cálculo da diluição"
          />
        </div>

        {/* Proporção + presets — centralizado */}
        <div className="flex flex-col items-center gap-2">
          <Label className="text-base text-muted-foreground md:text-lg">Proporção</Label>
          <div className="flex items-center gap-3">
            <span className="text-2xl font-bold text-muted-foreground">1 para</span>
            <NumericInput
              decimal
              value={n}
              onValueChange={setN}
              placeholder="10"
              className="h-16 w-32 text-2xl font-bold md:h-16 md:text-2xl"
            />
          </div>
          <div className="flex flex-wrap justify-center gap-2 pt-1">
            {PRESETS_N.map((p) => {
              const ativo = num(n) === p;
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => setN(String(p))}
                  className={cn(
                    'rounded-full border px-3 py-1.5 text-sm font-medium transition-colors',
                    ativo
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground',
                  )}
                >
                  1:{p}
                </button>
              );
            })}
          </div>
        </div>

        {/* Campos por modo */}
        {modo === 'preparar' ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:mx-auto lg:max-w-md">
            <div className="space-y-1.5">
              <Label className="text-base text-muted-foreground md:text-lg">
                Volume final desejado
              </Label>
              <NumericInput
                decimal
                value={volumeFinal}
                onValueChange={setVolumeFinal}
                placeholder="Ex: 500"
                className="h-14 text-lg md:h-14 md:text-lg"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-base text-muted-foreground md:text-lg">Unidade</Label>
              <div className="flex h-14 items-center justify-center rounded-lg border border-border bg-background">
                <LabeledSwitch
                  value={unidade}
                  onChange={setUnidade}
                  off={{ value: 'ml', label: 'mL' }}
                  on={{ value: 'l', label: 'L' }}
                  size="lg"
                  aria-label="Unidade de volume"
                />
              </div>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:mx-auto lg:max-w-md">
            <div className="space-y-1.5">
              <Label className="text-base text-muted-foreground md:text-lg">
                Quantidade de produto
              </Label>
              <NumericInput
                decimal
                value={produtoQtd}
                onValueChange={setProdutoQtd}
                placeholder="Ex: 50"
                className="h-14 text-lg md:h-14 md:text-lg"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-base text-muted-foreground md:text-lg">Unidade</Label>
              <div className="flex h-14 items-center justify-center rounded-lg border border-border bg-background">
                <LabeledSwitch
                  value={unidade}
                  onChange={setUnidade}
                  off={{ value: 'ml', label: 'mL' }}
                  on={{ value: 'l', label: 'L' }}
                  size="lg"
                  aria-label="Unidade de volume"
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Resultado ao vivo */}
      <div className="rounded-lg border border-border bg-background p-5">
        {modo === 'preparar' ? (
          resultadoPreparar ? (
            <div className="flex flex-col-reverse gap-4 lg:flex-row lg:items-center lg:justify-center lg:gap-8">
              <GarrafaDiluicao
                produto={resultadoPreparar.produto}
                agua={resultadoPreparar.agua}
                unidadeLabel={unidadeLabel}
                clipId="galao-preparar"
              />
              <div className="min-w-0 space-y-4">
                {/* Caixa única com os dois valores (divisor vertical) */}
                <div className="grid grid-cols-2 divide-x divide-border rounded-lg border border-border bg-muted/30 lg:mx-auto lg:grid-cols-1 lg:max-w-xs lg:divide-x-0 lg:divide-y">
                  <div className="p-3 text-center">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Produto
                    </p>
                    <p className="mt-1 text-2xl font-bold leading-none text-primary sm:text-3xl">
                      {fmt(resultadoPreparar.produto)}
                      <span className="ml-1 text-base font-semibold sm:text-lg">{unidadeLabel}</span>
                    </p>
                  </div>
                  <div className="p-3 text-center">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Água
                    </p>
                    <p className="mt-1 text-2xl font-bold leading-none text-primary sm:text-3xl">
                      {fmt(resultadoPreparar.agua)}
                      <span className="ml-1 text-base font-semibold sm:text-lg">{unidadeLabel}</span>
                    </p>
                  </div>
                </div>
                <p className="text-center text-sm text-muted-foreground">
                  Total: {fmt(resultadoPreparar.volumeFinal)} {unidadeLabel} na proporção 1:
                  {fmt(nNum)}.
                </p>
              </div>
            </div>
          ) : (
            <div className="flex flex-col-reverse gap-4 lg:flex-row lg:items-center lg:justify-center lg:gap-8">
              <GarrafaDiluicao
                produto={0}
                agua={1}
                unidadeLabel={unidadeLabel}
                clipId="galao-preparar-vazio"
                legendaZerada
              />
              <div className="min-w-0">
                <p className="text-center text-sm text-muted-foreground">
                  Informe a proporção e o volume final para ver o quanto de produto e água usar.
                </p>
              </div>
            </div>
          )
        ) : resultadoTenho ? (
          <div className="flex flex-col-reverse gap-4 lg:flex-row lg:items-center lg:justify-center lg:gap-8">
            <GarrafaDiluicao
              produto={resultadoTenho.produto}
              agua={resultadoTenho.agua}
              unidadeLabel={unidadeLabel}
              clipId="galao-tenho"
            />
            <div className="min-w-0 space-y-4">
              {/* Caixa única com os dois valores (divisor vertical) */}
              <div className="grid grid-cols-2 divide-x divide-border rounded-lg border border-border bg-muted/30 lg:mx-auto lg:grid-cols-1 lg:max-w-xs lg:divide-x-0 lg:divide-y">
                <div className="p-3 text-center">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Água a adicionar
                  </p>
                  <p className="mt-1 text-2xl font-bold leading-none text-primary sm:text-3xl">
                    {fmt(resultadoTenho.agua)}
                    <span className="ml-1 text-base font-semibold sm:text-lg">{unidadeLabel}</span>
                  </p>
                </div>
                <div className="p-3 text-center">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Volume final
                  </p>
                  <p className="mt-1 text-2xl font-bold leading-none text-primary sm:text-3xl">
                    {fmt(resultadoTenho.volumeFinal)}
                    <span className="ml-1 text-base font-semibold sm:text-lg">{unidadeLabel}</span>
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">(capacidade do galão)</p>
                </div>
              </div>
              <p className="text-center text-sm text-muted-foreground">
                {fmt(resultadoTenho.produto)} {unidadeLabel} de produto na proporção 1:{fmt(nNum)}.
              </p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col-reverse gap-4 lg:flex-row lg:items-center lg:justify-center lg:gap-8">
            <GarrafaDiluicao
              produto={0}
              agua={1}
              unidadeLabel={unidadeLabel}
              clipId="galao-tenho-vazio"
              legendaZerada
            />
            <div className="min-w-0">
              <p className="text-center text-sm text-muted-foreground">
                Informe a proporção e a quantidade de produto para ver quanta água adicionar.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Nota explicativa */}
      <div className="flex gap-2.5 rounded-lg border border-border bg-muted/40 p-3 text-muted-foreground">
        <Info className="h-4 w-4 shrink-0 mt-0.5 text-primary" />
        <p className="text-xs leading-relaxed">
          <span className="font-semibold text-foreground">Como ler: </span>
          Proporção 1:N = 1 parte de produto para N partes de água.
        </p>
      </div>

      <ToolDisclaimer texto="Ferramenta de apoio. Os valores são uma referência — confira sempre o rótulo do produto, a ficha técnica do fabricante e as normas de segurança aplicáveis antes de usar." />
    </div>
  );
}
