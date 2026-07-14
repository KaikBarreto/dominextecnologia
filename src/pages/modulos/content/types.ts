// ─────────────────────────────────────────────────────────────────────────────
// Tipos de conteúdo TRADUZIVEL de módulos (Fase 2 i18n).
//
// Separação de responsabilidades:
//  - "Identidade" (NÃO traduzível): slug, navLabel, icon, techNicheSelector.
//    Esses campos ficam no ModuleData original em modulesData.ts.
//  - "Conteúdo"   (traduzível): todos os campos de texto abaixo.
//
// Fase 2: apenas pt-br está populado com dados reais. en/es/fr fazem fallback
// explícito para pt-br até as traduções serem revisadas pelo CEO (Fase 4+).
// ─────────────────────────────────────────────────────────────────────────────

import type { LucideIcon } from 'lucide-react';

export interface ModuleContentMetric {
  value: string;
  label: string;
}

export interface ModuleContentPain {
  pain: string;
  solution: string;
}

export interface ModuleContentDeepDive {
  icon: LucideIcon;
  title: string;
  body: string;
  image?: { src: string; alt: string };
}

export interface ModuleContentFeature {
  icon: LucideIcon;
  title: string;
  desc: string;
}

export interface ModuleContentTestimonial {
  quote: string;
  name: string;
  role: string;
  company: string;
}

export interface ModuleContentFaq {
  q: string;
  a: string;
}

/**
 * Shape completo do conteúdo traduzível de um módulo.
 * Todos os campos de texto visível ao usuário vivem aqui.
 * Espelha ModuleData exceto os campos de identidade.
 */
export interface ModuleContent {
  metaTitle: string;
  metaDescription: string;
  hero: {
    eyebrow: string;
    h1: string;
    h1Highlight: string;
    subtitle: string;
  };
  metrics: ModuleContentMetric[];
  painsHeading: string;
  painsSubheading: string;
  pains: ModuleContentPain[];
  deepDives: ModuleContentDeepDive[];
  featuresHeading: string;
  featuresSubheading: string;
  features: ModuleContentFeature[];
  testimonialsHeading: string;
  testimonials: ModuleContentTestimonial[];
  faq: ModuleContentFaq[];
  finalCta: {
    title: string;
    subtitle: string;
  };
}

/**
 * Mapa de conteúdo por slug de módulo (slug pt-br como chave canônica).
 * Cada arquivo de locale exporta um objeto deste tipo.
 */
export type ModuleContentMap = Record<string, ModuleContent>;
