/**
 * Guarda do convite de upgrade (ModuleGateModal).
 *
 * O bug que estes testes existem pra impedir de voltar: até 18/10/2026 o
 * `ModuleRoute` renderizava `<Navigate>` e `<ModuleGateModal>` no MESMO retorno.
 * O `<Navigate>` trocava a location no primeiro effect, a rota desmontava e o
 * portal do Radix ia junto, então o modal vivia cerca de um frame e o convite
 * NUNCA aparecia. Quem não tinha o add-on era bloqueado certo, mas nunca recebia
 * a oferta, e isso valia pra todos os módulos pagos, inclusive `nfe`.
 *
 * É teste de código-fonte porque o defeito é de ESTRUTURA do componente, não de
 * saída renderizada: montar a árvore com react-router e esperar o modal sumir em
 * um frame é exatamente o tipo de teste que passa verde sem provar nada.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(`${process.cwd()}/src/App.tsx`, 'utf8');

const moduleRoute = (() => {
  const inicio = source.indexOf('function ModuleRoute(');
  expect(inicio, 'ModuleRoute sumiu de App.tsx').toBeGreaterThan(-1);
  const fim = source.indexOf('\nfunction ', inicio + 1);
  return source.slice(inicio, fim === -1 ? undefined : fim);
})();

describe('ModuleRoute entrega o convite de upgrade', () => {
  it('não renderiza <Navigate> junto do modal', () => {
    expect(moduleRoute).toContain('<ModuleGateModal');
    // A regressão: redirect em tempo de renderização mata o portal do modal.
    expect(moduleRoute).not.toMatch(/<Navigate\b/);
  });

  it('redireciona de forma imperativa, no fechamento', () => {
    // Imperativo é o que torna a ordem determinística contra o navigate do CTA
    // (que faz onOpenChange(false) e DEPOIS navega pra /assinatura).
    expect(moduleRoute).toMatch(/onOpenChange=\{\(open\) =>\s*\{\s*if \(!open\) navigate\(defaultRoute, \{ replace: true \}\)/);
    expect(moduleRoute).toContain('const navigate = useNavigate();');
  });

  it('não deixa estado morto de abertura', () => {
    // `open={true}` literal com um setGateOpen que ninguém lê era metade do bug:
    // dava impressão de que o fechamento funcionava.
    expect(moduleRoute).not.toContain('setGateOpen');
    expect(moduleRoute).not.toContain('open={true}');
  });

  it('passa o moduleCode, que é o que faz o CTA pré-marcar o módulo certo', () => {
    expect(moduleRoute).toContain('moduleCode={moduleKey}');
  });
});

describe('ModuleGateModal continua levando pra assinatura', () => {
  const modal = readFileSync(`${process.cwd()}/src/components/ModuleGateModal.tsx`, 'utf8');

  it('o CTA fecha e navega com o módulo pré-marcado', () => {
    expect(modal).toContain("navigate(`/assinatura?addModule=${encodeURIComponent(moduleCode)}`)");
  });

  it('nome e descrição vêm do catálogo do banco, não hardcoded', () => {
    expect(modal).toContain('useModuleCatalog');
    expect(modal).toContain('dbModule?.name');
  });
});
