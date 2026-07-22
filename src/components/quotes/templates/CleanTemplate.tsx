import type { ProposalTemplateProps } from './types';
import { useLocaleFormatters } from '@/lib/format/hooks';
import { MESSAGES } from '@/lib/i18n';
import {
  buildProposalData,
  colorAdjust,
  flagOn,
  formatValidUntil,
  hasDisplacement,
  sumTotal,
} from './shared';
import type { QuoteItem } from '@/hooks/useQuotes';

/**
 * Clean — proposta comercial ENXUTA em documento BRANCO (não segue o tema do
 * usuário; documento é sempre claro, régua "relatório/documento é branco").
 *
 * É o template DEFAULT de novos orçamentos. Poucas seções, sem capa dedicada
 * nem página de encerramento: cabeçalho da empresa → cliente → tabela de
 * Serviços → tabela de Produtos/materiais → totais → informações adicionais →
 * rodapé com a marca do tenant. Os botões Aprovar/Rejeitar são injetados por
 * FORA (ProposalPublic.tsx) quando status==='enviado' — este template só deixa
 * um respiro no rodapé pra eles.
 *
 * White-label: a marca exibida é SEMPRE a do tenant (company/customization).
 */
export function CleanTemplate(props: ProposalTemplateProps) {
  const { quote, company, customization } = props;
  const { money, locale, timezone } = useLocaleFormatters();
  const t = MESSAGES[locale].app.crm.proposalPdf;

  const d = buildProposalData(props, {
    companyFallback: t.companyFallback,
    subjectFallback: t.subjectFallback,
  });

  const primary = customization?.primary_color || '#0f172a';
  const validUntil = formatValidUntil(quote, locale, timezone);
  const showDisplacement = flagOn(customization?.show_displacement) && hasDisplacement(quote);

  const servicesTotal = sumTotal(d.serviceItems);
  const materialsTotal = sumTotal(d.materialItems);
  const discountAmount = quote.discount_amount ?? 0;
  const displacementCost = quote.displacement_cost ?? 0;

  const ItemsTable = ({ title, rows }: { title: string; rows: QuoteItem[] }) => {
    if (rows.length === 0) return null;
    const total = sumTotal(rows);
    return (
      <div className="mt-7">
        <div className="flex items-center gap-2 mb-2.5">
          <span className="h-3.5 w-1 rounded-full" style={{ background: primary, ...colorAdjust }} />
          <h3 className="text-[13px] font-bold uppercase tracking-[0.14em]" style={{ color: primary }}>{title}</h3>
        </div>
        <div className="overflow-hidden rounded-lg" style={{ border: '1px solid #e5e7eb' }}>
          <table className="w-full text-[13px]" style={{ borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f8fafc' }}>
                <th className="text-left font-semibold px-4 py-2.5" style={{ color: '#475569', borderBottom: '1px solid #e5e7eb' }}>{t.cleanColItem}</th>
                <th className="text-right font-semibold px-3 py-2.5 whitespace-nowrap" style={{ color: '#475569', borderBottom: '1px solid #e5e7eb' }}>{t.cleanColUnitPrice}</th>
                <th className="text-right font-semibold px-3 py-2.5 whitespace-nowrap" style={{ color: '#475569', borderBottom: '1px solid #e5e7eb' }}>{t.cleanColQty}</th>
                <th className="text-right font-semibold px-4 py-2.5 whitespace-nowrap" style={{ color: '#475569', borderBottom: '1px solid #e5e7eb' }}>{t.cleanColSubtotal}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((item, i) => (
                <tr key={item.id ?? i} style={{ background: i % 2 === 1 ? '#fafbfc' : '#fff' }}>
                  <td className="px-4 py-3 align-top" style={{ color: '#0f172a', borderBottom: '1px solid #f1f5f9' }}>
                    <span className="font-medium">{item.description}</span>
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums align-top whitespace-nowrap" style={{ color: '#334155', borderBottom: '1px solid #f1f5f9' }}>
                    {money(item.unit_price || 0)}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums align-top whitespace-nowrap" style={{ color: '#334155', borderBottom: '1px solid #f1f5f9' }}>
                    {item.quantity}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums font-semibold align-top whitespace-nowrap" style={{ color: '#0f172a', borderBottom: '1px solid #f1f5f9' }}>
                    {money(item.total_price || 0)}
                  </td>
                </tr>
              ))}
              <tr style={{ background: '#f8fafc' }}>
                <td className="px-4 py-2.5 text-right font-semibold uppercase tracking-wide text-[11px]" colSpan={3} style={{ color: '#64748b' }}>
                  {title}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums font-bold whitespace-nowrap" style={{ color: '#0f172a' }}>
                  {money(total)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  const hasItems = d.allItems.length > 0;

  return (
    <div
      className="clean-root mx-auto"
      style={{ fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif", maxWidth: '794px', width: '100%', background: '#ffffff' }}
    >
      <style>{`
        .clean-page { width: 100%; max-width: 794px; background: #ffffff; color: #0f172a; padding: 48px 52px; }
        @media (max-width: 640px) { .clean-page { padding: 28px 20px; } }
        @media print { .clean-page { padding: 48px 52px; } }
      `}</style>

      <section className="clean-page">
        {/* ── Cabeçalho: empresa ── */}
        <div className="flex items-start justify-between gap-6 flex-wrap">
          <div className="min-w-0 flex items-start gap-4">
            {d.logoUrl ? (
              <img src={d.logoUrl} alt={d.companyName} className="h-14 w-auto object-contain shrink-0" crossOrigin="anonymous" />
            ) : null}
            <div className="min-w-0">
              <p className="text-xl font-black leading-tight" style={{ color: '#0f172a' }}>{d.companyName}</p>
              {company?.document && <p className="text-xs mt-1" style={{ color: '#64748b' }}>CNPJ {company.document}</p>}
              <div className="text-xs mt-1 leading-relaxed" style={{ color: '#64748b' }}>
                {company?.phone && <p>{company.phone}</p>}
                {company?.email && <p>{company.email}</p>}
                {d.addressLine && <p className="mt-0.5">{d.addressLine}</p>}
              </div>
            </div>
          </div>
          <div className="text-right shrink-0">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em]" style={{ color: primary }}>{t.cleanDocTitle}</p>
            <p className="text-sm font-semibold mt-1" style={{ color: '#0f172a' }}>{t.cleanQuoteNumber} {quote.quote_number}</p>
            {validUntil && (
              <p className="text-xs mt-1" style={{ color: '#64748b' }}>{t.cleanValidUntil} {validUntil}</p>
            )}
          </div>
        </div>

        <div className="mt-6 h-px w-full" style={{ background: '#e5e7eb', ...colorAdjust }} />

        {/* ── Bloco Cliente ── */}
        <div className="mt-6">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em]" style={{ color: primary }}>{t.cleanClientLabel}</p>
          <p className="text-base font-bold mt-1.5" style={{ color: '#0f172a' }}>{d.clientName}</p>
          <div className="text-xs mt-1 leading-relaxed" style={{ color: '#64748b' }}>
            {d.clientDoc && <p>{d.clientDoc}</p>}
            {d.clientPhone && <p>{d.clientPhone}</p>}
            {d.clientEmail && <p>{d.clientEmail}</p>}
          </div>
        </div>

        {/* ── Tabelas ── */}
        {hasItems ? (
          <>
            <ItemsTable title={t.cleanServicesTitle} rows={d.serviceItems} />
            <ItemsTable title={t.cleanMaterialsTitle} rows={d.materialItems} />
          </>
        ) : (
          <p className="mt-7 text-sm text-center py-8 rounded-lg" style={{ color: '#94a3b8', border: '1px dashed #e5e7eb' }}>
            {t.cleanEmptyItems}
          </p>
        )}

        {/* ── Totais ── */}
        {hasItems && (
          <div className="mt-7 flex justify-end">
            <div className="w-full sm:w-80 space-y-2">
              {d.serviceItems.length > 0 && (
                <Row label={t.cleanTotalServices} value={money(servicesTotal)} />
              )}
              {d.materialItems.length > 0 && (
                <Row label={t.cleanTotalMaterials} value={money(materialsTotal)} />
              )}
              {(quote.subtotal ?? 0) > 0 && (discountAmount > 0 || showDisplacement) && (
                <Row label={t.cleanSubtotal} value={money(quote.subtotal ?? 0)} />
              )}
              {showDisplacement && (
                <Row
                  label={`${t.cleanDisplacement}${(quote.distance_km ?? 0) > 0 ? ` (${quote.distance_km} km)` : ''}`}
                  value={money(displacementCost)}
                />
              )}
              {discountAmount > 0 && (
                <Row label={t.cleanDiscount} value={`− ${money(discountAmount)}`} negative primary={primary} />
              )}
              <div className="pt-2 mt-1" style={{ borderTop: '2px solid #0f172a' }}>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold uppercase tracking-wide" style={{ color: '#0f172a' }}>{t.cleanTotal}</span>
                  <span className="text-2xl font-black tabular-nums" style={{ color: primary }}>{money(quote.total_value ?? 0)}</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Informações adicionais ── */}
        {(quote.terms || quote.notes) && (
          <div className="mt-9 space-y-4">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em]" style={{ color: primary }}>{t.cleanInfoTitle}</p>
            {quote.terms && (
              <div className="rounded-lg p-4" style={{ background: '#f8fafc', border: '1px solid #e5e7eb' }}>
                <p className="text-[11px] font-bold uppercase tracking-wide mb-1.5" style={{ color: '#64748b' }}>{t.cleanTermsTitle}</p>
                <p className="text-sm whitespace-pre-wrap leading-relaxed" style={{ color: '#334155' }}>{quote.terms}</p>
              </div>
            )}
            {quote.notes && (
              <div className="rounded-lg p-4" style={{ background: '#f8fafc', border: '1px solid #e5e7eb' }}>
                <p className="text-[11px] font-bold uppercase tracking-wide mb-1.5" style={{ color: '#64748b' }}>{t.cleanNotesTitle}</p>
                <p className="text-sm whitespace-pre-wrap leading-relaxed" style={{ color: '#334155' }}>{quote.notes}</p>
              </div>
            )}
          </div>
        )}

        {/* ── Rodapé: profissional/marca do tenant ── */}
        <div className="mt-10 pt-6" style={{ borderTop: '1px solid #e5e7eb' }}>
          <p className="text-[11px] uppercase tracking-[0.18em] font-semibold" style={{ color: '#94a3b8' }}>{t.cleanFooterPrepared}</p>
          <div className="mt-2 flex items-center gap-3 flex-wrap">
            {d.logoUrl ? (
              <img src={d.logoUrl} alt={d.companyName} className="h-8 w-auto object-contain" crossOrigin="anonymous" />
            ) : null}
            <div>
              <p className="text-sm font-bold" style={{ color: '#0f172a' }}>{d.companyName}</p>
              <div className="text-xs" style={{ color: '#64748b' }}>
                {company?.phone && <span>{company.phone}</span>}
                {company?.phone && company?.email && <span> · </span>}
                {company?.email && <span>{company.email}</span>}
              </div>
            </div>
          </div>
        </div>

        {/* Respiro pra os botões Aprovar/Rejeitar injetados por fora (ProposalPublic). */}
        <div className="h-2" />
      </section>
    </div>
  );
}

function Row({ label, value, negative, primary }: { label: string; value: string; negative?: boolean; primary?: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span style={{ color: '#64748b' }}>{label}</span>
      <span className="tabular-nums font-medium" style={{ color: negative ? (primary || '#0f172a') : '#334155' }}>{value}</span>
    </div>
  );
}
