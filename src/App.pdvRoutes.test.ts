// ─────────────────────────────────────────────────────────────────────────────
// Guarda do ROTEAMENTO do PDV depois da inversão de 18/10/2026.
//
// O QUE MUDOU: '/pdv' era a tela de VENDA (o carrinho). O CEO pediu que '/pdv'
// virasse o PAINEL DO CAIXA (`PdvCaixa`) e que a venda (`Pdv`) descesse pra
// sub-tela '/pdv/venda', alcançada só pelo botão "Nova venda" do painel.
//
// POR QUE ESTE TESTE EXISTE: a religação tem três pontos que falham CALADOS.
//  1. O botão "Nova venda" (em `PdvCaixa.tsx`) navega pro path pt-br LITERAL
//     '/pdv/venda'. Se a key `pdvSale` não estiver no registro de rotas, o clique
//     cai no NotFound — e só pra quem clicar, nunca no build.
//  2. A venda é uma rota do PDV como qualquer outra: sem `ModuleRoute` em volta,
//     empresa que não contratou o add-on alcança a venda por URL direta mesmo com
//     o menu escondido. O gate de módulo tem que embrulhar AS DUAS.
//  3. A ordem dos guards (ModuleRoute POR FORA do PermissionRoute) é o que faz o
//     convite de upgrade aparecer no PDV — ver o comentário no App.tsx e
//     App.moduleGate.test.ts. Trocar a ordem "pra ficar igual ao CRM" volta o bug.
//
// É teste de código-fonte (igual App.moduleGate.test.ts) porque o defeito é de
// ESTRUTURA de rota: montar a árvore de rotas de verdade exigiria mockar auth,
// módulos e permissões, e é justamente o tipo de teste que passa verde sem provar
// que o `<Route>` existe.
// ─────────────────────────────────────────────────────────────────────────────

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { localizedTemplatesFor } from '@/lib/i18n/appRouteSlugs';
import { SCREEN_TO_MODULE_MAP } from '@/hooks/useCompanyModules';

const source = readFileSync(`${process.cwd()}/src/App.tsx`, 'utf8');

/** A linha de `localizedAppRoutes` de uma key (é uma linha só por rota). */
function routeLine(key: string): string {
  const re = new RegExp(`^.*localizedAppRoutes\\('${key}',.*$`, 'm');
  const match = source.match(re);
  expect(match, `rota '${key}' não está registrada em App.tsx`).not.toBeNull();
  return match![0];
}

describe('registro de rotas do PDV (painel x venda)', () => {
  it('a venda tem rota própria em /pdv/venda', () => {
    expect(localizedTemplatesFor('pdvSale')).toContain('/pdv/venda');
  });

  it('o path pt-br literal usado pelo botão "Nova venda" resolve', () => {
    // `PdvCaixa.tsx` navega pra esta string crua. A lei do i18n de rotas diz que
    // o path pt-br vale em TODOS os idiomas porque `localizedTemplatesFor` sempre
    // registra o base pt-br primeiro; este assert é o que sustenta a premissa.
    const caixa = readFileSync(`${process.cwd()}/src/pages/PdvCaixa.tsx`, 'utf8');
    const alvo = caixa.match(/const PDV_SALE_PATH = '([^']+)'/);
    expect(alvo, 'PDV_SALE_PATH sumiu de PdvCaixa.tsx').not.toBeNull();
    expect(localizedTemplatesFor('pdvSale')).toContain(alvo![1]);
  });

  it('a venda responde nos 4 idiomas (pt-br + en/es/fr)', () => {
    const templates = localizedTemplatesFor('pdvSale');
    expect(templates).toContain('/pdv/venda'); // pt-br (canônico)
    expect(templates).toContain('/pos/sale'); // en
    expect(templates).toContain('/pos/venta'); // es
    expect(templates).toContain('/pos/vente'); // fr
    // 4 variantes DISTINTAS: nenhum idioma colide com outro (se colidissem, o
    // dedup entregaria menos de 4 e um idioma ficaria sem slug próprio).
    expect(new Set(templates).size).toBe(4);
  });

  it('a venda NÃO sombreia nem é sombreada pelo painel', () => {
    // '/pdv' (1 segmento) e '/pdv/venda' (2) são templates distintos; o registro
    // casa o mais específico primeiro. Se alguém trocar a base da venda por algo
    // com 1 segmento, o painel passaria a atender a venda em silêncio.
    for (const tpl of localizedTemplatesFor('pdvSale')) {
      expect(localizedTemplatesFor('pdv')).not.toContain(tpl);
      expect(tpl.split('/').filter(Boolean)).toHaveLength(2);
    }
  });
});

describe('elementos das rotas do PDV', () => {
  it('/pdv renderiza o PAINEL (PdvCaixa), não o carrinho', () => {
    const linha = routeLine('pdv');
    expect(linha).toContain('<PdvCaixa />');
    // `<Pdv />` é o carrinho; se voltar pra raiz, a inversão foi desfeita.
    expect(linha).not.toMatch(/<Pdv\s*\/>/);
  });

  it('/pdv/venda renderiza a tela de VENDA (Pdv)', () => {
    expect(routeLine('pdvSale')).toMatch(/<Pdv\s*\/>/);
  });

  it('as duas páginas entram por lazy import, no padrão das outras', () => {
    expect(source).toContain('const PdvCaixa = React.lazy(() => import("./pages/PdvCaixa"));');
    expect(source).toContain('const Pdv = React.lazy(() => import("./pages/Pdv"));');
  });
});

describe('gate das rotas do PDV', () => {
  const PDV_ROUTE_KEYS = ['pdv', 'pdvSale', 'pdvCashHistory', 'pdvReports', 'pdvSettings'] as const;

  it('toda rota do PDV está embrulhada no ModuleRoute moduleKey="pdv"', () => {
    for (const key of PDV_ROUTE_KEYS) {
      expect(routeLine(key), `rota '${key}' sem gate de módulo`).toContain(
        '<ModuleRoute moduleKey="pdv">',
      );
    }
  });

  it('o ModuleRoute fica POR FORA do PermissionRoute (convite de upgrade)', () => {
    // Invertido de propósito em relação a CRM/Contratos: as telas do PDV estão em
    // SCREEN_TO_MODULE_MAP, então `hasScreen` já é false sem o add-on e o
    // PermissionRoute redirecionaria ANTES do ModuleRoute montar o convite.
    for (const key of PDV_ROUTE_KEYS) {
      const linha = routeLine(key);
      const moduleIdx = linha.indexOf('<ModuleRoute');
      const permissionIdx = linha.indexOf('<PermissionRoute');
      expect(moduleIdx, `rota '${key}': ModuleRoute precisa abrir antes`).toBeGreaterThan(-1);
      expect(permissionIdx).toBeGreaterThan(moduleIdx);
    }
  });

  it('painel e venda compartilham a MESMA screen:pdv', () => {
    // Decisão 18/10/2026: quem opera o caixa vende. Uma 'screen:pdv_sale' própria
    // obrigaria o admin a marcar duas permissões pro mesmo fluxo, e esquecer a
    // segunda entregaria um caixa que não vende.
    expect(routeLine('pdv')).toContain('screenKey="screen:pdv"');
    expect(routeLine('pdvSale')).toContain('screenKey="screen:pdv"');
    // E a screen compartilhada continua gateada pelo módulo (default-allow do
    // `hasScreen` pega quem está FORA do mapa).
    expect(SCREEN_TO_MODULE_MAP['screen:pdv']).toBe('pdv');
  });

  it('não nasceu uma screen:pdv_sale paralela sem gate de módulo', () => {
    // Se um dia a key existir (papel "confere o caixa mas não vende"), ela TEM que
    // entrar no SCREEN_TO_MODULE_MAP junto, senão nasce liberada por default.
    if ('screen:pdv_sale' in SCREEN_TO_MODULE_MAP) {
      expect(SCREEN_TO_MODULE_MAP['screen:pdv_sale']).toBe('pdv');
    } else {
      // Procura o USO como gate (não a menção em comentário, que é legítima).
      expect(source).not.toContain('screenKey="screen:pdv_sale"');
    }
  });
});

describe('destino padrão do balconista', () => {
  it('cai no PAINEL do caixa, não num carrinho vazio', () => {
    expect(source).toContain("['screen:pdv', '/pdv']");
    // '/pdv' é o painel (provado acima) e é o último candidato do appCandidates:
    // quem tem agenda/OS/clientes continua caindo onde caía.
    const candidatos = source.slice(
      source.indexOf('const appCandidates'),
      source.indexOf('for (const [key, path] of appCandidates)'),
    );
    expect(candidatos).not.toContain("'/pdv/venda'");
  });
});
