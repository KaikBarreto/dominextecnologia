import { describe, expect, it } from 'vitest';
import { injectPublicOsHead } from '../../functions/_lib/public-os-render.js';

const shell = `<!doctype html><html><head>
  <title>Dominex</title>
  <meta name="description" content="Dominex">
  <link rel="canonical" href="https://www.dominex.app/">
  <meta property="og:image" content="https://www.dominex.app/images/og-social.jpg">
  <meta name="twitter:image" content="https://www.dominex.app/images/og-social.jpg">
  <script type="application/ld+json">{"@type":"SoftwareApplication"}</script>
</head><body><div id="root"></div></body></html>`;

describe('head social da OS pública', () => {
  it('substitui a marca Dominex pela arte e nome do tenant', () => {
    const html = injectPublicOsHead(shell, {
      order_number: 1048,
      company_name: 'Clima Exemplo',
      social_image_url: 'https://cdn.example.com/os-social.jpg',
      social_image_is_composed: true,
    }, 'https://www.dominex.app/os-tecnico/os-abc');

    expect(html).toContain('<title>OS #1048 · Clima Exemplo</title>');
    expect(html).toContain('content="https://cdn.example.com/os-social.jpg"');
    expect(html).toContain('property="og:image:width" content="1200"');
    expect(html).toContain('content="noindex, nofollow, noarchive"');
    expect(html).not.toContain('/images/og-social.jpg');
    expect(html).not.toContain('SoftwareApplication');
  });

  it('remove a imagem fixa da Dominex quando a OS não resolve', () => {
    const html = injectPublicOsHead(shell, null, 'https://www.dominex.app/os-tecnico/invalida');
    expect(html).not.toContain('/images/og-social.jpg');
    expect(html).not.toContain('property="og:image"');
  });
});
