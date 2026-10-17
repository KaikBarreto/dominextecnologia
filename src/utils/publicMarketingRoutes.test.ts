// ─────────────────────────────────────────────────────────────────────────────
// Viewport por rota — rede de proteção de ACESSIBILIDADE (WCAG 1.4.4).
//
// Dois riscos reais que estes testes travam:
//
// 1) A lista EXACT_MARKETING_PATHS é mantida à mão e já ficou dessincronizada
//    de segmentsData (a landing `sistema-para-assistencia-tecnica` existia como
//    rota em App.tsx mas faltava na lista, então servia com o zoom BLOQUEADO).
//    Falha silenciosa: a página abre normal, só o zoom de pinça morre.
//
// 2) As páginas públicas de formulário (login/cadastro/reset) não são marketing
//    e por isso caíam no viewport fixo do app logado — bloquear zoom numa tela
//    de formulário público reprova WCAG 1.4.4.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest';
import { SEGMENTS } from '@/pages/segmentos/segmentsData';
import { MODULES } from '@/pages/modulos/modulesData';
import {
  allowsPinchZoom,
  isMarketingRoute,
  MARKETING_VIEWPORT,
  APP_VIEWPORT,
} from './publicMarketingRoutes';

// O path público vem do campo `slug`, NÃO da chave do Record: o módulo de CRM
// está registrado sob a chave `crm` mas serve em `/sistema-crm` (porque `/crm`
// já é a tela autenticada). Por isso os testes abaixo leem `.slug`.
describe('publicMarketingRoutes — sincronia da lista com a fonte de dados', () => {
  it('toda landing de SEGMENTO é rota de marketing', () => {
    const faltando = Object.values(SEGMENTS)
      .map((s) => s.slug)
      .filter((slug) => !isMarketingRoute(`/${slug}`));
    expect(faltando).toEqual([]);
  });

  it('toda landing de MÓDULO é rota de marketing', () => {
    const faltando = Object.values(MODULES)
      .map((m) => m.slug)
      .filter((slug) => !isMarketingRoute(`/${slug}`));
    expect(faltando).toEqual([]);
  });
});

describe('allowsPinchZoom — zoom liberado onde o usuário precisa', () => {
  it.each([
    '/',
    '/quem-somos',
    '/blog',
    '/blog/como-abrir-empresa-de-servicos-mei-me-cnae-impostos',
    '/privacidade',
    '/termos',
    '/sistema-para-refrigeracao',
    '/sistema-para-assistencia-tecnica',
    '/os-digital',
    '/docs',
    '/docs/guias/criar-os-whatsapp',
  ])('libera em página de marketing: %s', (path) => {
    expect(allowsPinchZoom(path)).toBe(true);
  });

  it.each(['/login', '/cadastro', '/reset-password'])(
    'libera em página pública de formulário: %s',
    (path) => {
      expect(allowsPinchZoom(path)).toBe(true);
    },
  );

  it.each(['/en/cadastro', '/es/login', '/fr/reset-password', '/en/blog'])(
    'libera também na versão com prefixo de idioma: %s',
    (path) => {
      expect(allowsPinchZoom(path)).toBe(true);
    },
  );

  it('tolera barra final', () => {
    expect(allowsPinchZoom('/cadastro/')).toBe(true);
    expect(allowsPinchZoom('/sistema-para-refrigeracao/')).toBe(true);
  });
});

describe('allowsPinchZoom — viewport fixo preservado fora do site público', () => {
  it.each([
    '/financeiro',
    '/ordens-de-servico',
    '/portal/abc123',
    '/os-tecnico/42',
    '/orcamento/token123',
    '/ponto/empresa-x',
    '/admin/dashboard',
    '/rota-que-nao-existe',
  ])('mantém fixo em: %s', (path) => {
    expect(allowsPinchZoom(path)).toBe(false);
  });

  it('não confunde prefixo de rota de formulário com rota filha', () => {
    // `/cadastro/:code` é captura pública de lead, rota diferente de `/cadastro`.
    expect(allowsPinchZoom('/cadastro/abc123')).toBe(false);
  });
});

describe('constantes de viewport', () => {
  it('o viewport de marketing libera o zoom de pinça', () => {
    expect(MARKETING_VIEWPORT).toContain('maximum-scale=5');
    expect(MARKETING_VIEWPORT).not.toContain('user-scalable=no');
  });

  it('o viewport do app segue fixo de propósito (sensação de app nativo)', () => {
    expect(APP_VIEWPORT).toContain('user-scalable=no');
  });
});
