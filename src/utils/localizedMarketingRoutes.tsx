// ─────────────────────────────────────────────────────────────────────────────
// Rotas LOCALIZADAS de segmento/módulo (bloco /:lang) — Fase 5 i18n.
//
// O bloco pt-br (sem prefixo) permanece com os paths pt-br FIXOS (intocado). Sob
// /:lang, o path de cada segmento/módulo é o slug DAQUELE idioma — resolvido do
// slugRegistry. Como um wrapper só sabe carregar a SUA página (pela key pt-br
// canônica), emitimos, por key, UMA rota por slug DISTINTO entre os idiomas
// prefixados, todas apontando pro mesmo wrapper. O wrapper resolve o conteúdo
// pela sua key + o locale da URL (via useLocale), então qualquer um dos paths
// cai na página certa.
//
// Enquanto os slugs traduzidos não existirem, slugFor(key, locale) devolve o
// slug pt-br pros 4 idiomas → o conjunto de slugs distintos é { slug pt-br } e o
// resultado é IDÊNTICO ao bloco pt-br fixo de antes (só prefixado por /:lang).
// Quando a tradução preencher content/en.ts { slug }, a rota /en/<slug-en> passa
// a existir sozinha, sem tocar aqui.
// ─────────────────────────────────────────────────────────────────────────────

import { Route } from 'react-router-dom';
import type { ReactElement } from 'react';
import { PREFIXED_LOCALES, slugFor } from '@/lib/i18n';

import SistemaParaRefrigeracao from '@/pages/segmentos/SistemaParaRefrigeracao';
import SistemaParaEletricistas from '@/pages/segmentos/SistemaParaEletricistas';
import SistemaParaEnergiaSolar from '@/pages/segmentos/SistemaParaEnergiaSolar';
import SistemaParaProvedores from '@/pages/segmentos/SistemaParaProvedores';
import SistemaParaCftv from '@/pages/segmentos/SistemaParaCftv';
import SistemaParaConstrucaoCivil from '@/pages/segmentos/SistemaParaConstrucaoCivil';
import SistemaParaElevadores from '@/pages/segmentos/SistemaParaElevadores';
import SistemaParaLimpezaConservacao from '@/pages/segmentos/SistemaParaLimpezaConservacao';
import SistemaParaDedetizacao from '@/pages/segmentos/SistemaParaDedetizacao';

import OsDigital from '@/pages/modulos/OsDigital';
import SistemaPmoc from '@/pages/modulos/SistemaPmoc';
import CrmModulo from '@/pages/modulos/CrmModulo';
import ControleFinanceiro from '@/pages/modulos/ControleFinanceiro';
import PontoEFolha from '@/pages/modulos/PontoEFolha';
import EmissaoDeNfse from '@/pages/modulos/EmissaoDeNfse';
import PortalDoCliente from '@/pages/modulos/PortalDoCliente';
import ControleDeEstoque from '@/pages/modulos/ControleDeEstoque';
import OrcamentosEContratos from '@/pages/modulos/OrcamentosEContratos';
import RastreamentoDeEquipes from '@/pages/modulos/RastreamentoDeEquipes';
import AreaDoTecnico from '@/pages/modulos/AreaDoTecnico';

/**
 * Mapa key canônica (slug pt-br) → elemento do wrapper. A key de segmento é o
 * slug pt-br; a de módulo é o `.slug` do ModuleData (== chave usada no registro).
 */
const WRAPPER_BY_KEY: Record<string, ReactElement> = {
  // Segmentos
  'sistema-para-refrigeracao': <SistemaParaRefrigeracao />,
  'sistema-para-eletricistas': <SistemaParaEletricistas />,
  'sistema-para-energia-solar': <SistemaParaEnergiaSolar />,
  'sistema-para-provedores': <SistemaParaProvedores />,
  'sistema-para-cftv': <SistemaParaCftv />,
  'sistema-para-construcao-civil': <SistemaParaConstrucaoCivil />,
  'sistema-para-elevadores': <SistemaParaElevadores />,
  'sistema-para-limpeza-conservacao': <SistemaParaLimpezaConservacao />,
  'sistema-para-dedetizacao': <SistemaParaDedetizacao />,
  // Módulos
  'os-digital': <OsDigital />,
  'sistema-pmoc': <SistemaPmoc />,
  'sistema-crm': <CrmModulo />,
  'controle-financeiro': <ControleFinanceiro />,
  'ponto-e-folha': <PontoEFolha />,
  'emissao-de-nfse': <EmissaoDeNfse />,
  'portal-do-cliente': <PortalDoCliente />,
  'controle-de-estoque': <ControleDeEstoque />,
  'orcamentos-e-contratos': <OrcamentosEContratos />,
  'rastreamento-de-equipes': <RastreamentoDeEquipes />,
  'area-do-tecnico': <AreaDoTecnico />,
};

/**
 * Gera as <Route> de segmento/módulo do bloco /:lang, com o slug de cada idioma
 * prefixado (PREFIXED_LOCALES). Uma rota por slug distinto, por key. Os paths
 * são RELATIVOS ao /:lang (sem barra inicial), como o React Router espera.
 */
export function localizedSegmentModuleRoutes(): ReactElement[] {
  const routes: ReactElement[] = [];
  for (const key of Object.keys(WRAPPER_BY_KEY)) {
    const element = WRAPPER_BY_KEY[key];
    // Conjunto de slugs distintos entre os idiomas prefixados (hoje = { pt-br }).
    const slugs = new Set<string>();
    for (const loc of PREFIXED_LOCALES) slugs.add(slugFor(key, loc));
    for (const slug of slugs) {
      routes.push(<Route key={`${key}:${slug}`} path={slug} element={element} />);
    }
  }
  return routes;
}
