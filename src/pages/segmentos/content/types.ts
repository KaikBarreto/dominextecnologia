// ─────────────────────────────────────────────────────────────────────────────
// Tipos de conteúdo TRADUZIVEL de segmentos (Fase 2 i18n).
//
// Separação de responsabilidades:
//  - "Identidade"  (NÃO traduzível): slug, accentColor, veilHueShift, navLabel,
//    icon. Esses campos ficam no SegmentData original em segmentsData.ts.
//  - "Conteúdo"    (traduzível): todos os campos de texto abaixo.
//
// Esta separação garante que o loader possa combinar identidade + conteúdo
// por locale sem duplicar os campos que nunca mudam entre idiomas.
//
// Fase 2: apenas pt-br está populado com dados reais. en/es/fr fazem fallback
// explícito para pt-br até as traduções serem revisadas pelo CEO (Fase 4+).
// ─────────────────────────────────────────────────────────────────────────────

import type { LucideIcon } from 'lucide-react';

export interface SegmentContentMetric {
  value: string;
  label: string;
}

export interface SegmentContentPain {
  pain: string;
  solution: string;
}

export interface SegmentContentDeepDive {
  /** Ícone do card — pertence ao conteúdo pois pode mudar por idioma no futuro. */
  icon: LucideIcon;
  title: string;
  body: string;
  /**
   * Foto opcional do card. src/alt ficam no conteúdo porque alt-text é texto
   * visível e precisará de tradução. O src não muda por idioma (Fase 2).
   */
  image?: { src: string; alt: string };
}

export interface SegmentContentFeature {
  icon: LucideIcon;
  title: string;
  desc: string;
}

export interface SegmentContentTestimonial {
  quote: string;
  name: string;
  role: string;
  company: string;
}

export interface SegmentContentFaq {
  q: string;
  a: string;
}

/**
 * Shape completo do conteúdo traduzível de um segmento.
 * Todos os campos de texto visível ao usuário vivem aqui.
 */
export interface SegmentContent {
  /**
   * Slug de ROTA/URL deste segmento NESTE idioma (sem barra inicial). OPCIONAL.
   *
   * Fonte da verdade do slug traduzido: quando a fase de tradução preencher, por
   * ex., `slug: 'refrigeration-service-software'` no content/en.ts, a rota
   * /en/<esse-slug> passa a valer sozinha (registro em @/lib/i18n/slugRegistry).
   * Enquanto AUSENTE, o slugRegistry cai no slug pt-br canônico (a chave do mapa)
   * e NADA muda visível. NÃO é conteúdo renderizado na página; é só o endereço.
   */
  slug?: string;
  metaTitle: string;
  metaDescription: string;
  hero: {
    eyebrow: string;
    h1: string;
    h1Highlight: string;
    subtitle: string;
  };
  metrics: SegmentContentMetric[];
  pains: SegmentContentPain[];
  deepDives: SegmentContentDeepDive[];
  features: SegmentContentFeature[];
  testimonials: SegmentContentTestimonial[];
  faq: SegmentContentFaq[];
  finalCta: {
    title: string;
    subtitle: string;
  };
}

/**
 * Mapa de conteúdo por ID de segmento (slug pt-br como chave canônica).
 * Cada arquivo de locale exporta um objeto deste tipo.
 */
export type SegmentContentMap = Record<string, SegmentContent>;
