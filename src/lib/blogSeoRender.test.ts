import { describe, expect, it } from 'vitest';
import { injectHeadSeo as injectCloudflareHead } from '../../functions/_lib/blog-render.js';
import { injectHeadSeo as injectVercelHead } from '../../api/blog-post.js';
import { stripDuplicateLeadingTitle } from '../../functions/_lib/blog-content.js';

const shell = `<!doctype html>
<html lang="pt-BR"><head>
  <title>Home</title>
  <meta name="description" content="Home description">
  <link rel="canonical" href="https://www.dominex.app/" />
  <meta property="og:type" content="website" />
  <meta property="og:locale" content="pt_BR" />
  <meta property="og:image" content="https://www.dominex.app/images/og-social.jpg">
  <meta property="og:image:alt" content="Dominex" />
  <meta name="twitter:card" content="summary_large_image" />
  <script type="application/ld+json">{"@context":"https://schema.org","@type":"SoftwareApplication"}</script>
  <script type="application/ld+json">{"@context":"https://schema.org","@type":"FAQPage"}</script>
  <script type="application/ld+json">{"@context":"https://schema.org","@type":"Organization","name":"Dominex"}</script>
  <script type="application/ld+json">{"@context":"https://schema.org","@type":"WebSite","name":"Dominex"}</script>
</head><body><div id="root"></div></body></html>`;

const post = {
  slug: 'field-service-guide',
  locale: 'en',
  title: 'Field Service Guide',
  excerpt: 'A practical field service guide.',
  cover_image_url: '/images/blog/covers/field-service-guide.jpg',
  author_name: 'Dominex',
  published_at: '2026-10-10T12:00:00Z',
  updated_at: '2026-10-12T12:00:00Z',
};

const alternates = [
  { locale: 'pt-br', slug: 'guia-servicos-campo' },
  { locale: 'en', slug: 'field-service-guide' },
];

describe('SEO do render dinâmico do blog', () => {
  it.each([
    ['Cloudflare', injectCloudflareHead],
    ['Vercel', injectVercelHead],
  ])('%s substitui o head da home pelo head completo do artigo', (_, injectHead) => {
    const html = injectHead(shell, post, 'en', alternates);

    expect(html).toContain('<html lang="en">');
    expect(html).toContain('<meta property="og:locale" content="en_US" />');
    expect(html).not.toContain('content="pt_BR"');
    expect(html).toContain('https://www.dominex.app/images/blog/covers/field-service-guide.jpg');
    expect(html).toContain('"@type":"BreadcrumbList"');
    expect(html).toContain('"@type":"BlogPosting"');
    expect(html).toContain('"@type":"Organization","@id":"https://www.dominex.app/#organization"');
    expect(html).toContain('https://www.dominex.app/images/dominex-author-avatar.jpg');
    expect(html).not.toContain('"@type":"SoftwareApplication"');
    expect(html).not.toContain('"@type":"FAQPage"');
    expect(html).toContain('"@type":"WebSite"');
    expect(html).toContain('hreflang="x-default" href="https://www.dominex.app/blog/guia-servicos-campo"');
  });

  it('marca um autor nominal como Person', () => {
    const html = injectCloudflareHead(shell, { ...post, author_name: 'Ana Silva' }, 'en', alternates);
    expect(html).toContain('"author":{"@type":"Person","name":"Ana Silva"}');
  });

  it('mantém somente o H1 do layout no HTML dinâmico para crawlers', () => {
    const content = '<h1>Field Service Guide</h1><p>Direct answer.</p>';
    expect(stripDuplicateLeadingTitle(content, post.title)).toBe('<p>Direct answer.</p>');
  });
});
