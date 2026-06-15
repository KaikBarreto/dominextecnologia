import jsPDF from 'jspdf';
import { DOMINEX_LOGO_BLACK_BASE64 } from './dominexLogoBase64';
import {
  TERMS_SECTIONS,
  DOMINEX_LEGAL,
  TERMS_INTRO,
  TERMS_META_LINE,
} from '@/data/termsOfUse';
import { openPdfInTab } from './openPdfInTab';

// ── Paleta ──────────────────────────────────────────────────────────────────
// Tudo em preto/cinza, espelhando o modal: títulos NÃO são coloridos.
const BODY: [number, number, number] = [31, 41, 55]; // cinza-900 (corpo + títulos)
const MUTED: [number, number, number] = [107, 114, 128]; // cinza-500 (listas/rodapé)

const FOOTER_LINE = `${DOMINEX_LEGAL.site}  |  ${DOMINEX_LEGAL.razaoSocial}  |  CNPJ: ${DOMINEX_LEGAL.cnpj}`;

/** Carrega a logo (data URL base64) e devolve dimensões reais pra preservar aspecto. */
function loadLogo(): Promise<{ src: string; width: number; height: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () =>
      resolve({ src: DOMINEX_LOGO_BLACK_BASE64, width: img.width, height: img.height });
    // Fallback de proporção caso o onload não dispare (ex: ambiente sem DOM).
    img.onerror = () => resolve({ src: DOMINEX_LOGO_BLACK_BASE64, width: 1920, height: 390 });
    img.src = DOMINEX_LOGO_BLACK_BASE64;
  });
}

/**
 * Tokeniza um texto com marcadores `**negrito**` em segmentos.
 * Cada segmento carrega se é bold ou não — usado pra desenhar inline preservando
 * o negrito mesmo após a quebra de linha manual.
 */
function tokenizeBold(text: string): Array<{ text: string; bold: boolean }> {
  const out: Array<{ text: string; bold: boolean }> = [];
  const parts = text.split(/(\*\*.*?\*\*)/g);
  for (const part of parts) {
    if (!part) continue;
    if (part.startsWith('**') && part.endsWith('**')) {
      out.push({ text: part.slice(2, -2), bold: true });
    } else {
      out.push({ text: part, bold: false });
    }
  }
  return out;
}

/**
 * Gera o PDF do Termo de Uso do Dominex replicando o estilo do modal.
 * Texto selecionável (não html2canvas), paginação limpa, rodapé + numeração em
 * todas as páginas. Lê a FONTE ÚNICA em src/data/termsOfUse.ts.
 */
async function buildTermsDoc(): Promise<jsPDF> {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  const pageWidth = doc.internal.pageSize.getWidth(); // 210
  const pageHeight = doc.internal.pageSize.getHeight(); // 297
  const marginX = 20;
  const marginTop = 18;
  const marginBottom = 22; // espaço reservado pro rodapé
  const contentWidth = pageWidth - marginX * 2;
  const lineHeight = 4.6;

  let y = marginTop;

  // ── Helpers de escrita ──────────────────────────────────────────────────
  const ensureSpace = (needed: number) => {
    if (y + needed > pageHeight - marginBottom) {
      doc.addPage();
      y = marginTop;
    }
  };

  /** Desenha uma sequência de tokens (com bold inline) com word-wrap manual. */
  const drawRichParagraph = (
    tokens: Array<{ text: string; bold: boolean }>,
    x: number,
    width: number,
    fontSize: number,
    color: [number, number, number],
  ) => {
    doc.setFontSize(fontSize);
    doc.setTextColor(color[0], color[1], color[2]);

    let cursorX = x;
    ensureSpace(lineHeight);

    const writeWord = (word: string, bold: boolean, isFirstOfLine: boolean) => {
      doc.setFont('helvetica', bold ? 'bold' : 'normal');
      const piece = isFirstOfLine ? word : ' ' + word;
      const w = doc.getTextWidth(piece);
      if (cursorX + w > x + width && cursorX > x) {
        // quebra de linha
        y += lineHeight;
        ensureSpace(lineHeight);
        cursorX = x;
        const ww = doc.getTextWidth(word);
        doc.text(word, cursorX, y);
        cursorX += ww;
      } else {
        doc.text(piece, cursorX, y);
        cursorX += w;
      }
    };

    let firstOfLine = true;
    for (const token of tokens) {
      const words = token.text.split(/\s+/).filter((w) => w.length > 0);
      for (const word of words) {
        writeWord(word, token.bold, firstOfLine);
        firstOfLine = false;
      }
    }
    y += lineHeight;
  };

  /** Parágrafo simples sem negrito (usa splitTextToSize nativo). */
  const drawPlainParagraph = (
    text: string,
    x: number,
    width: number,
    fontSize: number,
    color: [number, number, number],
    style: 'normal' | 'bold' = 'normal',
    align: 'left' | 'center' = 'left',
  ) => {
    doc.setFontSize(fontSize);
    doc.setFont('helvetica', style);
    doc.setTextColor(color[0], color[1], color[2]);
    const lines = doc.splitTextToSize(text, width) as string[];
    for (const line of lines) {
      ensureSpace(lineHeight);
      if (align === 'center') {
        doc.text(line, x + width / 2, y, { align: 'center' });
      } else {
        doc.text(line, x, y, { align: 'left' });
      }
      y += lineHeight;
    }
  };

  // ── Cabeçalho: logo centralizado ─────────────────────────────────────────
  const logo = await loadLogo();
  const logoWidth = 60;
  const logoHeight = (logo.height / logo.width) * logoWidth;
  doc.addImage(
    logo.src,
    'PNG',
    (pageWidth - logoWidth) / 2,
    y,
    logoWidth,
    logoHeight,
  );
  y += logoHeight + 6;

  // Título centralizado, maiúsculas, bold, PRETO (não colorido)
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(BODY[0], BODY[1], BODY[2]);
  const titleLines = doc.splitTextToSize(
    'TERMOS DE USO — DOMINEX',
    contentWidth,
  ) as string[];
  for (const line of titleLines) {
    doc.text(line, pageWidth / 2, y, { align: 'center' });
    y += 6;
  }

  // separador (cinza neutro)
  y += 1;
  doc.setDrawColor(220, 220, 220);
  doc.setLineWidth(0.3);
  doc.line(marginX, y, pageWidth - marginX, y);
  y += 5;

  // Subtítulo introdutório (texto do modal)
  drawPlainParagraph(TERMS_INTRO, marginX, contentWidth, 9, MUTED, 'normal', 'center');
  y += 1.5;

  // Linha de metadados: versão + data (mesma string da tela, fonte única)
  drawPlainParagraph(TERMS_META_LINE, marginX, contentWidth, 8, MUTED, 'normal', 'center');
  y += 4;

  // ── Seções ───────────────────────────────────────────────────────────────
  for (const section of TERMS_SECTIONS) {
    // Título de seção (bold, uppercase) — preto, idêntico ao <h2> do modal.
    ensureSpace(lineHeight + 6);
    y += 2;
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(BODY[0], BODY[1], BODY[2]);
    const sectionLines = doc.splitTextToSize(
      section.title.toUpperCase(),
      contentWidth,
    ) as string[];
    for (const line of sectionLines) {
      ensureSpace(lineHeight);
      doc.text(line, marginX, y);
      y += 5.2;
    }
    y += 1;

    for (const item of section.items) {
      if (item.text) {
        // subtitle em negrito (se houver) + texto (com bold inline)
        const tokens: Array<{ text: string; bold: boolean }> = [
          ...(item.subtitle ? [{ text: item.subtitle, bold: true }] : []),
          ...tokenizeBold((item.subtitle ? ' ' : '') + item.text),
        ];
        drawRichParagraph(tokens, marginX, contentWidth, 9, BODY);
      } else if (item.subtitle) {
        drawRichParagraph([{ text: item.subtitle, bold: true }], marginX, contentWidth, 9, BODY);
      }

      // lista com marcador, recuada
      if (item.list) {
        for (const listItem of item.list) {
          const bulletIndent = 4;
          const listX = marginX + bulletIndent;
          const listWidth = contentWidth - bulletIndent;
          ensureSpace(lineHeight);
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(9);
          doc.setTextColor(MUTED[0], MUTED[1], MUTED[2]);
          doc.text('•', marginX + 1, y);
          drawRichParagraph(tokenizeBold(listItem), listX, listWidth, 9, MUTED);
        }
      }
      y += 1.5;
    }
  }

  // ── Rodapé em todas as páginas ────────────────────────────────────────────
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    const footerY = pageHeight - 12;
    doc.setDrawColor(220, 220, 220);
    doc.setLineWidth(0.2);
    doc.line(marginX, footerY - 4, pageWidth - marginX, footerY - 4);

    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(MUTED[0], MUTED[1], MUTED[2]);
    doc.text(FOOTER_LINE, pageWidth / 2, footerY, { align: 'center' });
    doc.text(`Página ${p} de ${totalPages}`, pageWidth / 2, footerY + 4, {
      align: 'center',
    });
  }

  return doc;
}

/**
 * Gera o PDF do Termo de Uso do Dominex e devolve como Blob.
 * Mantido para compatibilidade com quem já consome o blob diretamente.
 */
export async function generateTermsOfUsePdfBlob(): Promise<Blob> {
  const doc = await buildTermsDoc();
  return doc.output('blob');
}

/**
 * Baixa o PDF do Termo de Uso DIRETAMENTE com o nome correto.
 * Usa `doc.save(...)`, que cria um `<a download="...">` e clica nele — download
 * direto, sem abrir o visualizador nativo do navegador (que ignoraria o nome e
 * salvaria com o UUID do blob URL).
 */
export async function downloadTermsOfUsePdf(): Promise<void> {
  const doc = await buildTermsDoc();
  doc.save('TERMOS DE USO - DOMINEX.pdf');
}

/**
 * Gera o PDF e abre na aba (desktop) / wrapper navegável (mobile).
 * O nome do arquivo baixado é "TERMOS DE USO - DOMINEX.pdf" — o openPdfInTab
 * sanitiza mantendo letras/espaços/hífens e anexa ".pdf".
 * (Mantido por compatibilidade; o botão "Baixar PDF" usa downloadTermsOfUsePdf.)
 */
export async function openTermsOfUsePdf(): Promise<void> {
  const blob = await generateTermsOfUsePdfBlob();
  openPdfInTab(blob, 'TERMOS DE USO - DOMINEX');
}
