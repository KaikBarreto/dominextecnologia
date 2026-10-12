import { afterEach, describe, expect, it, vi } from 'vitest';
import { notifyIndexNow, publicBlogPostUrl } from '@/lib/indexNow';
import { normalizePublicBlogUrls } from '../../functions/_lib/indexnow.js';

describe('IndexNow', () => {
  afterEach(() => vi.restoreAllMocks());

  it('monta a URL pública localizada do artigo', () => {
    expect(publicBlogPostUrl('pt-br', '/meu-artigo/')).toBe('https://www.dominex.app/blog/meu-artigo');
    expect(publicBlogPostUrl('en', 'my-article')).toBe('https://www.dominex.app/en/blog/my-article');
  });

  it('aceita somente artigos públicos no domínio canônico', () => {
    expect(normalizePublicBlogUrls([
      'https://www.dominex.app/en/blog/my-article?utm_source=test',
      'https://evil.example/en/blog/my-article',
      'https://www.dominex.app/admin/blog/secret',
    ])).toEqual(['https://www.dominex.app/en/blog/my-article']);
  });

  it('envia a URL ao endpoint interno sem bloquear a publicação', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 202 }));
    const url = publicBlogPostUrl('es', 'mi-articulo');

    await expect(notifyIndexNow([url])).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledWith('/api/indexnow', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ urls: [url] }),
    }));
  });
});
