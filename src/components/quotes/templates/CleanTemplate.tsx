import type { ProposalTemplateProps } from './types';
import { getProposalSections } from './types';
import { useLocaleFormatters } from '@/lib/format/hooks';
import { formatTime } from '@/lib/format';
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
  const { money, date: fmtDate, locale, timezone } = useLocaleFormatters();
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

  // ── Opções de pagamento calculadas a partir do total final (quote.total_value)
  const totalValue = quote.total_value ?? 0;
  const discountRate = quote.card_discount_rate ?? 0;
  const installments = quote.card_installments ?? 0;
  const pixValue = discountRate > 0 ? totalValue * (1 - discountRate / 100) : null;
  const installmentValue = installments > 1 ? totalValue / installments : null;
  const hasPaymentOptions = totalValue > 0 && (pixValue !== null || installmentValue !== null);

  // ── Rodapé: data/hora de geração (created_at) no fuso da empresa (America/Sao_Paulo)
  const generatedDate = quote.created_at ? fmtDate(quote.created_at) : null;
  const generatedTime = quote.created_at ? formatTime(quote.created_at, locale, timezone) : null;

  // ── Seções configuráveis (ligar/desligar + ordem + texto default da empresa) ──
  // O texto do ORÇAMENTO tem prioridade sobre o customText da empresa; seção sem
  // conteúdo (nem quote nem default) simplesmente não é renderizada.
  const sections = getProposalSections(customization);
  const sectionByKey = new Map(sections.map((s) => [s.key, s]));
  const aberturaSec = sectionByKey.get('abertura');
  const aberturaText = aberturaSec?.enabled ? (aberturaSec.customText?.trim() || '') : '';

  // Título de cada seção de texto renderizada pós-Totais.
  const sectionTitle: Record<string, string> = {
    informacoes: t.cleanInfoTitle,
    observacoes: t.cleanNotesTitle,
    sobre: t.cleanSectionSobre,
    garantia: t.cleanSectionGarantia,
    // `abertura`/`encerramento` são renderizadas sem título (mensagem corrida).
  };

  // Resolve o texto efetivo de uma seção de texto (quote > empresa > vazio).
  const resolveSectionText = (key: string, customText?: string): string => {
    const fromQuote =
      key === 'informacoes' ? quote.terms :
      key === 'observacoes' ? quote.notes :
      null;
    return (fromQuote?.trim() || customText?.trim() || '');
  };

  const ItemsTable = ({ title, rows }: { title: string; rows: QuoteItem[] }) => {
    if (rows.length === 0) return null;
    const total = sumTotal(rows);
    return (
      <div className="mt-7 clean-block">
        <div className="flex items-center gap-2 mb-2.5">
          <span className="h-3.5 w-1 rounded-full" style={{ background: primary, ...colorAdjust }} />
          <h3 className="text-[13px] font-bold uppercase tracking-[0.14em]" style={{ color: primary }}>{title}</h3>
        </div>
        <div className="clean-table-wrap rounded-lg" style={{ border: '1px solid #e5e7eb' }}>
          <table className="clean-table w-full text-[13px]" style={{ borderCollapse: 'collapse' }}>
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
                    {item.details && (
                      <p className="text-[12px] leading-snug mt-1 whitespace-pre-wrap" style={{ color: '#64748b' }}>
                        {item.details}
                      </p>
                    )}
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
        /* Tabela contida: em telas estreitas rola só a tabela, sem estourar a página. */
        .clean-table-wrap { overflow-x: auto; overflow-y: hidden; -webkit-overflow-scrolling: touch; }
        .clean-table { min-width: 480px; }
        @media (max-width: 640px) {
          .clean-page { padding: 28px 16px; }
          /* Reduz paddings/fonte no mobile pra caber sem cortar valores. */
          .clean-table { font-size: 12px; min-width: 0; }
          .clean-table th, .clean-table td { padding-left: 8px !important; padding-right: 8px !important; }
        }
        @media print {
          .clean-page { padding: 48px 52px; }
          .clean-table-wrap { overflow: visible !important; }
          .clean-table { min-width: 0 !important; }
          .clean-block { break-inside: avoid; }
        }
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
              <span
                className="inline-flex items-center gap-1.5 mt-2 px-2.5 py-1 rounded-full text-[11px] font-semibold"
                style={{ background: `${primary}14`, color: primary, ...colorAdjust }}
              >
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: primary, ...colorAdjust }} />
                {t.cleanValidUntilBadge.replace('{date}', validUntil)}
              </span>
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

        {/* ── Abertura (mensagem de saudação, se ligada e com texto) ── */}
        {aberturaText && (
          <p className="mt-6 text-sm leading-relaxed whitespace-pre-wrap clean-block" style={{ color: '#334155' }}>
            {aberturaText}
          </p>
        )}

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

        {/* ── Seções configuráveis pós-Totais (na ordem definida na empresa) ── */}
        {sections
          .filter((sec) => sec.enabled && sec.key !== 'abertura')
          .map((sec) => {
            // Bloco de pagamento: calculado, sem texto editável.
            if (sec.key === 'pagamento') {
              if (!hasPaymentOptions) return null;
              return (
                <div key={sec.key} className="mt-9 clean-block">
                  <p className="text-[11px] font-bold uppercase tracking-[0.18em]" style={{ color: primary }}>{t.cleanPaymentTitle}</p>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    {pixValue !== null && (
                      <div className="rounded-lg p-4" style={{ background: '#f8fafc', border: '1px solid #e5e7eb' }}>
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-bold" style={{ color: '#0f172a' }}>{t.cleanPaymentPix}</p>
                          <span
                            className="shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide"
                            style={{ background: primary, color: '#ffffff', ...colorAdjust }}
                          >
                            {discountRate}% {t.cleanPaymentDiscount}
                          </span>
                        </div>
                        <p className="text-2xl font-black tabular-nums mt-2" style={{ color: primary }}>{money(pixValue)}</p>
                      </div>
                    )}
                    {installmentValue !== null && (
                      <div className="rounded-lg p-4" style={{ background: '#f8fafc', border: '1px solid #e5e7eb' }}>
                        <p className="text-sm font-bold" style={{ color: '#0f172a' }}>{t.cleanPaymentInstallmentsLabel}</p>
                        <p className="text-xl font-black tabular-nums mt-2" style={{ color: '#0f172a' }}>
                          {t.cleanPaymentInstallmentsValue
                            .replace('{count}', String(installments))
                            .replace('{value}', money(installmentValue))}
                        </p>
                        <p className="text-xs mt-1" style={{ color: '#64748b' }}>{t.cleanPaymentInstallmentsTotal}: {money(totalValue)}</p>
                      </div>
                    )}
                  </div>
                </div>
              );
            }

            // Seções de texto: quote > customText da empresa > não renderiza.
            const text = resolveSectionText(sec.key, sec.customText);
            if (!text) return null;
            const title = sectionTitle[sec.key];
            // `encerramento` é mensagem corrida, sem título nem card.
            if (sec.key === 'encerramento') {
              return (
                <p key={sec.key} className="mt-9 text-sm leading-relaxed whitespace-pre-wrap clean-block" style={{ color: '#334155' }}>
                  {text}
                </p>
              );
            }
            return (
              <div key={sec.key} className="mt-9 clean-block">
                {title && (
                  <p className="text-[11px] font-bold uppercase tracking-[0.18em] mb-3" style={{ color: primary }}>{title}</p>
                )}
                <div className="rounded-lg p-4" style={{ background: '#f8fafc', border: '1px solid #e5e7eb' }}>
                  <p className="text-sm whitespace-pre-wrap leading-relaxed" style={{ color: '#334155' }}>{text}</p>
                </div>
              </div>
            );
          })}

        {/* ── Rodapé: profissional/marca do tenant ── */}
        <div className="mt-10 pt-6 clean-block" style={{ borderTop: '1px solid #e5e7eb' }}>
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
          {generatedDate && generatedTime && (
            <p className="text-[11px] mt-4" style={{ color: '#94a3b8' }}>
              {t.cleanGeneratedAt.replace('{date}', generatedDate).replace('{time}', generatedTime)}
            </p>
          )}
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
