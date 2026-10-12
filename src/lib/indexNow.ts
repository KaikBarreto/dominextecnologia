import type { LocaleCode } from '@/lib/i18n/locales';

const SITE_URL = 'https://www.dominex.app';

export function publicBlogPostUrl(locale: LocaleCode, slug: string): string {
  const cleanSlug = slug.trim().replace(/^\/+|\/+$/g, '');
  return locale === 'pt-br'
    ? `${SITE_URL}/blog/${cleanSlug}`
    : `${SITE_URL}/${locale}/blog/${cleanSlug}`;
}

/**
 * Avisa Bing/IndexNow depois de publicar ou atualizar um artigo. A indexação é
 * best-effort: indisponibilidade do buscador nunca desfaz a publicação salva.
 */
export async function notifyIndexNow(urls: string[]): Promise<boolean> {
  try {
    const response = await fetch('/api/indexnow', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ urls }),
    });
    return response.ok;
  } catch {
    return false;
  }
}
