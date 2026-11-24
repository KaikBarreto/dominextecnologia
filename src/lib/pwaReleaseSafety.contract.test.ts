import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const readRootFile = (file: string) =>
  readFileSync(resolve(process.cwd(), file), 'utf8');

describe('contrato de atualização segura do PWA', () => {
  it('usa o shell canônico sem precachear o index que redireciona', () => {
    const viteConfig = readRootFile('vite.config.ts');

    expect(viteConfig).toContain('navigateFallback: "/"');
    expect(viteConfig).toContain('"**/index.html"');
    expect(viteConfig).toContain('{ url: "/", revision: `dominex-${APP_VERSION}` }');
    expect(viteConfig).toContain('"/sw-origin-guard.js"');
  });

  it('precacheia somente o shell e guarda chunks de rota sob demanda', () => {
    const viteConfig = readRootFile('vite.config.ts');

    expect(viteConfig).toContain('"assets/app-entry-*.js"');
    expect(viteConfig).toContain('"assets/index-*.css"');
    expect(viteConfig).toContain('entryFileNames: "assets/app-entry-[hash].js"');
    expect(viteConfig).toContain('cacheName: "dominex-build-assets"');
    expect(viteConfig).toContain('handler: "StaleWhileRevalidate"');
    expect(viteConfig).not.toContain('"**/*.{js,css,html,ico,png,svg,woff2,otf}"');
  });

  it('mantém os scripts do service worker sem cache HTTP', () => {
    const config = JSON.parse(readRootFile('vercel.json')) as {
      redirects?: Array<{ has?: Array<{ type?: string; value?: string }> }>;
      headers?: Array<{ source?: string; headers?: Array<{ key?: string; value?: string }> }>;
    };

    const redirectsLegacyOrigin = config.redirects?.some((redirect) =>
      redirect.has?.some((condition) =>
        condition.type === 'host' && condition.value === 'dominex.app'));
    expect(redirectsLegacyOrigin).toBe(false);

    const swHeaders = config.headers?.find((entry) => entry.source === '/sw.js')?.headers ?? [];
    expect(swHeaders).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'Cache-Control', value: expect.stringContaining('no-store') }),
      expect.objectContaining({ key: 'Service-Worker-Allowed', value: '/' }),
    ]));

    const cloudflareHeaders = readRootFile('public/_headers');
    expect(cloudflareHeaders).toContain('/sw.js');
    expect(cloudflareHeaders).toContain('Cache-Control: no-store');
    expect(cloudflareHeaders).toContain('Service-Worker-Allowed: /');
  });

  it('recupera a origem antiga antes de carregar o React', () => {
    const html = readRootFile('index.html');
    const guard = readRootFile('public/sw-origin-guard.js');

    expect(html).toContain("location.hostname!=='dominex.app'");
    expect(html).toContain("'https://www.dominex.app'");
    expect(html.indexOf("location.hostname!=='dominex.app'")).toBeLessThan(
      html.indexOf('<script type="module" src="/src/main.tsx"></script>'),
    );
    expect(guard).toContain("self.location.hostname !== 'dominex.app'");
    expect(guard).toContain('registration.unregister()');
    expect(guard).not.toContain("addEventListener('fetch'");
  });
});
