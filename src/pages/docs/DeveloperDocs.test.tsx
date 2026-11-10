import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import DeveloperDocs from './DeveloperDocs';
import { DOC_ARTICLES, DOC_NAV_GROUPS } from './docsContent';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('DeveloperDocs', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
    vi.stubGlobal('scrollTo', vi.fn());
    window.localStorage.clear();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    document.body.innerHTML = '';
    vi.unstubAllGlobals();
  });

  it('posiciona a API para qualquer aplicação e mantém WhatsApp como exemplo', () => {
    act(() => root.render(
      <MemoryRouter initialEntries={['/docs']}>
        <DeveloperDocs />
      </MemoryRouter>,
    ));

    expect(container.textContent).toContain('conectar qualquer aplicação');
    expect(container.textContent).toContain('Criar uma ordem de serviço');
    expect(container.textContent).toContain('Exemplo: WhatsApp');
    expect(container.querySelector('a[href="/docs/guias/criar-os"]')).not.toBeNull();
  });

  it('renderiza o guia genérico com prompt seguro e atualiza os metadados', () => {
    act(() => root.render(
      <MemoryRouter initialEntries={['/docs/guias/criar-os']}>
        <DeveloperDocs />
      </MemoryRouter>,
    ));

    expect(container.querySelector('h1')?.textContent).toBe('Criar uma ordem de serviço');
    expect(container.textContent).toContain('CRM, ERP, portal, formulário, automação, chatbot ou agente de IA');
    expect(container.textContent).toContain('Sem segredos reais no prompt');
    expect(document.title).toBe('Criar uma ordem de serviço | Dominex Developers');
    expect(document.querySelector('link[rel="canonical"]')?.getAttribute('href'))
      .toContain('/docs/guias/criar-os');
    expect(document.querySelector('link[data-dominex-llms]')?.getAttribute('href'))
      .toBe('https://www.dominex.app/docs/llms.txt');
  });

  it('documenta criação e gestão idempotente de cards do CRM', () => {
    act(() => root.render(
      <MemoryRouter initialEntries={['/docs/guias/cards-crm']}>
        <DeveloperDocs />
      </MemoryRouter>,
    ));

    expect(container.querySelector('h1')?.textContent).toBe('Gerenciar cards do CRM');
    expect(container.textContent).toContain('POST e PATCH exigem Idempotency-Key');
    expect(container.textContent).toContain('/crm/cards/by-external-id/{external_id}');
    expect(container.querySelector('.docs-method.is-patch')?.textContent).toBe('PATCH');
  });

  it('oferece snippets por linguagem e mantém o prompt como ação secundária', () => {
    act(() => root.render(
      <MemoryRouter initialEntries={['/docs/guias/acompanhar-os']}>
        <DeveloperDocs />
      </MemoryRouter>,
    ));

    const tabs = [...container.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
    expect(tabs.map((tab) => tab.textContent)).toEqual(['Node.js', 'Python', 'PHP']);
    expect(tabs[0].getAttribute('aria-selected')).toBe('true');

    act(() => tabs[1].click());
    expect(tabs[1].getAttribute('aria-selected')).toBe('true');
    expect(container.querySelector('.docs-code-card code')?.textContent).toContain('from urllib.request');

    const expand = [...container.querySelectorAll<HTMLButtonElement>('button')]
      .find((button) => button.textContent?.includes('Expandir exemplo'));
    expect(expand).toBeDefined();
    act(() => expand?.click());
    expect(expand?.getAttribute('aria-expanded')).toBe('true');
    expect(container.textContent).toContain('Copiar prompt para IA');
    expect(container.querySelector('.docs-prompt-body')).toBeNull();
  });

  it('combina ilustração, fluxo, resposta resumida e dúvidas expansíveis', () => {
    act(() => root.render(
      <MemoryRouter initialEntries={['/docs/api/erros-e-limites']}>
        <DeveloperDocs />
      </MemoryRouter>,
    ));

    const image = container.querySelector<HTMLImageElement>('.docs-article-visual img');
    expect(image?.getAttribute('src')).toBe('/docs/images/rate-limit-resilience.jpg');
    expect(image?.getAttribute('alt')).toContain('Fila de requisições');
    expect(container.querySelectorAll('.docs-flow li')).toHaveLength(4);
    expect(container.querySelector('.docs-response-status')?.textContent).toContain('429');
    expect(container.querySelectorAll('.docs-details-list details')).toHaveLength(3);
  });

  it('mantém rotas únicas e a navegação apontando para conteúdo existente', () => {
    const routes = DOC_ARTICLES.map((article) => article.path);
    expect(new Set(routes).size).toBe(routes.length);

    const knownRoutes = new Set(['/docs', ...routes]);
    for (const group of DOC_NAV_GROUPS) {
      for (const item of group.items) {
        expect(knownRoutes.has(item.path), item.path).toBe(true);
      }
    }

    const primaryGuide = DOC_NAV_GROUPS
      .find((group) => group.label === 'GUIAS POR OBJETIVO')
      ?.items.at(0);
    expect(primaryGuide).toEqual({ label: 'Criar uma OS', path: '/docs/guias/criar-os' });
  });
});
