import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { sanitizeBlogHtml } from './blogContent';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('sanitizeBlogHtml', () => {
  it('remove scripts, corpos executáveis, eventos, srcdoc e URLs javascript', () => {
    const dirty = `
      <script>alert('script')</script>
      <style>body{display:none}</style>
      <p onclick="alert('click')">Texto seguro</p>
      <img src="javascript:alert('img')" onerror="alert('error')" alt="Imagem">
      <a href="javascript:alert('link')">Link</a>
      <iframe src="https://evil.example/embed/Qs4PPytCASY" srcdoc="<script>alert(1)</script>"></iframe>
    `;

    const clean = sanitizeBlogHtml(dirty);

    expect(clean).toContain('<p>Texto seguro</p>');
    expect(clean).not.toMatch(/script|onclick|onerror|javascript:|srcdoc|evil\.example/i);
  });

  it('aceita somente embed do YouTube e normaliza para privacidade aprimorada', () => {
    const clean = sanitizeBlogHtml(`
      <iframe src="https://www.youtube.com/embed/Qs4PPytCASY" title="Vídeo ANEEL"></iframe>
      <iframe src="https://player.example/embed/Qs4PPytCASY" title="Inválido"></iframe>
    `);

    expect(clean).toContain('src="https://www.youtube-nocookie.com/embed/Qs4PPytCASY"');
    expect(clean).toContain('title="Vídeo ANEEL"');
    expect(clean).toContain('loading="lazy"');
    expect(clean).toContain('referrerpolicy="strict-origin-when-cross-origin"');
    expect(clean.match(/<iframe/g)).toHaveLength(1);
    expect(clean).not.toContain('player.example');
  });

  it('preserva SVG estático e remove SVG ativo ou capaz de carregar HTML', () => {
    const clean = sanitizeBlogHtml(`
      <svg viewBox="0 0 100 40" onclick="alert(1)">
        <defs><linearGradient id="grad"><stop offset="0" stop-color="#00c597"></stop></linearGradient></defs>
        <rect width="100" height="40" fill="#00c597"></rect>
        <foreignObject><script>alert(1)</script><p>HTML perigoso</p></foreignObject>
        <use href="javascript:alert(1)"></use>
      </svg>
    `);

    expect(clean).toContain('<svg viewbox="0 0 100 40">');
    expect(clean).toContain('<rect width="100" height="40" fill="#00c597"></rect>');
    expect(clean).not.toMatch(/onclick|foreignobject|script|<use|javascript:/i);
  });

  it('preserva estilos editoriais seguros e descarta CSS com URL', () => {
    const safe = sanitizeBlogHtml(
      '<div class="blog-pattern" style="margin:28px 0;padding:22px;border-radius:14px;background:#073b31;color:#fff">Conteúdo</div>',
    );
    const unsafe = sanitizeBlogHtml(
      '<div style="color:#fff;background:url(javascript:alert(1));padding:10px">Conteúdo</div>',
    );

    expect(safe).toContain('class="blog-pattern"');
    expect(safe).toContain('background:#073b31');
    expect(safe).toContain('padding:22px');
    expect(unsafe).not.toMatch(/url\s*\(|javascript:/i);
  });

  it('está conectado a todas as superfícies públicas e ao editor', () => {
    expect(read('src/pages/BlogPost.tsx')).toMatch(/sanitizeBlogHtml\(\s*replaceRegistrationCtas/);
    expect(read('functions/_lib/blog-render.js')).toMatch(/sanitizeBlogHtml\(\s*stripDuplicateLeadingTitle/);
    expect(read('api/blog-post.js')).toMatch(/sanitizeBlogHtml\(\s*stripDuplicateLeadingTitle/);
    expect(read('src/pages/admin/AdminBlogEditor.tsx')).toContain('content: sanitizeBlogHtml(content)');
    expect(read('src/components/admin/blog/BlogEditorToolbar.tsx')).toContain('sanitizeBlogHtml(infographicHtml)');
    expect(read('src/components/admin/blog/extensions/InfographicNode.ts')).toContain('sanitizeBlogHtml(node.attrs.html');
  });
});
