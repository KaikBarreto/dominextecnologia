import type { ProposalTemplateProps } from './types';
import { formatDateTime } from '@/lib/format';
import { useLocaleFormatters } from '@/lib/format/hooks';
import { MESSAGES } from '@/lib/i18n';
import {
  buildProposalData,
  colorAdjust,
  pageFolioStyle,
  folioLabel,
  flagOn,
  formatValidUntil,
  hasDisplacement,
  hasGifts,
  buildScopeRows,
  paginateScope,
  SCOPE_ITEMS_FIRST_PAGE,
  SCOPE_ITEMS_PER_PAGE,
  type ScopeGroup,
} from './shared';

/**
 * Prisma — proposta comercial premium em A4 VERTICAL, fundo preto minimalista.
 * Inspirada na capa "Black and White 3D": preto com cubos de vidro 3D
 * iridescentes. A capa usa `/images/proposal-bg-prisma.jpg` como background (cover).
 *
 * Visual: preto/branco condensado, tipografia enorme em maiúsculas na capa,
 * páginas de conteúdo minimalistas com acento iridescente sutil.
 *
 * Páginas: Capa → Apresentação → Escopo → Investimento → Encerramento.
 * `.pr-page` = folha A4; quebra por página no print. Mobile vira fluxo contínuo.
 * White-label: marca do tenant; o logo é exibido puro (sem fundo/chip/filtro).
 */
const IRID = 'linear-gradient(120deg, #60a5fa, #c084fc, #f0abfc, #fbbf24)';

export function PrismaTemplate(props: ProposalTemplateProps) {
  const { quote, company, customization } = props;
  const { money, locale, timezone } = useLocaleFormatters();
  const t = MESSAGES[locale].app.crm.proposalPdf;

  const d = buildProposalData(props, {
    companyFallback: t.companyFallback,
    subjectFallback: t.subjectFallback,
  });

  const installments = d.installments;
  const showFolio = !!customization?.show_pagination;

  const showDisplacement = flagOn(customization?.show_displacement) && hasDisplacement(quote);
  const showGifts = flagOn(customization?.show_gifts) && hasGifts(quote);
  const validUntil = formatValidUntil(quote, locale, timezone);

  // ── Paginação do Escopo ── (ver Vanguarda; total dinâmico).
  const scopeRows = buildScopeRows(d, {
    services: t.groupServices,
    materials: t.groupMaterials,
    items: t.groupItems,
  });
  const scopePages = paginateScope(scopeRows, SCOPE_ITEMS_PER_PAGE, SCOPE_ITEMS_FIRST_PAGE);
  const totalPages = 2 + scopePages.length + 2;
  const SCOPE_FIRST_PAGE = 3;
  const investPage = SCOPE_FIRST_PAGE + scopePages.length;
  const closingPage = investPage + 1;

  // Todas as folhas do Prisma têm fundo escuro → paginação sempre clara.
  const Folio = ({ page }: { page: number }) =>
    showFolio ? <span style={pageFolioStyle(true)}>{folioLabel(page, totalPages, t.folioPage)}</span> : null;

  // Data exibida na capa: validade (se houver) senão emissão, no locale da empresa.
  const validOrIssue =
    validUntil ?? formatDateTime(quote.created_at, locale, timezone, { year: 'numeric', month: 'long', day: '2-digit', hour: undefined, minute: undefined });

  const renderGroup = (g: ScopeGroup) => (
    <div className="mb-9" key={`${g.key}-${g.rows[0]?.num}`}>
      <p className="text-[11px] font-bold uppercase tracking-[0.28em] text-white/45 mb-4">
        {g.label}{g.continued ? t.continuedShort : ''}
      </p>
      <div>
        {g.rows.map(({ item, num }) => (
          <div
            key={num}
            className="flex justify-between items-start gap-4 py-4"
            style={{ borderTop: '1px solid rgba(255,255,255,0.1)', ...colorAdjust }}
          >
            <div className="flex items-start gap-4 min-w-0">
              <span className="text-[11px] font-mono text-white/35 pt-0.5 shrink-0 tabular-nums">
                {String(num).padStart(2, '0')}
              </span>
              <div className="min-w-0">
                <p className="font-semibold text-sm text-white leading-snug">{item.description}</p>
                {item.details && (
                  <p className="text-xs text-white/45 mt-1 leading-snug whitespace-pre-wrap">{item.details}</p>
                )}
                <p className="text-xs text-white/35 mt-1">{item.quantity} un × {money(item.unit_price || 0)}</p>
              </div>
            </div>
            <p className="font-bold text-base tabular-nums whitespace-nowrap text-white">
              {money(item.total_price || 0)}
            </p>
          </div>
        ))}
      </div>
      {g.isGroupEnd && (
        <div className="flex justify-end mt-3 pt-3" style={{ borderTop: '1px solid rgba(255,255,255,0.1)', ...colorAdjust }}>
          <div className="text-xs">
            <span className="uppercase tracking-wider text-white/40 font-bold mr-3">{t.rowSubtotal}</span>
            <span className="font-bold tabular-nums text-white/85">{money(g.groupSubtotal)}</span>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div
      className="pr-root mx-auto"
      style={{ fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif", maxWidth: '794px', width: '100%', background: '#000' }}
    >
      <style>{`
        .pr-page { width: 100%; max-width: 794px; min-height: 1123px; position: relative; background: #060606; color: #fff; padding: 56px; overflow: hidden; }
        .pr-page + .pr-page { border-top: 1px solid rgba(255,255,255,0.06); }
        @media (max-width: 640px) { .pr-page { padding: 30px 22px; min-height: 0; } }
        @media print {
          .pr-page { min-height: 1123px; }
          .pr-page + .pr-page { break-before: page; page-break-before: always; border-top: 0; }
        }
      `}</style>

      {/* ====================== CAPA ====================== */}
      <section
        className="pr-page flex flex-col"
        style={{
          backgroundColor: '#000',
          backgroundImage: "url('/images/proposal-bg-prisma.jpg')",
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
          ...colorAdjust,
        }}
      >
        {/* Topo: data (esq) + logo (dir) */}
        <div className="relative z-10 flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-white/45">{t.dateLabel}</p>
            <p className="text-sm font-semibold text-white/85 mt-1">{validOrIssue}</p>
            <p className="text-[11px] text-white/40 mt-0.5">{t.proposalFooter} {quote.quote_number}</p>
          </div>
          {d.logoUrl ? (
            <img src={d.logoUrl} alt={d.companyName} className="h-11 w-auto object-contain shrink-0" crossOrigin="anonymous" />
          ) : (
            <p className="text-sm font-bold text-white/85 text-right max-w-[160px]">{d.companyName}</p>
          )}
        </div>

        {/* Título central enorme em maiúsculas */}
        <div className="relative z-10 flex-1 flex flex-col justify-center text-center my-16">
          <h1
            className="font-black uppercase text-white"
            style={{ fontSize: 'clamp(52px, 14vw, 104px)', lineHeight: 0.9, letterSpacing: '-0.02em' }}
          >
            {t.proposalLabel}<br />{t.proposalTitle}
          </h1>
          <p className="mt-7 text-[11px] sm:text-xs font-semibold uppercase tracking-[0.34em] text-white/50 max-w-[460px] mx-auto leading-relaxed">
            {d.subjectLine}
          </p>
        </div>

        {/* Rodapé: apresentado para / por */}
        <div className="relative z-10 mt-auto grid grid-cols-2 gap-6">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-white/45">{t.presentedTo}</p>
            <p className="font-bold text-base mt-1.5 text-white leading-tight">{d.clientName}</p>
            {d.clientDoc && <p className="text-[11px] text-white/40 mt-0.5">{d.clientDoc}</p>}
          </div>
          <div className="text-right">
            <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-white/45">{t.presentedByColon}</p>
            <p className="font-bold text-base mt-1.5 text-white leading-tight">{d.companyName}</p>
            {company?.phone && <p className="text-[11px] text-white/40 mt-0.5">{company.phone}</p>}
          </div>
        </div>
        <Folio page={1} />
      </section>

      {/* ====================== APRESENTAÇÃO ====================== */}
      <section className="pr-page">
        <PrKicker label={t.kickerAbout} />
        <h2 className="text-3xl sm:text-4xl font-black tracking-tight mt-3 text-white uppercase">{t.headingAbout}</h2>
        <p className="text-[15px] text-white/65 leading-[1.9] mt-6 max-w-[620px]">
          {t.aboutText1}{t.aboutText1 ? ' ' : ''}<span className="font-semibold text-white">{d.companyName}</span>{' '}
          {t.aboutText2}{' '}
          <span className="font-semibold text-white">{d.clientName}</span>{t.aboutText3}
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-px mt-12" style={{ background: 'rgba(255,255,255,0.1)', ...colorAdjust }}>
          {[
            { t: t.valueQuality, d: t.valueQualityDesc },
            { t: t.valueTransparency, d: t.valueTransparencyDescShort },
            { t: t.valueCommitment, d: t.valueCommitmentDescShort },
          ].map((c) => (
            <div key={c.t} className="p-6" style={{ background: '#060606', ...colorAdjust }}>
              <p className="font-bold text-sm text-white uppercase tracking-wide">{c.t}</p>
              <p className="text-xs text-white/50 mt-2 leading-relaxed">{c.d}</p>
            </div>
          ))}
        </div>

        <div className="mt-12 pt-6" style={{ borderTop: '1px solid rgba(255,255,255,0.12)', ...colorAdjust }}>
          <p className="text-[10px] uppercase tracking-[0.24em] text-white/45 font-bold mb-3">{t.contactLabel}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-1.5 gap-x-6 text-sm text-white/80">
            {company?.phone && <p>{company.phone}</p>}
            {company?.email && <p>{company.email}</p>}
            {d.addressLine && <p className="sm:col-span-2 text-white/45 text-xs leading-relaxed">{d.addressLine}</p>}
          </div>
        </div>
        <Folio page={2} />
      </section>

      {/* ====================== ESCOPO (1..N folhas) ====================== */}
      {scopePages.map((sp) => (
        <section className="pr-page" key={`scope-${sp.index}`}>
          <PrKicker label={t.kickerScope} />
          <h2 className="text-3xl sm:text-4xl font-black tracking-tight mt-3 text-white uppercase">
            {t.headingScopeShort}{sp.index > 0 ? t.continuedShort : ''}
          </h2>
          <div className="mt-10">
            {sp.groups.map(renderGroup)}
          </div>
          <Folio page={SCOPE_FIRST_PAGE + sp.index} />
        </section>
      ))}

      {/* ====================== INVESTIMENTO ====================== */}
      <section className="pr-page flex flex-col">
        <PrKicker label={t.kickerInvestment} />
        <h2 className="text-3xl sm:text-4xl font-black tracking-tight mt-3 text-white uppercase">{t.headingInvestment}</h2>

        <div className="mt-10">
          {((quote.discount_amount ?? 0) > 0 || showDisplacement) && (
            <div className="space-y-2 pb-5 mb-1">
              {(quote.discount_amount ?? 0) > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-white/55">{t.rowSubtotal}</span>
                  <span className="text-white/80 tabular-nums">{money(quote.subtotal ?? 0)}</span>
                </div>
              )}
              {showDisplacement && (
                <div className="flex justify-between text-sm">
                  <span className="text-white/55">
                    {t.rowDisplacement}{(quote.distance_km ?? 0) > 0 ? ` (${quote.distance_km} km)` : ''}
                  </span>
                  <span className="text-white/80 tabular-nums">{money(quote.displacement_cost ?? 0)}</span>
                </div>
              )}
              {(quote.discount_amount ?? 0) > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-white/55">{t.rowDiscount}</span>
                  <span className="tabular-nums font-semibold text-white">− {money(quote.discount_amount ?? 0)}</span>
                </div>
              )}
            </div>
          )}
          <div className="pt-7" style={{ borderTop: '2px solid #fff', ...colorAdjust }}>
            <div className="flex items-end justify-between flex-wrap gap-2">
              <div>
                <p className="text-[10px] uppercase tracking-[0.25em] text-white/50 font-bold">{t.totalLabel}</p>
                {!!installments && installments > 1 && (
                  <p className="text-xs text-white/65 mt-2">
                    {t.installmentsText
                      .replace('{n}', String(installments))
                      .replace('{value}', money((quote.total_value ?? 0) / installments))}
                  </p>
                )}
              </div>
              <p className="font-black tabular-nums tracking-tight leading-none text-white" style={{ fontSize: 'clamp(36px, 9vw, 56px)' }}>
                {money(quote.total_value ?? 0)}
              </p>
            </div>
            {/* Fio iridescente sutil (acento) */}
            <div className="h-1 w-full rounded-full mt-6" style={{ background: IRID, ...colorAdjust }} />
          </div>
        </div>

        {validUntil && (
          <p className="mt-5 text-xs text-white/50">
            {t.validUntil} <span className="font-semibold text-white/80">{validUntil}</span>.
          </p>
        )}

        {showGifts && (
          <div className="mt-7 pt-5" style={{ borderTop: '1px solid rgba(255,255,255,0.12)', ...colorAdjust }}>
            <p className="text-[10px] font-bold uppercase text-white/45 tracking-[0.18em] mb-2">{t.giftsLabel}</p>
            <p className="text-sm text-white/70 leading-relaxed">
              {t.giftsBody}
            </p>
          </div>
        )}

        {quote.terms && (
          <div className="mt-9 pt-5" style={{ borderTop: '1px solid rgba(255,255,255,0.12)', ...colorAdjust }}>
            <p className="text-[10px] font-bold uppercase text-white/45 tracking-[0.18em] mb-2">{t.termsLabel}</p>
            <p className="text-sm text-white/70 whitespace-pre-wrap leading-relaxed">{quote.terms}</p>
          </div>
        )}
        {quote.notes && (
          <div className="mt-6 pt-5" style={{ borderTop: '1px solid rgba(255,255,255,0.12)', ...colorAdjust }}>
            <p className="text-[10px] font-bold uppercase text-white/45 tracking-[0.18em] mb-2">{t.notesLabel}</p>
            <p className="text-sm text-white/70 whitespace-pre-wrap leading-relaxed">{quote.notes}</p>
          </div>
        )}
        <Folio page={investPage} />
      </section>

      {/* ====================== ENCERRAMENTO ====================== */}
      <section className="pr-page flex flex-col items-center justify-center text-center">
        <div className="h-1 w-20 rounded-full mb-9" style={{ background: IRID, ...colorAdjust }} />
        <h2 className="font-black uppercase tracking-tight text-white" style={{ fontSize: 'clamp(44px, 10vw, 64px)' }}>{t.thankYouNoPunct}</h2>
        <p className="text-white/55 text-lg mt-5 max-w-md leading-relaxed">
          {t.closingBody}
        </p>

        <div className="mt-12 pt-6 px-2" style={{ borderTop: '1px solid rgba(255,255,255,0.12)', ...colorAdjust }}>
          {d.logoUrl ? (
            <img src={d.logoUrl} alt={d.companyName} className="h-11 w-auto object-contain mx-auto mb-3" crossOrigin="anonymous" />
          ) : (
            <p className="font-black text-xl text-white uppercase">{d.companyName}</p>
          )}
          <div className="text-sm text-white/55 space-y-0.5 mt-2">
            {company?.phone && <p>{company.phone}</p>}
            {company?.email && <p>{company.email}</p>}
          </div>
        </div>

        <p className="text-[11px] text-white/30 mt-10 tracking-wider">
          {t.proposalFooter} {quote.quote_number} · {d.companyName}
        </p>
        <Folio page={closingPage} />
      </section>
    </div>
  );
}

function PrKicker({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: IRID, ...colorAdjust }} />
      <p className="text-[11px] font-bold uppercase tracking-[0.28em] text-white/55">{label}</p>
    </div>
  );
}
