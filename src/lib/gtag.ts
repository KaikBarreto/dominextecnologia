// Tag do Google Ads (gtag.js) — carregada SOB DEMANDA e SÓ no site público.
//
// Por que NÃO vai no index.html:
//   O index.html é o shell de tudo, inclusive do app logado. A tag colada lá
//   mandaria pro Google a navegação de cliente pagante DENTRO da plataforma
//   (que tela abriu, com que frequência, em que horário) — dado de tenant que
//   não tem motivo nenhum pra sair daqui. O tráfego de anúncio só entra pelo
//   site público, então é lá, e só lá, que a tag precisa existir.
//
// Onde é montada: <GoogleAdsTag /> dentro de PublicMarketingLayout e
// LocalizedMarketingLayout (App.tsx) — cobre o pt-br sem prefixo e /en /es /fr.
// O app logado (AppLayout) nunca monta isso.
//
// A conversão de cadastro é disparada à mão em Registration.tsx (onSuccess),
// ANTES do navigate pro /dashboard: a navegação é client-side (react-router),
// então não existe "page load" de página de obrigado pro Google detectar
// sozinho — medir por URL contaria todo login de cliente antigo como cadastro.

export const GOOGLE_ADS_ID = 'AW-18492767160';

/**
 * Rótulo da ação de conversão "Inscrição".
 *
 * Onde achar: Google Ads → Metas → Conversões → a ação → "Configurar tag" →
 * o snippet de evento mostra `send_to: 'AW-18492767160/XXXXXXXX'`. O rótulo é
 * a parte DEPOIS da barra.
 *
 * Vazio = a tag global continua carregando normal (já alimenta remarketing e
 * o Google continua reconhecendo o clique do anúncio), mas a conversão de
 * cadastro não é reportada.
 */
export const SIGNUP_CONVERSION_LABEL = '0ldjCNWn4Y8dELj3hPJE';

/**
 * Moeda do valor reportado. O snippet que o Google gerou vinha com `EUR`
 * porque a CONTA do Ads foi aberta em euro (Portugal). Aqui mandamos `BRL`,
 * que é a moeda real do negócio: os planos são R$ 197 / R$ 447 / R$ 697.
 *
 * O Google aceita moeda diferente da conta e converte pela taxa do dia, então
 * isto não quebra nada. Mas o relatório e a COBRANÇA da conta continuam em
 * euro, e a moeda de uma conta do Ads não pode ser alterada depois de criada.
 * Corrigir isso de verdade exige conta nova em BRL — e aí tanto GOOGLE_ADS_ID
 * quanto SIGNUP_CONVERSION_LABEL mudam, e são só estas duas constantes.
 */
export const CONVERSION_CURRENCY = 'BRL';

/**
 * Valor atribuído a um cadastro novo. Simbólico de propósito: o cadastro é
 * teste grátis de 14 dias sem cartão, ninguém pagou nada ainda, então não
 * existe receita real pra reportar nesse instante.
 *
 * Como todas as conversões saem com o mesmo valor, o número não influencia o
 * lance (só o relatório). Calibrar só faz sentido no dia em que medirmos a
 * conversão de teste em assinatura paga e quisermos ROAS de verdade.
 */
export const SIGNUP_CONVERSION_VALUE = 1;

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

const SCRIPT_ID = 'google-ads-gtag';

/**
 * Injeta o gtag.js uma única vez. Idempotente: chamar de novo (remount do
 * layout, troca de rota, StrictMode em dev) não duplica script nem config.
 * No-op fora do browser (o SSG prerenderiza as páginas públicas em Node).
 */
export function loadGoogleAdsTag(): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (document.getElementById(SCRIPT_ID)) return;

  window.dataLayer = window.dataLayer || [];
  // Precisa ser `function` (arguments), não arrow — o gtag.js lê o `arguments`
  // cru empilhado no dataLayer.
  window.gtag = function gtag() {
    // eslint-disable-next-line prefer-rest-params
    window.dataLayer!.push(arguments);
  };

  window.gtag('js', new Date());
  window.gtag('config', GOOGLE_ADS_ID);

  const script = document.createElement('script');
  script.id = SCRIPT_ID;
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${GOOGLE_ADS_ID}`;
  document.head.appendChild(script);
}

/**
 * Reporta a conversão de cadastro novo (meta "Inscrições" da campanha).
 *
 * Chamar SÓ quando o cadastro realmente deu certo (empresa criada), nunca no
 * submit do formulário — senão tentativa que falhou vira conversão e o Google
 * otimiza a campanha pra trazer mais gente que não consegue se cadastrar.
 *
 * Silencioso por desenho: anúncio não pode quebrar cadastro. Se a tag não
 * carregou (bloqueador, rede, usuário que entrou direto pelo app) a função
 * simplesmente não faz nada.
 */
export function trackSignupConversion(): void {
  if (typeof window === 'undefined') return;
  if (!SIGNUP_CONVERSION_LABEL) return;
  if (typeof window.gtag !== 'function') return;

  try {
    window.gtag('event', 'conversion', {
      send_to: `${GOOGLE_ADS_ID}/${SIGNUP_CONVERSION_LABEL}`,
      value: SIGNUP_CONVERSION_VALUE,
      currency: CONVERSION_CURRENCY,
    });
  } catch {
    // ignora: medição de anúncio nunca atrapalha o fluxo do usuário
  }
}
