import {
  sanitizeBlogHtml as sanitizeSharedBlogHtml,
  stripDuplicateLeadingTitle as stripSharedDuplicateLeadingTitle,
} from '../../functions/_lib/blog-content.js';

/** Funcoes compartilhadas com SSG, Cloudflare e Vercel. */
export function sanitizeBlogHtml(content: string): string {
  return sanitizeSharedBlogHtml(content);
}

export function stripDuplicateLeadingTitle(content: string, title: string): string {
  return stripSharedDuplicateLeadingTitle(content, title);
}
