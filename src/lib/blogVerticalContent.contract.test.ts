import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { sanitizeBlogHtml } from './blogContent';

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20261112200000_blog_vertical_clusters_wave1.sql'),
  'utf8',
);

function article(tag: 'eletrica' | 'solar') {
  const match = migration.match(new RegExp(`\\$${tag}\\$([\\s\\S]*?)\\$${tag}\\$`));
  if (!match) throw new Error(`Conteúdo $${tag}$ não encontrado na migration`);
  return match[1];
}

function occurrences(value: string, pattern: RegExp) {
  return value.match(pattern)?.length ?? 0;
}

function wordCount(html: string) {
  const text = html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z0-9#]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return text.match(/[\p{L}\p{N}]+(?:[-'][\p{L}\p{N}]+)*/gu)?.length ?? 0;
}

describe('contrato editorial dos clusters verticais', () => {
  it.each([
    ['eletrica', 'checklist-ordem-de-servico-eletrica-nr10', '/sistema-para-eletricistas'],
    ['solar', 'manutencao-preventiva-energia-solar-checklist-om', '/sistema-para-energia-solar'],
  ] as const)('%s é um artigo rico, citável e conectado ao produto', (tag, slug, landing) => {
    const content = sanitizeBlogHtml(article(tag));

    expect(migration).toContain(`'${slug}'`);
    expect(wordCount(content)).toBeGreaterThanOrEqual(1_500);
    expect(occurrences(content, /<h2\b/gi)).toBeGreaterThanOrEqual(6);
    expect(occurrences(content, /<h2\b/gi)).toBeLessThanOrEqual(10);
    expect(occurrences(content, /<h3\b/gi)).toBeGreaterThanOrEqual(4);
    expect(occurrences(content, /href="https:\/\//gi)).toBeGreaterThanOrEqual(3);
    expect(occurrences(content, /href="\//gi)).toBeGreaterThanOrEqual(4);
    expect(content).toContain(`href="${landing}"`);
    expect(content).toContain('<h2 id="faq">');
    expect(content).toMatch(/Revisado em 12\/11\/2026 pela Equipe Dominex/);
    expect(content).not.toMatch(/<script\b|\son[a-z]+\s*=|javascript:|\ssrcdoc\s*=/i);
  });

  it('usa vídeo somente onde há fonte atual e com embed de privacidade aprimorada', () => {
    const eletrica = sanitizeBlogHtml(article('eletrica'));
    const solar = sanitizeBlogHtml(article('solar'));

    expect(eletrica).not.toContain('<iframe');
    expect(solar).toContain('https://www.youtube-nocookie.com/embed/Qs4PPytCASY');
    expect(solar).toMatch(/<iframe[^>]+title="[^"]+"[^>]+loading="lazy"/i);
    expect(solar).toContain('<figcaption>');
    expect(`${eletrica}${solar}`).not.toContain('https://www.youtube.com/embed/');
  });

  it('enriquece conteúdos existentes sem duplicar os blocos', () => {
    expect(migration).toContain('youtube-nocookie.com/embed/zL9gzpfX6_8');
    expect(migration).toContain('youtube-nocookie.com/embed/ofuPr0mkmNA');
    expect(migration).toContain("content NOT LIKE '%youtube-nocookie.com/embed/ofuPr0mkmNA%'");
  });

  it('mantém as meta descriptions da onda entre 110 e 160 caracteres', () => {
    const descriptions = [
      'Campos e exemplos para organizar uma ordem de serviço elétrica, checklist, evidências e histórico com atenção à NR-10 vigente.',
      'Checklist de manutenção preventiva de energia solar: ativos, inspeções, desempenho, evidências, pendências e relatório de O&M.',
    ];

    for (const description of descriptions) {
      expect(migration).toContain(`'${description}'`);
      expect(description.length).toBeGreaterThanOrEqual(110);
      expect(description.length).toBeLessThanOrEqual(160);
    }
  });
});
