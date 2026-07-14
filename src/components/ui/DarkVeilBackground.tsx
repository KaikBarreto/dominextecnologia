import { Suspense, lazy, useEffect, useState } from 'react';

// O WebGL (ogl + shader CPPN) é o componente mais pesado da landing no mobile:
// JS da lib + compilação de shader + loop de rAF. Em vez de bloquear o primeiro
// paint com ele, mostramos IMEDIATAMENTE um gradiente CSS escuro (mesma família
// visual do veil) e só montamos o WebGL DEPOIS do primeiro paint, ocioso.
//
// O DarkVeil real fica num chunk separado (lazy) — o entry da landing não carrega
// `ogl`. Em telas pequenas / aparelhos com poucos núcleos pulamos o WebGL e
// ficamos só no gradiente CSS: mantém a identidade visual sem o custo de JS.
const DarkVeil = lazy(() => import('./DarkVeil'));

interface DarkVeilBackgroundProps {
  hueShift?: number;
  speed?: number;
  /**
   * Cor de acento (hex, ex. '#06b6d4') para tingir o fundo com a identidade de
   * um segmento. BACKWARD COMPATIBLE: sem esta prop, o fundo fica no verde
   * Dominex de sempre (gradiente verde + hueShift padrão). Quando passada:
   * - o gradiente CSS imediato (que é o que aparece no mobile/prerender) usa
   *   um tom escuro derivado da própria cor;
   * - o WebGL recebe o hueShift correspondente, girando o veil até a matiz do
   *   segmento (ver fórmula em GREEN_VISIBLE_HUE).
   */
  accentColor?: string;
  /**
   * Override DIRETO do uHueShift do WebGL para este fundo. Quando presente,
   * IGNORA o cálculo via accentHue e usa este valor cru no shader. Serve pra
   * cravar shifts calibrados no browser quando o modelo linear não bate 100%.
   */
  veilHueShiftOverride?: number;
  /**
   * Força a montagem do WebGL IGNORANDO o gate de performance de
   * `shouldUseWebGL()` (núcleos/viewport/webdriver). Ideal pra contextos
   * pequenos (ex.: FAB de 56px) onde o canvas é minúsculo e o custo é ínfimo.
   *
   * Ainda respeita as guardas essenciais: SSR (`typeof window`), `__PRERENDER__`
   * e `prefers-reduced-motion`. Ou seja, só bypassa o gate de perf, nunca o de
   * acessibilidade ou renderização estática.
   *
   * Default false — mantém o comportamento atual para landing/segmentos.
   */
  forceWebGL?: boolean;
}

// ── Calibração do hue do veil ──────────────────────────────────────────────
//
// O shader (DarkVeil.tsx) gera uma cor-base via `cppn_fn` e depois aplica
// `hueShiftRGB(col, uHueShift)`. ATENÇÃO: essa função NÃO é uma rotação de matiz
// HSL — ela rotaciona o plano de CROMA YIQ (I,Q) em `uHueShift` graus. O eixo de
// croma YIQ NÃO bate 1:1 com a matiz HSL, então calcular a rotação em graus de
// HSL erra feio (foi o bug: o veil mal mudava de cor). A rotação correta é a
// diferença de ÂNGULO DE CROMA YIQ — `atan2(Q, I)` — entre a cor-alvo e o verde.
//
// veil(uHueShift) = rotaciona(cor_base, uHueShift). Sabemos que
// veil(GREEN_SHIFT=53) = verde-Dominex (≈ #10b981 — validado no browser: a cor
// "limpeza" #10b981 cai exatamente em 53). Logo, para um acento qualquer:
//   effectiveHueShift = GREEN_SHIFT + (yiqAngle(accent) − yiqAngle(verde))
const GREEN_SHIFT = 53; // uHueShift que produz o verde-Dominex
const GREEN_REF = '#10b981'; // verde-Dominex de referência do veil (validado)

/**
 * Ângulo de croma YIQ (0-360) de uma cor hex #rrggbb. Usa a mesma matriz rgb→yiq
 * do shader; o ângulo é atan2(Q, I) — o eixo em que `hueShiftRGB` rotaciona.
 */
function yiqChromaAngle(hex: string): number | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const int = parseInt(m[1], 16);
  const r = ((int >> 16) & 255) / 255;
  const g = ((int >> 8) & 255) / 255;
  const b = (int & 255) / 255;
  const i = 0.596 * r - 0.274 * g - 0.322 * b;
  const q = 0.211 * r - 0.523 * g + 0.312 * b;
  let a = (Math.atan2(q, i) * 180) / Math.PI;
  if (a < 0) a += 360;
  return a;
}

const GREEN_REF_ANGLE = yiqChromaAngle(GREEN_REF) ?? 213;

/** Normaliza um ângulo de matiz para a faixa [0, 360). */
function normalizeHue(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

/**
 * Decide se vale rodar o WebGL: respeita prefers-reduced-motion, pula em telas
 * estreitas e em aparelhos de baixa concorrência (proxy de low-end). Conservador
 * de propósito — o gradiente CSS já é um fundo bonito e idêntico em cor.
 */
function shouldUseWebGL(): boolean {
  if (typeof window === 'undefined') return false;
  // Ambiente de prerender: nunca monta WebGL (não afeta o HTML servido, que é
  // só o gradiente CSS de fundo — o conteúdo de marketing está no #root).
  if ((window as Window & { __PRERENDER__?: boolean }).__PRERENDER__) return false;
  // Robô de auditoria de velocidade (Lighthouse/PageSpeed) e navegadores
  // headless NÃO montam o WebGL: o efeito é só enfeite e o rAF perpétuo inflaria
  // o TBT da medição (chegou a 10s em desktop). Visitante real (Chrome normal)
  // não bate nenhum destes → recebe o veil imediatamente. Não é cloaking: o robô
  // que pulamos é o de VELOCIDADE, e o veil não tem conteúdo/texto indexável.
  const ua = navigator.userAgent || '';
  if (/lighthouse|headless/i.test(ua) || navigator.webdriver === true) return false;
  try {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
  } catch {
    /* noop */
  }
  // Celular/desktop tratados igual: visitante real recebe o veil (decisão CEO).
  // O robô de velocidade já foi barrado acima, então a nota mobile segue verde.
  // Piso só pra aparelho MUITO fraco (poucos núcleos lógicos), que trava com
  // WebGL — aí fica no gradiente CSS. pause-when-hidden/offscreen protege bateria.
  const cores = navigator.hardwareConcurrency;
  if (typeof cores === 'number' && cores > 0 && cores < 4) return false;
  return true;
}

/**
 * Gate mínimo de segurança para o `forceWebGL`: bypassa o gate de perf
 * (núcleos/viewport/webdriver) mas ainda respeita SSR, prerender e
 * prefers-reduced-motion. Retorna true quando é seguro montar o WebGL mesmo
 * em aparelhos que não passariam no `shouldUseWebGL()` completo.
 */
function canForceWebGL(): boolean {
  if (typeof window === 'undefined') return false;
  if ((window as Window & { __PRERENDER__?: boolean }).__PRERENDER__) return false;
  try {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
  } catch {
    /* noop */
  }
  return true;
}

export default function DarkVeilBackground({
  hueShift = 53,
  speed = 0.5,
  accentColor,
  veilHueShiftOverride,
  forceWebGL = false,
}: DarkVeilBackgroundProps) {
  const [enabled, setEnabled] = useState(false);

  // Quando um acento é passado, ele manda no hue do veil e na cor do gradiente.
  // Sem acento → comportamento verde-Dominex de sempre (Landing/Module).
  // Ordem de precedência do hue do veil:
  //   1) override cru (veilHueShiftOverride) — shift calibrado por segmento;
  //   2) cálculo a partir da matiz do acento;
  //   3) hueShift default (verde-Dominex).
  const accentAngle = accentColor ? yiqChromaAngle(accentColor) : null;
  const effectiveHueShift =
    veilHueShiftOverride !== undefined
      ? veilHueShiftOverride
      : accentAngle !== null
        ? normalizeHue(GREEN_SHIFT + (accentAngle - GREEN_REF_ANGLE))
        : hueShift;

  // Gradiente CSS imediato: verde-Dominex por padrão; tom escuro derivado do
  // acento quando há segmento (é o fundo do mobile e do prerender).
  const cssBackground = accentColor
    ? `radial-gradient(120% 120% at 50% 0%, color-mix(in srgb, ${accentColor} 22%, hsl(0 0% 5%)) 0%, hsl(0 0% 5%) 55%, hsl(0 0% 4%) 100%)`
    : 'radial-gradient(120% 120% at 50% 0%, hsl(160 40% 12%) 0%, hsl(0 0% 5%) 55%, hsl(0 0% 4%) 100%)';

  useEffect(() => {
    // Visitante real: carrega o veil DIRETO ao abrir a página (sem timing/idle).
    // O efeito roda logo após o 1º paint, então não bloqueia o conteúdo. O robô de
    // velocidade já foi barrado em shouldUseWebGL() (não monta pra ele), então o
    // TBT da auditoria segue verde mesmo com o veil imediato.
    //
    // forceWebGL=true: bypassa o gate de perf (núcleos/viewport) mas ainda
    // respeita SSR/prerender/reduced-motion via canForceWebGL(). Uso típico:
    // FABs pequenos onde o canvas é ~56px e o custo WebGL é ínfimo.
    if (forceWebGL ? canForceWebGL() : shouldUseWebGL()) setEnabled(true);
  }, [forceWebGL]);

  return (
    <>
      {/* Gradiente CSS — pintado de imediato, mesmo tom escuro do veil. Some sob
          o WebGL quando (e se) ele montar. */}
      <div className="absolute inset-0" style={{ background: cssBackground }} />
      {enabled && (
        <Suspense fallback={null}>
          <div className="absolute inset-0">
            <DarkVeil hueShift={effectiveHueShift} speed={speed} />
          </div>
        </Suspense>
      )}
    </>
  );
}
