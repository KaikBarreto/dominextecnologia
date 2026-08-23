/**
 * Cabeçalho e rodapé canônicos de documentos PDF/HTML do sistema Dominex.
 *
 * Espelha fielmente o padrão de `movimentacoesReportHtmlGenerator.ts`
 * (funções `buildHeader`, `buildCompanyDetails` e `buildDominexFooter`),
 * mas com estilos INLINE para funcionar em qualquer documento sem depender
 * de stylesheet externa.
 *
 * Use estas funções em qualquer gerador de documento que precise de:
 *  - Logo + dados da empresa respeitando os toggles `show_*_in_documents`
 *  - Rodapé "Desenvolvido por Dominex · dominex.app" que some no white-label
 */

import type { CompanySettings } from '@/hooks/useCompanySettings';
import { escapeHtml } from '@/utils/escapeHtml';
import { DOMINEX_LOGO_BLACK_BASE64 } from '@/utils/dominexLogoBase64';
import { cpfCnpjMask, phoneMask } from '@/utils/masks';

// ── Helpers internos ──────────────────────────────────────────────────────────

/**
 * Monta as linhas de detalhes da empresa (endereço, contato, documento)
 * respeitando cada toggle `show_*_in_documents`.
 */
function buildDetails(s: CompanySettings): string {
  const lines: string[] = [];

  // Toggles seguem o padrão da EcoSistema (`!== false` = exibir por padrão).
  if (s.show_address_in_documents !== false && s.address) {
    let a = escapeHtml(s.address);
    if (s.address_number) a += `, ${escapeHtml(s.address_number)}`;
    if (s.complement) a += ` ${escapeHtml(s.complement)}`;
    if (s.neighborhood) a += ` - ${escapeHtml(s.neighborhood)}`;
    if (s.city) a += ` - ${escapeHtml(s.city)}`;
    if (s.state) a += `/${escapeHtml(s.state)}`;
    if (s.zip_code) a += ` - CEP: ${escapeHtml(s.zip_code)}`;
    lines.push(a);
  }

  const contact: string[] = [];
  if (s.show_phone_in_documents !== false && s.phone) contact.push(`Tel: ${escapeHtml(phoneMask(s.phone))}`);
  if (s.show_email_in_documents !== false && s.email) contact.push(escapeHtml(s.email));
  if (contact.length) lines.push(contact.join(' | '));

  if (s.show_cnpj_in_documents !== false && s.document) {
    const digits = s.document.replace(/\D/g, '');
    const label = digits.length <= 11 ? 'CPF' : 'CNPJ';
    lines.push(`${label}: ${escapeHtml(cpfCnpjMask(s.document))}`);
  }

  return lines.join('<br>');
}

// ── Exports públicos ──────────────────────────────────────────────────────────

/**
 * Gera o bloco HTML de cabeçalho da empresa com estilos inline.
 *
 * Inclui:
 *  - Logo (`settings.logo_url`) com `onerror` para sumir se a URL quebrar
 *  - Nome da empresa (respeitando `show_name_in_documents`)
 *  - Endereço, telefone, e-mail e documento (respeitando cada toggle)
 *
 * Retorna `''` se `settings` for null/undefined.
 */
export function buildCompanyDocumentHeader(settings: CompanySettings | null | undefined): string {
  if (!settings) return '';

  const s = settings;
  const showName = s.show_name_in_documents !== false && s.name;

  // Estrutura/estilos espelham EXATAMENTE o cabeçalho de documentos da EcoSistema
  // (financialDreHtmlGenerator / employeeReceiptHtmlGenerator): logo à esquerda
  // (max 70x200), nome 18px bold #1a1a1a, detalhes 11px #666, borda inferior 2px.
  const logo = s.logo_url
    ? `<div style="display:flex;align-items:center;justify-content:flex-start;flex-shrink:0;">` +
      `<img src="${escapeHtml(s.logo_url)}" alt="Logo" ` +
      `style="max-height:70px;max-width:200px;width:auto;height:auto;object-fit:contain;" ` +
      `onerror="this.style.display='none'">` +
      `</div>`
    : '';

  const details = buildDetails(s);

  const infoBlock =
    `<div style="flex:1;min-width:0;">` +
    (showName
      ? `<div style="font-size:18px;font-weight:700;color:#1a1a1a;margin-bottom:4px;">${escapeHtml(s.name)}</div>`
      : '') +
    (details
      ? `<div style="font-size:11px;color:#666;line-height:1.5;">${details}</div>`
      : '') +
    `</div>`;

  return (
    `<div style="display:flex;gap:16px;` +
    `padding-bottom:16px;border-bottom:2px solid #e5e5e5;margin-bottom:20px;">` +
    logo +
    infoBlock +
    `</div>`
  );
}

/**
 * Gera o bloco HTML do rodapé "Desenvolvido por Dominex · dominex.app"
 * com estilos inline.
 *
 * Retorna `''` quando `whiteLabel` for `true` (tenant white-label não
 * deve ver a marca Dominex).
 */
export function buildDominexDocumentFooter(whiteLabel: boolean): string {
  if (whiteLabel) return '';
  return (
    `<div style="border-top:1px solid #e5e7eb;margin-top:32px;padding-top:12px;text-align:center;">` +
    `<img src="${DOMINEX_LOGO_BLACK_BASE64}" alt="Dominex" ` +
    `style="height:18px;opacity:0.5;display:block;margin:0 auto 6px;">` +
    `<p style="font-size:10px;color:#9ca3af;margin:0;">Desenvolvido por Dominex · dominex.app</p>` +
    `</div>`
  );
}
