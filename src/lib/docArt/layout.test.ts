import { describe, expect, it, vi } from 'vitest';
import { paginateDocArt } from './layout';
import { resolveDocArt, mmToPt, ptToMm } from './resolve';
import { logoPlateFromPixels, logoPlateFromPng, UNKNOWN_LOGO_PLATE } from './logoContrast';
import { DOC_ART_TEMPLATES } from './templates';
import type { ResolvedDocArt, ResolvedTextShape } from './types';
import { deflateSync } from 'node:zlib';
import { Blob as NodeBlob } from 'node:buffer';
import { readFileSync } from 'node:fs';

const measure = (text: string, { size }: { size: number }) => Array.from(text).length * size * 0.5;
const measures = { sans: measure, display: measure };
const textShapes = (pages: ResolvedDocArt[]) => pages.flatMap(page => page.shapes.filter((s): s is ResolvedTextShape => s.kind === 'text'));
const content = (pages: ResolvedDocArt[], slot: ResolvedTextShape['slot']) => textShapes(pages)
  .filter(shape => shape.slot === slot).flatMap(shape => shape.lines ?? [])
  .flatMap(line => line.pieces.map(piece => piece.text)).join('').replace(/\s/g, '');

describe('certificados com conteúdo variável', () => {
  it.each(DOC_ART_TEMPLATES)('$slug mantém todo o conteúdo longo, com nomes e identificadores extensos', template => {
    const body = `${'Empresa com razão social longa e endereço extenso. '.repeat(150)} FIM-DO-CONTEÚDO`;
    const responsible = 'Responsável Técnico com Sobrenome Extenso '.repeat(5);
    const footer = 'CNPJ' + '1234567890'.repeat(35);
    const art = resolveDocArt(template, { slots: { corpo: body, assinaturaNome: responsible, rodape: footer } });
    const pages = paginateDocArt(art, measures);
    expect(pages.length).toBeGreaterThan(1);
    expect(content(pages, 'corpo')).toBe(body.replace(/\s/g, ''));
    expect(content(pages, 'assinaturaNome')).toBe(responsible.replace(/\s/g, ''));
    expect(content(pages, 'rodape')).toBe(footer);
    for (const shape of textShapes(pages)) {
      for (const [index, line] of (shape.lines ?? []).entries()) {
        expect(line.width, `${template.slug}/${shape.slot}`).toBeLessThanOrEqual(mmToPt(shape.w) + 0.001);
        const bottom = shape.y + ptToMm(index * shape.lineHeight + shape.size + (shape.paragraphSpacing ?? 0) * line.paragraphIndex);
        expect(bottom, `${template.slug}/${shape.slot}`).toBeLessThanOrEqual(art.page.h - 10);
      }
    }
  });

  it.each(DOC_ART_TEMPLATES)('$slug preserva caixas de texto sem sobreposição no primeiro certificado', template => {
    const art = resolveDocArt(template, {}, { substitute: html => html.replace(/<span[^>]*><\/span>/g, 'Demonstração') });
    const page = paginateDocArt(art, measures)[0];
    const boxes = textShapes([page]);
    for (const [index, a] of boxes.entries()) {
      for (const b of boxes.slice(index + 1)) {
        if (!a.h || !b.h) continue;
        const intersects = a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
        expect(intersects, `${template.slug}: ${a.slot} / ${b.slot}`).toBe(false);
      }
    }
  });
});

describe('contraste de logos', () => {
  const pixels = (...values: number[]) => new Uint8Array(values);
  it('mantém texto branco sobre fundo escuro e texto preto sobre fundo branco', () => {
    expect(logoPlateFromPixels(pixels(0, 0, 0, 0, 255, 255, 255, 255))).toBe('#111815');
    expect(logoPlateFromPixels(pixels(0, 0, 0, 0, 0, 0, 0, 255))).toBe('#ffffff');
  });
  it('não impõe plaqueta a imagens opacas e mantém legível logo misto', () => {
    expect(logoPlateFromPixels(pixels(0, 0, 0, 255, 255, 255, 255, 255))).toBeNull();
    expect(logoPlateFromPixels(pixels(0, 0, 0, 0, 0, 0, 0, 255, 255, 255, 255, 255))).toBe(UNKNOWN_LOGO_PLATE);
  });
  it.each([
    ['logo-white-horizontal.png', '#111815'],
    ['logo-black-horizontal.png', '#ffffff'],
  ])('reconhece o logo real %s, inclusive PNG indexado', async (name, expected) => {
    vi.stubGlobal('Blob', NodeBlob);
    try {
      const png = readFileSync(`src/assets/${name}`);
      expect(await logoPlateFromPng(png)).toBe(expected);
    } finally {
      vi.unstubAllGlobals();
    }
  });
  it('decodifica bytes PNG reais com canal alfa nos dois runtimes', async () => {
    vi.stubGlobal('Blob', NodeBlob);
    const chunk = (type: string, data: Uint8Array) => {
      const out = Buffer.alloc(data.length + 12);
      out.writeUInt32BE(data.length); out.write(type, 4); out.set(data, 8);
      return out;
    };
    const header = Buffer.alloc(13);
    header.writeUInt32BE(2); header.writeUInt32BE(1, 4); header[8] = 8; header[9] = 6;
    const png = Buffer.concat([
      Buffer.from([137,80,78,71,13,10,26,10]), chunk('IHDR', header),
      chunk('IDAT', deflateSync(Buffer.from([0,0,0,0,0,255,255,255,255]))), chunk('IEND', Buffer.alloc(0)),
    ]);
    try {
      expect(await logoPlateFromPng(png)).toBe('#111815');
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
