// Preview visual 3D do cartão de crédito nos checkouts (assinatura Auctus e
// cobrança avulsa pública /pagar/:code). É DECORAÇÃO: nenhum dado sai daqui,
// nada é enviado, e o cartão inteiro é `aria-hidden` (o leitor de tela já lê os
// inputs reais — não deve ler o número do cartão duas vezes).
//
// O painel de checkout é sempre claro e neutro e NÃO herda a cor de marca do
// tenant. Por isso as cores aqui são literais, ancoradas no azul do meio de
// pagamento cartão (`PAYMENT_METHOD_COLORS.card`), e nunca tokens de tema.
import { useEffect, useState } from "react";
import { CreditCard } from "lucide-react";
import { cn } from "@/lib/utils";
import { TiltCard } from "@/components/ui/tilt-card";
import { PAYMENT_METHOD_COLORS } from "./paymentMethodTheme";
import { useAppLocaleContext } from "@/contexts/AppLocaleContext";
import { MESSAGES } from "@/lib/i18n/messages";

export type CardBrand =
  | "visa"
  | "mastercard"
  | "elo"
  | "hipercard"
  | "amex"
  | "diners"
  | "discover"
  | "jcb"
  | "unknown";

/**
 * Faixas de BIN (6 dígitos) da Elo. Mantidas como pares [min, max] em vez de
 * uma regex gigante: é a lista que mais muda com o tempo e assim dá pra editar
 * sem reler expressão regular.
 */
const ELO_RANGES: Array<[number, number]> = [
  // BINs isolados (expressos como faixa de 1 elemento)
  [401178, 401178],
  [401179, 401179],
  [431274, 431274],
  [438935, 438935],
  [451416, 451416],
  [457393, 457393],
  [457631, 457631],
  [457632, 457632],
  [504175, 504175],
  [627780, 627780],
  [636297, 636297],
  [636368, 636368],
  [650005, 650006],
  // Faixas
  [506699, 506778],
  [509000, 509999],
  [650031, 650033],
  [650035, 650051],
  [650405, 650439],
  [650485, 650538],
  [650541, 650598],
  [650700, 650718],
  [650720, 650727],
  [650901, 650978],
  [651652, 651679],
  [655000, 655019],
  [655021, 655058],
];

/**
 * Com 4 ou 5 dígitos digitados ainda não dá pra consultar o BIN de 6 da Elo.
 * Este helper compara o que já foi digitado contra as faixas TRUNCADAS pro
 * mesmo comprimento: se o prefixo ainda cabe em alguma faixa Elo, o veredito
 * fica suspenso.
 *
 * Por quê: sem isso, um Elo `401178…` aparece como VISA nas teclas 4 e 5 e só
 * vira `elo` na 6ª (idem `5041…` como Mastercard e `6550…` como Discover). É
 * mercado brasileiro — melhor não mostrar bandeira nenhuma do que mostrar a
 * errada e piscar na cara do pagador.
 */
function couldStillBeElo(d: string): boolean {
  if (d.length < 4 || d.length > 5) return false;
  const prefix = Number(d);
  const shift = 10 ** (6 - d.length);
  return ELO_RANGES.some(
    ([min, max]) => prefix >= Math.floor(min / shift) && prefix <= Math.floor(max / shift),
  );
}

/**
 * Detecta a bandeira pelo BIN.
 *
 * ⚠️ A ORDEM DOS TESTES IMPORTA: Elo e Hipercard compartilham prefixos com
 * Visa (4…), Mastercard (5…) e Discover (65…). Por isso as duas bandeiras
 * brasileiras são testadas ANTES — inverter a ordem faz um cartão Elo aparecer
 * como Visa.
 *
 * Com menos de 4 dígitos devolve `unknown` de propósito: evita a bandeira
 * "piscar", trocando a cada tecla enquanto o BIN ainda é ambíguo.
 */
export function detectCardBrand(digits: string): CardBrand {
  const d = digits.replace(/\D/g, "");
  if (d.length < 4) return "unknown";

  // 1) Elo — precisa vir antes de Visa/Mastercard/Discover.
  if (d.length >= 6) {
    const bin6 = Number(d.slice(0, 6));
    if (ELO_RANGES.some(([min, max]) => bin6 >= min && bin6 <= max)) return "elo";
  } else if (couldStillBeElo(d)) {
    // Prefixo ainda ambíguo: segura o veredito em vez de chutar Visa/Master/Discover.
    return "unknown";
  }

  // 2) Hipercard — `606282` colide com Discover, `3841` com Diners/Amex.
  if (/^606282/.test(d) || /^3841/.test(d)) return "hipercard";

  if (/^3[47]/.test(d)) return "amex";
  if (/^3(?:0[0-5]|[68])/.test(d)) return "diners";
  if (/^35(?:2[89]|[3-8]\d)/.test(d)) return "jcb";
  if (/^4/.test(d)) return "visa";

  const bin4 = Number(d.slice(0, 4));
  if (/^5[1-5]/.test(d) || (bin4 >= 2221 && bin4 <= 2720)) return "mastercard";

  const bin3 = Number(d.slice(0, 3));
  if (/^6011/.test(d) || /^65/.test(d) || (bin3 >= 644 && bin3 <= 649)) return "discover";

  return "unknown";
}

/**
 * Agrupamento do número no preview.
 *
 * O agrupamento canônico do Amex no plástico é 4-6-5, mas aqui ESPELHAMOS
 * deliberadamente a máscara do INPUT (grupos de 4, 15 dígitos no Amex):
 * o valor do input vai CRU (só `.trim()`) pro payload da Asaas, e não mexemos
 * no formato que já está provado em produção. Consistência entre o que a
 * pessoa digita e o que ela vê ganha de fidelidade ao plástico — e evita slot
 * fantasma, já que 4-6-5 tem 15 casas e o input aceitaria um 16º dígito.
 */
const groupsForBrand = (brand: CardBrand): number[] =>
  brand === "amex" ? [4, 4, 4, 3] : [4, 4, 4, 4];

interface CreditCardPreviewProps {
  /** Número já mascarado (com espaços) vindo do input. */
  number: string;
  /** Nome do titular (já em UPPERCASE pelo form). */
  holderName: string;
  /** Mês MM ('' se não escolhido). */
  expiryMonth: string;
  /** Ano AA — 2 dígitos ('' se não escolhido). */
  expiryYear: string;
  /** CVV digitado. */
  ccv: string;
  /** true = mostra o verso. Controlado pelo foco no campo de CVV. */
  flipped?: boolean;
  className?: string;
}

/** Hook de media query com guarda de SSR (o checkout público é pré-renderizado). */
function useMotionPreferences() {
  const read = () => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return { fineHover: false, reducedMotion: false };
    }
    return {
      fineHover: window.matchMedia("(hover: hover) and (pointer: fine)").matches,
      reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    };
  };

  const [prefs, setPrefs] = useState(read);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const hoverQuery = window.matchMedia("(hover: hover) and (pointer: fine)");
    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () =>
      setPrefs({ fineHover: hoverQuery.matches, reducedMotion: motionQuery.matches });
    sync();
    hoverQuery.addEventListener("change", sync);
    motionQuery.addEventListener("change", sync);
    return () => {
      hoverQuery.removeEventListener("change", sync);
      motionQuery.removeEventListener("change", sync);
    };
  }, []);

  return prefs;
}

/**
 * Wordmark da bandeira em TEXTO/CSS. Nada de imagem ou SVG de logo de terceiro
 * no repositório (licença de marca).
 */
function BrandMark({ brand, className }: { brand: CardBrand; className?: string }) {
  if (brand === "unknown") {
    return <CreditCard className={cn("h-6 w-6 text-white opacity-40", className)} />;
  }

  if (brand === "mastercard") {
    return (
      <div className={cn("flex items-center", className)}>
        <span className="block h-5 w-5 rounded-full bg-[#EB001B]/90" />
        <span className="-ml-2.5 block h-5 w-5 rounded-full bg-[#F79E1B]/90 mix-blend-screen" />
      </div>
    );
  }

  const wordmarks: Record<Exclude<CardBrand, "unknown" | "mastercard">, {
    label: string;
    className: string;
  }> = {
    visa: { label: "VISA", className: "italic font-black tracking-[0.12em] text-lg" },
    elo: { label: "elo", className: "font-black lowercase tracking-[0.18em] text-lg" },
    hipercard: { label: "Hipercard", className: "font-bold tracking-tight text-sm" },
    amex: { label: "AMEX", className: "font-black tracking-[0.22em] text-sm" },
    diners: { label: "Diners", className: "font-semibold tracking-wide text-sm" },
    discover: { label: "DISCOVER", className: "font-bold tracking-[0.1em] text-xs" },
    jcb: { label: "JCB", className: "font-black tracking-[0.18em] text-base" },
  };

  const mark = wordmarks[brand];
  return (
    <span className={cn("leading-none text-white/90", mark.className, className)}>
      {mark.label}
    </span>
  );
}

/** Chip dourado desenhado em CSS — sem imagem externa. */
function CardChip() {
  return (
    <div
      className="relative h-7 w-9 rounded-[4px] shadow-inner sm:h-8 sm:w-11"
      style={{
        background: "linear-gradient(135deg, #f7e7a6 0%, #d9b45b 45%, #b98f34 100%)",
      }}
    >
      <span className="absolute left-0 right-0 top-[33%] h-px bg-black/25" />
      <span className="absolute left-0 right-0 top-[66%] h-px bg-black/25" />
      <span className="absolute bottom-0 left-[38%] top-0 w-px bg-black/25" />
    </div>
  );
}

const FRONT_GRADIENT =
  "linear-gradient(135deg, #0f2534 0%, hsl(200, 60%, 22%) 45%, hsl(200, 85%, 32%) 100%)";
const BACK_GRADIENT =
  "linear-gradient(135deg, #0b1c28 0%, hsl(200, 60%, 17%) 45%, hsl(200, 85%, 24%) 100%)";

export function CreditCardPreview({
  number,
  holderName,
  expiryMonth,
  expiryYear,
  ccv,
  flipped = false,
  className,
}: CreditCardPreviewProps) {
  const { locale } = useAppLocaleContext();
  const t = MESSAGES[locale].app.common.cardForm;
  const { fineHover, reducedMotion } = useMotionPreferences();

  const digits = number.replace(/\D/g, "");
  const brand = detectCardBrand(digits);
  const groups = groupsForBrand(brand);

  // Slots não preenchidos viram •, preservando o agrupamento da bandeira.
  let cursor = 0;
  const renderedGroups = groups.map((size) => {
    const slice = digits.slice(cursor, cursor + size);
    cursor += size;
    return slice.padEnd(size, "•");
  });

  const expiry =
    expiryMonth && expiryYear ? `${expiryMonth}/${expiryYear}` : t.previewValidPlaceholder;
  const tiltEnabled = fineHover && !reducedMotion;
  const flipTransition = reducedMotion ? "0ms" : "600ms";

  const faceBase =
    "absolute inset-0 overflow-hidden rounded-2xl text-white ring-1 ring-white/10";
  // Sombra escura e curta: cartão físico pousado no painel claro. Glow colorido
  // aqui vira "neon de UI de IA" — a cor do meio de pagamento entra só no
  // brilho interno da face.
  const faceShadow = "0 12px 26px -14px rgba(9, 26, 38, 0.55)";
  const faceStyle: React.CSSProperties = {
    backfaceVisibility: "hidden",
    WebkitBackfaceVisibility: "hidden",
  };

  return (
    <div aria-hidden="true" className={cn("px-3 py-2", className)}>
      <TiltCard
        perspective={1200}
        tiltLimit={10}
        scale={1.02}
        effect="gravitate"
        spotlight={false}
        disabled={!tiltEnabled}
        className="mx-auto aspect-[1.586] w-full max-w-[340px] overflow-visible rounded-2xl"
      >
        <div
          // `absolute inset-0` (e não `h-full`): o pai resolve a altura por
          // aspect-ratio, e posicionamento absoluto dispensa a resolução de
          // porcentagem, que é onde Safari antigo tropeça.
          className="absolute inset-0"
          style={{
            transformStyle: "preserve-3d",
            WebkitTransformStyle: "preserve-3d",
            transform: `rotateY(${flipped ? 180 : 0}deg)`,
            transition: `transform ${flipTransition} cubic-bezier(0.4, 0, 0.2, 1)`,
          }}
        >
          {/* FRENTE */}
          <div
            className={faceBase}
            style={{
              ...faceStyle,
              background: FRONT_GRADIENT,
              boxShadow: faceShadow,
            }}
          >
            {/* Brilho/sheen próprio (o spotlight do TiltCard fica desligado). */}
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-tr from-white/0 via-white/10 to-white/0" />
            <div
              className="pointer-events-none absolute -right-10 -top-16 h-40 w-40 rounded-full opacity-40 blur-2xl"
              style={{ background: PAYMENT_METHOD_COLORS.card }}
            />

            <div className="relative flex h-full flex-col justify-between p-4 sm:p-5">
              <div className="flex items-start justify-between gap-3">
                <CardChip />
                <BrandMark brand={brand} />
              </div>

              <div className="select-none font-mono text-base tracking-wider drop-shadow-sm sm:text-lg">
                {renderedGroups.join(" ")}
              </div>

              <div className="flex items-end justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="text-[9px] uppercase tracking-[0.18em] text-white/50">
                    {t.previewName}
                  </div>
                  <div
                    className={cn(
                      "truncate text-xs font-medium uppercase tracking-wide sm:text-sm",
                      !holderName && "text-white/40",
                    )}
                  >
                    {holderName || t.previewNamePlaceholder}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-[9px] uppercase tracking-[0.18em] text-white/50">
                    {t.previewValid}
                  </div>
                  <div
                    className={cn(
                      "font-mono text-xs sm:text-sm",
                      !(expiryMonth && expiryYear) && "text-white/40",
                    )}
                  >
                    {expiry}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* VERSO */}
          <div
            className={faceBase}
            style={{
              ...faceStyle,
              background: BACK_GRADIENT,
              transform: "rotateY(180deg)",
              boxShadow: faceShadow,
            }}
          >
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-tr from-white/0 via-white/5 to-white/0" />

            <div className="relative flex h-full flex-col">
              <div className="mt-4 h-9 w-full bg-neutral-900 sm:h-11" />

              <div className="flex items-center gap-2 px-4 pt-5 sm:px-5">
                <div className="h-8 flex-1 rounded-sm bg-neutral-200" />
                <div className="flex h-8 min-w-[56px] items-center justify-center rounded-sm bg-white px-2">
                  <span className="select-none font-mono text-sm font-semibold text-neutral-900">
                    {ccv || "•••"}
                  </span>
                </div>
              </div>
              <div className="px-4 pt-1 text-right text-[9px] uppercase tracking-[0.18em] text-white/50 sm:px-5">
                {t.previewCvv}
              </div>

              <div className="mt-auto flex justify-end p-4 opacity-70 sm:p-5">
                <BrandMark brand={brand} />
              </div>
            </div>
          </div>
        </div>
      </TiltCard>
    </div>
  );
}
