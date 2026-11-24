import { describe, expect, it } from 'vitest';
import { injectPublicContractPortalHead } from '../../functions/_lib/public-contract-portal-render.js';

const shell = `<!doctype html><html><head>
  <title>Dominex</title>
  <meta name="description" content="Dominex">
  <link rel="canonical" href="https://www.dominex.app/">
  <meta property="og:image" content="https://www.dominex.app/images/og-social.jpg">
  <meta name="twitter:image" content="https://www.dominex.app/images/og-social.jpg">
  <script type="application/ld+json">{"@type":"SoftwareApplication"}</script>
</head><body><div id="root"></div></body></html>`;

describe('head social do Portal do Contrato', () => {
  it('usa a arte social do tenant White Label e remove a marca genérica', () => {
    const html = injectPublicContractPortalHead(shell, {
      company_name: 'Clima Exemplo',
      white_label_enabled: true,
      social_image_url: 'https://cdn.example.com/portal-social.png',
      social_image_is_composed: true,
    }, 'https://www.dominex.app/contrato/unidade/portal-abc');

    expect(html).toContain('<title>Portal do Contrato · Clima Exemplo</title>');
    expect(html).toContain('property="og:image" content="https://cdn.example.com/portal-social.png"');
    expect(html).toContain('property="og:image:width" content="1200"');
    expect(html).not.toContain('/images/og-social.jpg');
    expect(html).not.toContain('SoftwareApplication');
  });

  it('usa o logo como fallback e nunca volta à imagem Dominex no White Label', () => {
    const html = injectPublicContractPortalHead(shell, {
      company_name: 'Clima Exemplo',
      white_label_enabled: true,
      social_image_url: 'https://cdn.example.com/logo.png',
      social_image_is_composed: false,
    }, 'https://www.dominex.app/contrato/unidade/portal-def');

    expect(html).toContain('property="og:image" content="https://cdn.example.com/logo.png"');
    expect(html).not.toContain('/images/og-social.jpg');
    expect(html).not.toContain('property="og:image:width"');
  });

  it('mantém a arte padrão quando não é White Label', () => {
    const html = injectPublicContractPortalHead(shell, {
      company_name: 'Clima Padrão',
      white_label_enabled: false,
      social_image_url: null,
      social_image_is_composed: false,
    }, 'https://www.dominex.app/contrato/unidade/portal-ghi');

    expect(html).toContain('property="og:image" content="https://www.dominex.app/images/og-social.jpg"');
  });

  it('remove a imagem fixa quando o token não resolve', () => {
    const html = injectPublicContractPortalHead(shell, null, 'https://www.dominex.app/contrato/unidade/invalido');
    expect(html).not.toContain('/images/og-social.jpg');
    expect(html).not.toContain('property="og:image"');
  });
});
