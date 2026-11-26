import { describe, expect, it, vi } from 'vitest';
import {
  PUBLIC_LINK_KINDS,
  buildPublicLinkHead,
  createPublicLinkHandler,
  injectPublicLinkHead,
} from '../../functions/_lib/public-link-render.js';

const shell = `<!doctype html><html><head>
  <title>Dominex | Sistema de Ordem de Serviço</title>
  <meta name="description" content="Sistema de ordem de serviço digital">
  <meta name="robots" content="index, follow">
  <link rel="canonical" href="https://www.dominex.app/">
  <meta property="og:title" content="Dominex">
  <meta property="og:image" content="https://www.dominex.app/images/og-social.jpg">
  <meta name="twitter:image" content="https://www.dominex.app/images/og-social.jpg">
  <script type="application/ld+json">{"@type":"SoftwareApplication"}</script>
</head><body><div id="root"></div></body></html>`;

const tenantMeta = {
  company_name: 'Clima Exemplo',
  social_image_url: 'https://cdn.example.com/social.jpg',
  social_image_is_composed: true,
};

describe('head social dos links públicos', () => {
  it('troca título, descrição e arte da Dominex pelos do tenant no link de cobrança', () => {
    const html = injectPublicLinkHead(shell, 'pagar', tenantMeta, 'https://www.dominex.app/pagar/abc');

    expect(html).toContain('<title>Pagamento · Clima Exemplo</title>');
    expect(html).toContain('property="og:site_name" content="Clima Exemplo"');
    expect(html).toContain('property="og:image" content="https://cdn.example.com/social.jpg"');
    expect(html).toContain('property="og:image:type" content="image/jpeg"');
    expect(html).toContain('property="og:image:width" content="1200"');
    expect(html).toContain('content="noindex, nofollow, noarchive"');
    expect(html).not.toContain('Dominex');
    expect(html).not.toContain('/images/og-social.jpg');
    expect(html).not.toContain('SoftwareApplication');
  });

  it('cobre todos os tipos de link com título próprio e sem citar a Dominex', () => {
    for (const kind of Object.keys(PUBLIC_LINK_KINDS)) {
      const head = buildPublicLinkHead(kind, tenantMeta);
      expect(head?.title).toMatch(/ · Clima Exemplo$/);
      expect(`${head?.title} ${head?.description}`).not.toMatch(/dominex/i);
      expect(head?.description).toContain('Clima Exemplo');
    }
  });

  it('usa a arte padrão quando o tenant não tem White Label, sem dimensões compostas', () => {
    const html = injectPublicLinkHead(shell, 'portal', {
      company_name: 'Clima Padrão',
      social_image_url: 'https://www.dominex.app/images/og-social.jpg',
      social_image_is_composed: false,
    }, 'https://www.dominex.app/portal/abc');

    expect(html).toContain('<title>Portal do Cliente · Clima Padrão</title>');
    expect(html).toContain('property="og:image" content="https://www.dominex.app/images/og-social.jpg"');
    expect(html).not.toContain('property="og:image:width"');
  });

  it('link que não resolve fica sem imagem e sem marca de terceiros', () => {
    const html = injectPublicLinkHead(shell, 'orcamento', null, 'https://www.dominex.app/orcamento/x');

    expect(html).toContain('<title>Orçamento</title>');
    expect(html).not.toContain('property="og:image"');
    expect(html).not.toContain('Dominex');
  });

  it('preserva a indexação do portal do contrato e da validação de certificado', () => {
    for (const kind of ['contrato', 'certificado']) {
      const html = injectPublicLinkHead(shell, kind, tenantMeta, 'https://www.dominex.app/x');
      expect(html).toContain('name="robots" content="index, follow"');
      expect(html).not.toContain('noindex');
    }
  });

  it('escapa o nome da empresa no head', () => {
    const html = injectPublicLinkHead(shell, 'pagar', {
      ...tenantMeta,
      company_name: 'A "B" <script>',
    }, 'https://www.dominex.app/pagar/abc');

    expect(html).not.toContain('<script>');
    expect(html).toContain('A &quot;B&quot; &lt;script&gt;');
  });

  it('tipo desconhecido devolve o shell intacto', () => {
    expect(injectPublicLinkHead(shell, 'inexistente', tenantMeta, 'https://x')).toBe(shell);
  });
});

describe('Pages Function dos links públicos', () => {
  const request = new Request('https://www.dominex.app/pagar/empresa-abcdefghjkmn');

  it('devolve a requisição ao roteamento normal quando o shell falha (o checkout nunca cai)', async () => {
    const fallback = new Response('spa');
    const next = vi.fn().mockResolvedValue(fallback);
    const env = { ASSETS: { fetch: vi.fn().mockResolvedValue(new Response('', { status: 500 })) } };

    const response = await createPublicLinkHandler('pagar', 'code')({
      env, request, params: { code: 'empresa-abcdefghjkmn' }, next,
    });

    expect(next).toHaveBeenCalledOnce();
    expect(response).toBe(fallback);
  });

  it('entrega o shell com head neutro quando não há credencial do banco', async () => {
    const next = vi.fn();
    const env = { ASSETS: { fetch: vi.fn().mockResolvedValue(new Response(shell)) } };

    const response = await createPublicLinkHandler('pagar', 'code')({
      env, request, params: { code: 'empresa-abcdefghjkmn' }, next,
    });
    const html = await response.text();

    expect(next).not.toHaveBeenCalled();
    expect(response.headers.get('X-Robots-Tag')).toContain('noindex');
    expect(html).toContain('<title>Pagamento</title>');
    expect(html).toContain('rel="canonical" href="https://www.dominex.app/pagar/empresa-abcdefghjkmn"');
  });

  it('não intercepta métodos que não sejam leitura', async () => {
    const next = vi.fn().mockResolvedValue(new Response('ok'));
    await createPublicLinkHandler('pagar', 'code')({
      env: {}, request: new Request(request.url, { method: 'POST' }), params: { code: 'x' }, next,
    });
    expect(next).toHaveBeenCalledOnce();
  });
});
